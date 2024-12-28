// src/plugins/SttTtsPlugin.ts

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { Plugin, AudioDataWithUser } from '../types';
import { Space } from '../core/Space';
import { JanusClient } from '../core/JanusClient';
import OpenAI from 'openai';

interface PluginConfig {
  openAiApiKey?: string; // for STT & ChatGPT
  elevenLabsApiKey?: string; // for TTS
  sttLanguage?: string; // e.g. "en" for Whisper
  gptModel?: string; // e.g. "gpt-3.5-turbo"
  silenceThreshold?: number; // amplitude threshold for ignoring silence
}

/**
 * MVP plugin for speech-to-text (OpenAI) + conversation + TTS (ElevenLabs)
 * Approach:
 *   - Collect each speaker's unmuted PCM in a memory buffer (only if above silence threshold)
 *   - On speaker mute -> flush STT -> GPT -> TTS -> push to Janus
 */
export class SttTtsPlugin implements Plugin {
  private space?: Space;
  private janus?: JanusClient;

  // OpenAI + ElevenLabs
  private openAiApiKey?: string;
  private openAiClient?: OpenAI;
  private elevenLabsApiKey?: string;

  private sttLanguage = 'en';
  private gptModel = 'gpt-3.5-turbo';

  /**
   * userId => arrayOfChunks (PCM Int16)
   */
  private pcmBuffers = new Map<string, Int16Array[]>();

  /**
   * Track mute states: userId => boolean (true=unmuted)
   */
  private speakerUnmuted = new Map<string, boolean>();

  /**
   * For ignoring near-silence frames (if amplitude < threshold)
   */
  private silenceThreshold = 50; // default amplitude threshold

  onAttach(space: Space) {
    console.log('[SttTtsPlugin] onAttach => space was attached');
  }

  init(params: { space: Space; pluginConfig?: Record<string, any> }): void {
    console.log(
      '[SttTtsPlugin] init => Space fully ready. Subscribing to events.',
    );

    this.space = params.space;
    this.janus = (this.space as any)?.janusClient as JanusClient | undefined;

    const config = params.pluginConfig as PluginConfig;
    this.openAiApiKey = config?.openAiApiKey;
    this.elevenLabsApiKey = config?.elevenLabsApiKey;
    if (config?.sttLanguage) this.sttLanguage = config.sttLanguage;
    if (config?.gptModel) this.gptModel = config.gptModel;
    if (typeof config?.silenceThreshold === 'number') {
      this.silenceThreshold = config.silenceThreshold;
    }
    console.log('[SttTtsPlugin] Plugin config =>', config);

    // Create official OpenAI client if we have an API key
    if (this.openAiApiKey) {
      this.openAiClient = new OpenAI({ apiKey: this.openAiApiKey });
      console.log('[SttTtsPlugin] OpenAI client initialized');
    }

    // Listen for mute state changes to trigger STT flush
    this.space.on(
      'muteStateChanged',
      (evt: { userId: string; muted: boolean }) => {
        console.log('[SttTtsPlugin] Speaker muteStateChanged =>', evt);
        if (evt.muted) {
          // speaker just got muted => flush STT
          this.handleMute(evt.userId).catch((err) =>
            console.error('[SttTtsPlugin] handleMute error =>', err),
          );
        } else {
          // unmuted => start buffering
          this.speakerUnmuted.set(evt.userId, true);
          if (!this.pcmBuffers.has(evt.userId)) {
            this.pcmBuffers.set(evt.userId, []);
          }
        }
      },
    );
  }

  /**
   * Called whenever we receive PCM from a speaker
   */
  onAudioData(data: AudioDataWithUser): void {
    // Skip if speaker is muted or not tracked
    if (!this.speakerUnmuted.get(data.userId)) return;

    // Optional: detect silence
    let maxVal = 0;
    for (let i = 0; i < data.samples.length; i++) {
      const val = Math.abs(data.samples[i]);
      if (val > maxVal) maxVal = val;
    }
    if (maxVal < this.silenceThreshold) {
      // It's near-silence => skip
      return;
    }

    // Add chunk
    let arr = this.pcmBuffers.get(data.userId);
    if (!arr) {
      arr = [];
      this.pcmBuffers.set(data.userId, arr);
    }
    arr.push(data.samples);
  }

  /**
   * On speaker mute => flush STT => GPT => TTS => push to Janus
   */
  private async handleMute(userId: string): Promise<void> {
    this.speakerUnmuted.set(userId, false);
    const chunks = this.pcmBuffers.get(userId) || [];
    this.pcmBuffers.set(userId, []); // reset

    if (!chunks.length) {
      console.log('[SttTtsPlugin] No audio chunks for user =>', userId);
      return;
    }
    console.log(
      `[SttTtsPlugin] Flushing STT buffer for user=${userId}, total chunks=${chunks.length}`,
    );

    // 1) Merge chunks
    const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
    const merged = new Int16Array(totalLen);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.length;
    }

    // 2) Convert PCM -> WAV (48kHz) for STT
    const wavPath = await this.convertPcmToWav(merged, 48000);
    console.log('[SttTtsPlugin] WAV ready =>', wavPath);

    // 3) STT with OpenAI Whisper
    const sttText = await this.transcribeWithOpenAI(wavPath, this.sttLanguage);
    fs.unlinkSync(wavPath);
    if (!sttText.trim()) {
      console.log('[SttTtsPlugin] No speech recognized for user =>', userId);
      return;
    }
    console.log(`[SttTtsPlugin] STT => user=${userId}, text="${sttText}"`);

    // 4) GPT
    const replyText = await this.askChatGPT(sttText);
    console.log(`[SttTtsPlugin] GPT => user=${userId}, reply="${replyText}"`);

