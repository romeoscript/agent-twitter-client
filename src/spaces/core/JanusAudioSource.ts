// src/core/audio.ts

import { EventEmitter } from 'events';
import wrtc from '@roamhq/wrtc';
const { nonstandard } = wrtc;
const { RTCAudioSource, RTCAudioSink } = nonstandard;

export class JanusAudioSource extends EventEmitter {
  private source: any;
  private track: MediaStreamTrack;

  constructor() {
    super();
    this.source = new RTCAudioSource();
    this.track = this.source.createTrack();
  }

  getTrack() {
    return this.track;
  }

  pushPcmData(samples: Int16Array, sampleRate: number, channels = 1) {
    this.source.onData({
      samples,
      sampleRate,
      bitsPerSample: 16,
      channelCount: channels,
      numberOfFrames: samples.length / channels,
    });
  }
}

export class JanusAudioSink extends EventEmitter {
  private sink: any;
  private active = true;

  constructor(track: MediaStreamTrack) {
    super();
    if (track.kind !== 'audio')
      throw new Error('JanusAudioSink must be an audio track');

    this.sink = new RTCAudioSink(track);

    this.sink.ondata = (frame: {
      samples: Int16Array;
      sampleRate: number;
      bitsPerSample: number;
      channelCount: number;
    }) => {
      if (!this.active) return;
      this.emit('audioData', frame);
    };
  }

  stop() {
    this.active = false;
    this.sink?.stop();
  }
}
