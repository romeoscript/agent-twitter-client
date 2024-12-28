// src/core/JanusClient.ts

import { EventEmitter } from 'events';
import wrtc from '@roamhq/wrtc';
const { RTCPeerConnection, MediaStream } = wrtc;
import { JanusAudioSink, JanusAudioSource } from './JanusAudioSource';
import type { AudioDataWithUser, TurnServersInfo } from '../types';

interface JanusConfig {
  webrtcUrl: string;
  roomId: string;
  credential: string;
  userId: string;
  streamName: string;
  turnServers: TurnServersInfo;
}

/**
 * This class is in charge of the Janus session, handle,
 * joining the videoroom, and polling events.
 */
export class JanusClient extends EventEmitter {
  private sessionId?: number;
  private handleId?: number;
  private publisherId?: number;
  private pc?: RTCPeerConnection;
  private localAudioSource?: JanusAudioSource;
  private pollActive = false;
  private eventWaiters: Array<{
    predicate: (evt: any) => boolean;
    resolve: (value: any) => void;
    reject: (error: Error) => void;
  }> = [];
  private subscribers = new Map<
    string,
    {
      handleId: number;
      pc: RTCPeerConnection;
    }
  >();

  constructor(private readonly config: JanusConfig) {
    super();
  }

  async initialize() {
    // 1) Create session
    this.sessionId = await this.createSession();

    // 2) Attach plugin
    this.handleId = await this.attachPlugin();

    // 3) Start polling events right now
    this.pollActive = true;
    this.startPolling();

    // 4) Create room
    await this.createRoom();

    // 3) Join room
    this.publisherId = await this.joinRoom();

    // 4) Create local RTCPeerConnection
    this.pc = new RTCPeerConnection({
      iceServers: [
        {
          urls: this.config.turnServers.uris,
          username: this.config.turnServers.username,
          credential: this.config.turnServers.password,
        },
      ],
    });
    this.setupPeerEvents();

    this.enableLocalAudio();
    // 6) Do the initial configure -> generate Offer -> setLocalDesc -> send -> setRemoteDesc
    await this.configurePublisher();

    console.log('[JanusClient] Initialization complete');
  }

