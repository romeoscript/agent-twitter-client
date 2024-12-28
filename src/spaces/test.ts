// src/test.ts

import 'dotenv/config';
import { Space } from './core/Space';
import { Scraper } from '../scraper'; // Adjust the path if needed
import { SpaceConfig } from './types';
import { MonitorAudioPlugin } from './plugins/MonitorAudioPlugin';
import { RecordToDiskPlugin } from './plugins/RecordToDiskPlugin';
import { SttTtsPlugin } from './plugins/SttTtsPlugin';

/**
 * Main test entry point
 */
async function main() {
  console.log('[Test] Starting...');

  // 1) Twitter login with your scraper
  const scraper = new Scraper();
  await scraper.login(
    process.env.TWITTER_USERNAME!,
    process.env.TWITTER_PASSWORD!,
  );

  // 2) Create Space instance
  const space = new Space(scraper);

  // const monitorPlugin = new MonitorAudioPlugin(1600);
  // space.use(monitorPlugin);
  const recordPlugin = new RecordToDiskPlugin();
  space.use(recordPlugin);
  const sttTtsPlugin = new SttTtsPlugin();
  space.use(sttTtsPlugin, {
    openAiApiKey: process.env.OPENAI_API_KEY,
    elevenLabsApiKey: process.env.ELEVENLABS_API_KEY,
  });

  const config: SpaceConfig = {
    mode: 'INTERACTIVE',
    title: 'Chunked beep test',
    description: 'Proper chunked beep to avoid .byteLength error',
    languages: ['en'],
  };


  // 3) Initialize the Space
  const broadcastInfo = await space.initialize(config);
  const spaceUrl = broadcastInfo.share_url.replace('broadcasts', 'spaces');
  console.log(
    '[Test] Space created =>',
    spaceUrl,
  );

  await scraper.sendTweet(`${config.title} ${spaceUrl}`);
  console.log('[Test] Tweet sent');

  // 4) Listen to events
  space.on('occupancyUpdate', (upd) => {
    console.log(
      '[Test] Occupancy =>',
      upd.occupancy,
      'participants =>',
      upd.totalParticipants,
    );
  });
  space.on('speakerRequest', async (req) => {
    console.log('[Test] Speaker request =>', req);
    await space.approveSpeaker(req.userId, req.sessionUUID);
  });
  space.on('error', (err) => {
    console.error('[Test] Space Error =>', err);
  });

  // ==================================================
  // BEEP GENERATION (500 ms) @16kHz => 8000 samples
  // ==================================================
  const beepDurationMs = 500;
  const sampleRate = 16000;
  const totalSamples = (sampleRate * beepDurationMs) / 1000; // 8000
  const beepFull = new Int16Array(totalSamples);

  // Sine wave: 440Hz, amplitude ~12000
  const freq = 440;
  const amplitude = 12000;
  for (let i = 0; i < beepFull.length; i++) {
    const t = i / sampleRate;
    beepFull[i] = amplitude * Math.sin(2 * Math.PI * freq * t);
  }

  const FRAME_SIZE = 160;
  /**
   * Send a beep by slicing beepFull into frames of 160 samples
   */
  async function sendBeep() {
    console.log('[Test] Starting beep...');
    for (let offset = 0; offset < beepFull.length; offset += FRAME_SIZE) {
      // subarray => simple "view"
      const portion = beepFull.subarray(offset, offset + FRAME_SIZE);

      // Make a real copy
      const frame = new Int16Array(FRAME_SIZE);
      frame.set(portion);

      // Now frame.length = 160, and frame.byteLength = 320
      space.pushAudio(frame, sampleRate);

      await new Promise((r) => setTimeout(r, 10));
    }
    console.log('[Test] Finished beep');
  }

  // 5) Send beep every 5s
  // setInterval(() => {
  //   sendBeep().catch((err) => console.error('[Test] beep error =>', err));
  // }, 5000);

  console.log('[Test] Space is running... press Ctrl+C to exit.');

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n[Test] Caught interrupt signal, stopping...');
    await space.stop();
    console.log('[Test] Space stopped. Bye!');
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[Test] Unhandled main error =>', err);
  process.exit(1);
});