    // 5) TTS => returns MP3
    const ttsAudio = await this.elevenLabsTts(replyText);
    console.log('[SttTtsPlugin] TTS => got MP3 size=', ttsAudio.length);

    // 6) Convert MP3 -> PCM (48kHz, mono)
    const pcm = await this.convertMp3ToPcm(ttsAudio, 48000);
    console.log(
      '[SttTtsPlugin] TTS => converted to PCM => frames=',
      pcm.length,
    );

    // 7) Push frames to Janus
    if (this.janus) {
      await this.streamToJanus(pcm, 48000);
      console.log('[SttTtsPlugin] TTS => done streaming to space');
    }
  }

  /**
   * Convert Int16 PCM -> WAV using ffmpeg
   */
  private convertPcmToWav(
    samples: Int16Array,
    sampleRate: number,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const tmpPath = path.resolve('/tmp', `stt-${Date.now()}.wav`);
      const ff = spawn('ffmpeg', [
        '-f',
        's16le',
        '-ar',
        sampleRate.toString(),
        '-ac',
        '1',
        '-i',
        'pipe:0',
        '-y',
        tmpPath,
      ]);
      ff.stdin.write(Buffer.from(samples.buffer));
      ff.stdin.end();
      ff.on('close', (code) => {
        if (code === 0) resolve(tmpPath);
        else reject(new Error(`ffmpeg error code=${code}`));
      });
    });
  }

  /**
   * OpenAI Whisper STT
   */
  private async transcribeWithOpenAI(wavPath: string, language: string) {
    if (!this.openAiClient) {
      throw new Error('[SttTtsPlugin] No OpenAI client available');
    }
    try {
      console.log('[SttTtsPlugin] Transcribe =>', wavPath);
      const fileStream = fs.createReadStream(wavPath);

      const resp = await this.openAiClient.audio.transcriptions.create({
        file: fileStream,
        model: 'whisper-1',
        language: language,
        temperature: 0,
      });

      const text = resp.text?.trim() || '';
      console.log('[SttTtsPlugin] Transcription =>', text);
      return text;
    } catch (err) {
      console.error('[SttTtsPlugin] OpenAI STT Error =>', err);
      throw new Error('OpenAI STT failed');
    }
  }

  /**
   * Simple ChatGPT call
   */
  private async askChatGPT(userText: string): Promise<string> {
    if (!this.openAiApiKey) {
      throw new Error('[SttTtsPlugin] No OpenAI API key for ChatGPT');
    }
    const url = 'https://api.openai.com/v1/chat/completions';
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.openAiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.gptModel,
        messages: [
          { role: 'system', content: 'You are a helpful AI assistant.' },
          { role: 'user', content: userText },
        ],
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(
        `[SttTtsPlugin] ChatGPT error => ${resp.status} ${errText}`,
      );
    }
    const json = await resp.json();
    const reply = json.choices?.[0]?.message?.content || '';
    return reply.trim();
  }

  /**
   * ElevenLabs TTS => returns MP3 Buffer
   */
  private async elevenLabsTts(text: string): Promise<Buffer> {
    if (!this.elevenLabsApiKey) {
      throw new Error('[SttTtsPlugin] No ElevenLabs API key');
    }
    const voiceId = '21m00Tcm4TlvDq8ikWAM'; // example
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': this.elevenLabsApiKey,
      },
      body: JSON.stringify({
        text,
        voice_settings: { stability: 0.4, similarity_boost: 0.8 },
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(
        `[SttTtsPlugin] ElevenLabs TTS error => ${resp.status} ${errText}`,
      );
    }
    const arrayBuf = await resp.arrayBuffer();
    return Buffer.from(arrayBuf);
  }

  /**
   * Convert MP3 => PCM via ffmpeg
   */
  private convertMp3ToPcm(
    mp3Buf: Buffer,
    outRate: number,
  ): Promise<Int16Array> {
    return new Promise((resolve, reject) => {
      const ff = spawn('ffmpeg', [
        '-i',
        'pipe:0',
        '-f',
        's16le',
        '-ar',
        outRate.toString(),
        '-ac',
        '1',
        'pipe:1',
      ]);
      let raw = Buffer.alloc(0);
      ff.stdout.on('data', (chunk: Buffer) => {
        raw = Buffer.concat([raw, chunk]);
      });
      ff.stderr.on('data', () => {
        /* ignore ffmpeg logs */
      });
      ff.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`ffmpeg error code=${code}`));
          return;
        }
        const samples = new Int16Array(
          raw.buffer,
          raw.byteOffset,
          raw.byteLength / 2,
        );
        resolve(samples);
      });
      ff.stdin.write(mp3Buf);
      ff.stdin.end();
    });
  }

  /**
   * Push PCM back to Janus in small frames
   * We'll do 10ms @48k => 960 samples per frame
   */
  private async streamToJanus(
    samples: Int16Array,
    sampleRate: number,
  ): Promise<void> {
    // 10 ms => 480 samples @48k
    const FRAME_SIZE = 480;

    for (
      let offset = 0;
      offset + FRAME_SIZE <= samples.length;
      offset += FRAME_SIZE
    ) {
      // Option 1: subarray + .set
      const frame = new Int16Array(FRAME_SIZE);
      frame.set(samples.subarray(offset, offset + FRAME_SIZE));

      this.janus?.pushLocalAudio(frame, sampleRate, 1);
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  cleanup(): void {
    console.log('[SttTtsPlugin] cleanup => releasing resources');
    this.pcmBuffers.clear();
    this.speakerUnmuted.clear();
  }
}