  public async subscribeSpeaker(userId: string): Promise<void> {
    console.log('[JanusClient] subscribeSpeaker => userId=', userId);

    // 1) Attach plugin as subscriber
    const subscriberHandleId = await this.attachPlugin();
    console.log('[JanusClient] subscriber handle =>', subscriberHandleId);

    // 2) Wait for an event with "publishers" to discover feedId
    //    We do *not* check sender === subscriberHandleId because Hydra
    //    might send it from the main handle or another handle.
    const publishersEvt = await this.waitForJanusEvent(
      (e) =>
        e.janus === 'event' &&
        e.plugindata?.plugin === 'janus.plugin.videoroom' &&
        e.plugindata?.data?.videoroom === 'event' &&
        Array.isArray(e.plugindata?.data?.publishers) &&
        e.plugindata?.data?.publishers.length > 0,
      8000,
      'discover feed_id from "publishers"',
    );

    // Extract the feedId from the first publisher whose 'display' or 'periscope_user_id' = userId
    // (in your logs, 'display' or 'periscope_user_id' is the actual user)
    const list = publishersEvt.plugindata.data.publishers as any[];
    const pub = list.find(
      (p) => p.display === userId || p.periscope_user_id === userId,
    );
    if (!pub) {
      throw new Error(
        `[JanusClient] subscribeSpeaker => No publisher found for userId=${userId}`,
      );
    }
    const feedId = pub.id;
    console.log('[JanusClient] found feedId =>', feedId);
    this.emit('subscribedSpeaker', { userId, feedId });

    // 3) "join" as subscriber with "streams: [{ feed, mid: '0', send: true }]"
    const joinBody = {
      request: 'join',
      room: this.config.roomId,
      periscope_user_id: this.config.userId,
      ptype: 'subscriber',
      streams: [
        {
          feed: feedId,
          mid: '0',
          send: true,
        },
      ],
    };
    await this.sendJanusMessage(subscriberHandleId, joinBody);

    // 4) Wait for "attached" + jsep.offer from *this subscriber handle*
    //    Now we do filter on e.sender === subscriberHandleId
    const attachedEvt = await this.waitForJanusEvent(
      (e) =>
        e.janus === 'event' &&
        e.sender === subscriberHandleId &&
        e.plugindata?.plugin === 'janus.plugin.videoroom' &&
        e.plugindata?.data?.videoroom === 'attached' &&
        e.jsep?.type === 'offer',
      8000,
      'subscriber attached + offer',
    );
    console.log('[JanusClient] subscriber => "attached" with offer');

    const offer = attachedEvt.jsep;

    // 5) Create subPc, setRemoteDescription(offer), createAnswer, setLocalDescription(answer)
    const subPc = new RTCPeerConnection({
      iceServers: [
        {
          urls: this.config.turnServers.uris,
          username: this.config.turnServers.username,
          credential: this.config.turnServers.password,
        },
      ],
    });

    // Ontrack => parse PCM via JanusAudioSink
    subPc.ontrack = (evt) => {
      console.log('[JanusClient] subscriber track =>', evt.track.kind);

      // TODO: REMOVE DEBUG
      // console.log(
      //   '[JanusClient] subscriber track => kind=',
      //   evt.track.kind,
      //   'readyState=',
      //   evt.track.readyState,
      //   'muted=',
      //   evt.track.muted,
      // );

      const sink = new JanusAudioSink(evt.track);
      sink.on('audioData', (frame) => {
        // TODO: REMOVE DEBUG
        // console.log(
        //   '[AudioSink] got an audio frame => sampleRate=',
        //   frame.sampleRate,
        //   'length=',
        //   frame.samples.length,
        // );
        // console.log(
        //   '[AudioSink] sampleRate=',
        //   frame.sampleRate,
        //   'channels=',
        //   frame.channelCount,
        // );
        // const { samples } = frame; // Int16Array
        // let maxVal = 0;
        // for (let i = 0; i < samples.length; i++) {
        //   const val = Math.abs(samples[i]);
        //   if (val > maxVal) maxVal = val;
        // }
        // console.log(`[AudioSink] userId=${userId}, maxAmplitude=${maxVal}`);

        this.emit('audioDataFromSpeaker', {
          userId,
          bitsPerSample: frame.bitsPerSample,
          sampleRate: frame.sampleRate,
          numberOfFrames: frame.numberOfFrames,
          channelCount: frame.channelCount,
          samples: frame.samples,
        } as AudioDataWithUser);
      });
    };

    await subPc.setRemoteDescription(offer);
    const answer = await subPc.createAnswer();
    await subPc.setLocalDescription(answer);

    // 6) Send "start" with jsep=answer
    await this.sendJanusMessage(
      subscriberHandleId,
      {
        request: 'start',
        room: this.config.roomId,
        periscope_user_id: this.config.userId,
      },
      answer,
    );
    console.log('[JanusClient] subscriber => done (user=', userId, ')');

    // Store for potential cleanup
    this.subscribers.set(userId, { handleId: subscriberHandleId, pc: subPc });
  }

  pushLocalAudio(samples: Int16Array, sampleRate: number, channels = 1) {
    if (!this.localAudioSource) {
      console.warn('[JanusClient] No localAudioSource; enabling now...');
      this.enableLocalAudio();
    }
    this.localAudioSource?.pushPcmData(samples, sampleRate, channels);
  }

  enableLocalAudio() {
    if (!this.pc) {
      console.warn('[JanusClient] No RTCPeerConnection');
      return;
    }
    if (this.localAudioSource) {
      console.log('[JanusClient] localAudioSource already active');
      return;
    }
    this.localAudioSource = new JanusAudioSource();
    const track = this.localAudioSource.getTrack();
    const localStream = new MediaStream();
    localStream.addTrack(track);
    this.pc.addTrack(track, localStream);
  }

  async stop() {
    console.log('[JanusClient] Stopping...');
    this.pollActive = false;
    // leave the room, etc.
    // close PC
    if (this.pc) {
      this.pc.close();
      this.pc = undefined;
    }
  }

  getSessionId() {
    return this.sessionId;
  }
  getHandleId() {
    return this.handleId;
  }
  getPublisherId() {
    return this.publisherId;
  }

  // ------------------- Private Methods --------------------

  private async createSession(): Promise<number> {
    const transaction = this.randomTid();
    const resp = await fetch(this.config.webrtcUrl, {
      method: 'POST',
      headers: {
        Authorization: this.config.credential,
        'Content-Type': 'application/json',
        Referer: 'https://x.com',
      },
      body: JSON.stringify({
        janus: 'create',
        transaction,
      }),
    });
    if (!resp.ok) throw new Error('[JanusClient] createSession failed');
    const json = await resp.json();
    if (json.janus !== 'success')
      throw new Error('[JanusClient] createSession invalid response');
    return json.data.id; // sessionId
  }

  private async attachPlugin(): Promise<number> {
    if (!this.sessionId) throw new Error('[JanusClient] no sessionId');

    const transaction = this.randomTid();
    const resp = await fetch(`${this.config.webrtcUrl}/${this.sessionId}`, {
      method: 'POST',
      headers: {
        Authorization: this.config.credential,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        janus: 'attach',
        plugin: 'janus.plugin.videoroom',
        transaction,
      }),
    });
    if (!resp.ok) throw new Error('[JanusClient] attachPlugin failed');
    const json = await resp.json();
    if (json.janus !== 'success')
      throw new Error('[JanusClient] attachPlugin invalid response');
    return json.data.id;
  }

  private async createRoom() {
    if (!this.sessionId || !this.handleId) {
      throw new Error('[JanusClient] No session/handle');
    }

    const transaction = this.randomTid();
    const body = {
      request: 'create',
      room: this.config.roomId,
      periscope_user_id: this.config.userId,
      audiocodec: 'opus',
      videocodec: 'h264',
      transport_wide_cc_ext: true,
      app_component: 'audio-room',
      h264_profile: '42e01f',
      dummy_publisher: false,
    };

    // Send the "create" request
    const resp = await fetch(
      `${this.config.webrtcUrl}/${this.sessionId}/${this.handleId}`,
      {
        method: 'POST',
        headers: {
          Authorization: this.config.credential,
          'Content-Type': 'application/json',
          Referer: 'https://x.com',
        },
        body: JSON.stringify({
          janus: 'message',
          transaction,
          body,
        }),
      },
    );

    if (!resp.ok) {
      throw new Error(`[JanusClient] createRoom failed => ${resp.status}`);
    }

    const json = await resp.json();
    console.log('[JanusClient] createRoom =>', JSON.stringify(json));

    // Check if Janus responded with videoroom:"created"
    if (json.janus === 'error') {
      throw new Error(
        `[JanusClient] createRoom error => ${
          json.error?.reason || 'Unknown error'
        }`,
      );
    }

    if (json.plugindata?.data?.videoroom !== 'created') {
      throw new Error(
        `[JanusClient] unexpected createRoom response => ${JSON.stringify(
          json,
        )}`,
      );
    }

    console.log(
      `[JanusClient] Room '${this.config.roomId}' created successfully`,
    );
  }

  private async joinRoom(): Promise<number> {
    if (!this.sessionId || !this.handleId)
      throw new Error('[JanusClient] no session/handle');

    // Wait for the event that indicates we joined
    // Typically:  evt.janus === 'event' && evt.plugindata?.data?.videoroom === 'joined'
    const evtPromise = this.waitForJanusEvent(
      (e) => {
        return (
          e.janus === 'event' &&
          e.plugindata?.plugin === 'janus.plugin.videoroom' &&
          e.plugindata?.data?.videoroom === 'joined'
        );
      },
      12000,
      'Host Joined Event',
    );

    const body = {
      request: 'join',
      room: this.config.roomId,
      ptype: 'publisher',
      display: this.config.userId,
      periscope_user_id: this.config.userId,
    };
    await this.sendJanusMessage(this.handleId, body);

    const evt = await evtPromise;

    const publisherId = evt.plugindata.data.id;
    console.log('[JanusClient] joined room => publisherId=', publisherId);
    return publisherId;
  }

  private async configurePublisher() {
    if (!this.pc || !this.sessionId || !this.handleId) return;

    console.log('[JanusClient] createOffer...');
    const offer = await this.pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: false,
    });
    await this.pc.setLocalDescription(offer);

    console.log('[JanusClient] sending configure with JSEP...');
    await this.sendJanusMessage(
      this.handleId,
      {
        request: 'configure',
        room: this.config.roomId,
        periscope_user_id: this.config.userId,
        session_uuid: '',
        stream_name: this.config.streamName,
        vidman_token: this.config.credential,
      },
      offer,
    );

    console.log('[JanusClient] waiting for answer...');
    // In a real scenario, we do an event-based wait for jsep.type === 'answer'.
    // For MVP, let's do a poll in handleJanusEvent for that "answer" and setRemoteDesc
  }

  private async sendJanusMessage(
    handleId: number,
    body: any,
    jsep?: any,
  ): Promise<void> {
    if (!this.sessionId) {
      throw new Error('[JanusClient] No session');
    }
    const transaction = this.randomTid();

    const resp = await fetch(
      `${this.config.webrtcUrl}/${this.sessionId}/${handleId}`,
      {
        method: 'POST',
        headers: {
          Authorization: this.config.credential,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          janus: 'message',
          transaction,
          body,
          jsep,
        }),
      },
    );

    if (!resp.ok) {
      throw new Error(
        '[JanusClient] sendJanusMessage failed => ' + resp.status,
      );
    }
  }

  private startPolling() {
    console.log('[JanusClient] Starting polling...');
    const doPoll = async () => {
      if (!this.pollActive || !this.sessionId) {
        console.log('[JanusClient] Polling stopped');
        return;
      }
      try {
        const url = `${this.config.webrtcUrl}/${
          this.sessionId
        }?maxev=1&_=${Date.now()}`;
        const resp = await fetch(url, {
          headers: { Authorization: this.config.credential },
        });
        if (resp.ok) {
          const event = await resp.json();
          this.handleJanusEvent(event);
        } else {
          console.log('[JanusClient] poll error =>', resp.status);
        }
      } catch (err) {
        console.error('[JanusClient] poll exception =>', err);
      }
      setTimeout(doPoll, 500);
    };
    doPoll();
  }

  private handleJanusEvent(evt: any) {
    // TODO: REMOVE DEBUG
    // console.log('[JanusClient] handleJanusEvent =>', JSON.stringify(evt));

    if (!evt.janus) return;
    if (evt.janus === 'keepalive') {
      return;
    }
    if (evt.janus === 'webrtcup') {
      console.log('[JanusClient] webrtcup =>', evt.sender);
    }
    if (evt.jsep && evt.jsep.type === 'answer') {
      this.onReceivedAnswer(evt.jsep);
    }
    if (evt.plugindata?.data?.id) {
      // e.g. publisherId
      this.publisherId = evt.plugindata.data.id;
    }
    if (evt.error) {
      console.error('[JanusClient] Janus error =>', evt.error.reason);
      this.emit('error', new Error(evt.error.reason));
    }

    for (let i = 0; i < this.eventWaiters.length; i++) {
      const waiter = this.eventWaiters[i];
      if (waiter.predicate(evt)) {
        // remove from the array
        this.eventWaiters.splice(i, 1);
        // resolve the promise
        waiter.resolve(evt);
        break; // important: only resolve one waiter
      }
    }
    // Add more logic if needed
  }

  private async onReceivedAnswer(answer: any) {
    if (!this.pc) return;
    console.log('[JanusClient] got answer => setRemoteDescription');
    await this.pc.setRemoteDescription(answer);
  }

  private setupPeerEvents() {
    if (!this.pc) return;

    this.pc.addEventListener('iceconnectionstatechange', () => {
      // TODO: REMOVE DEBUG
      // console.log('[JanusClient] ICE state =>', this.pc?.iceConnectionState);

      if (this.pc?.iceConnectionState === 'failed') {
        this.emit('error', new Error('ICE connection failed'));
      }
    });

    this.pc.addEventListener('track', (evt) => {
      console.log('[JanusClient] track =>', evt.track.kind);
      // Here you can attach a JanusAudioSink to parse PCM frames
    });
  }

  private randomTid() {
    return Math.random().toString(36).slice(2, 10);
  }

  /**
   * Allows code to wait for a specific Janus event that matches a predicate
   */
  private async waitForJanusEvent(
    predicate: (evt: any) => boolean,
    timeoutMs = 5000,
    description = 'some event',
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        reject,
      };
      this.eventWaiters.push(waiter);

      setTimeout(() => {
        const idx = this.eventWaiters.indexOf(waiter);
        if (idx !== -1) {
          this.eventWaiters.splice(idx, 1);
          console.log(
            `[JanusClient] waitForJanusEvent => timed out waiting for: ${description}`,
          );
          reject(
            new Error(
              `[JanusClient] waitForJanusEvent (expecting "${description}") timed out after ${timeoutMs}ms`,
            ),
          );
        }
      }, timeoutMs);
    });
  }

  public async destroyRoom(): Promise<void> {
    if (!this.sessionId || !this.handleId) {
      console.warn('[JanusClient] destroyRoom => no session/handle');
      return;
    }
    if (!this.config.roomId || !this.config.userId) {
      console.warn('[JanusClient] destroyRoom => no roomId/userId');
      return;
    }

    const transaction = this.randomTid();
    const body = {
      request: 'destroy',
      room: this.config.roomId,
      periscope_user_id: this.config.userId,
    };

    console.log('[JanusClient] destroying room =>', body);
    const resp = await fetch(
      `${this.config.webrtcUrl}/${this.sessionId}/${this.handleId}`,
      {
        method: 'POST',
        headers: {
          Authorization: this.config.credential,
          'Content-Type': 'application/json',
          Referer: 'https://x.com',
        },
        body: JSON.stringify({
          janus: 'message',
          transaction,
          body,
        }),
      },
    );

    if (!resp.ok) {
      throw new Error(`[JanusClient] destroyRoom failed => ${resp.status}`);
    }

    const json = await resp.json();
    console.log('[JanusClient] destroyRoom =>', JSON.stringify(json));
  }

  public async leaveRoom(): Promise<void> {
    if (!this.sessionId || !this.handleId) {
      console.warn('[JanusClient] leaveRoom => no session/handle');
      return;
    }
    const transaction = this.randomTid();
    const body = {
      request: 'leave',
      room: this.config.roomId,
      periscope_user_id: this.config.userId,
    };

    console.log('[JanusClient] leaving room =>', body);
    const resp = await fetch(
      `${this.config.webrtcUrl}/${this.sessionId}/${this.handleId}`,
      {
        method: 'POST',
        headers: {
          Authorization: this.config.credential,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          janus: 'message',
          transaction,
          body,
        }),
      },
    );
    if (!resp.ok) {
      throw new Error(`[JanusClient] leaveRoom => error code ${resp.status}`);
    }
    const json = await resp.json();
    console.log('[JanusClient] leaveRoom =>', JSON.stringify(json));
  }
}
