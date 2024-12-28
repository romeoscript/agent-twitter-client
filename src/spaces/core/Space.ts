// src/core/Space.ts

import { EventEmitter } from 'events';
import { ChatClient } from './ChatClient';
import { JanusClient } from './JanusClient';
import {
  getTurnServers,
  createBroadcast,
  publishBroadcast,
  authorizeToken,
  getRegion,
} from '../utils';
import type {
  SpaceConfig,
  BroadcastCreated,
  SpeakerRequest,
  OccupancyUpdate,
  GuestReaction,
  Plugin,
  AudioDataWithUser,
  PluginRegistration,
  SpeakerInfo,
} from '../types';
import { Scraper } from '../../scraper';

/**
 * This class orchestrates:
 * 1) Creation of the broadcast
 * 2) Instantiation of Janus + Chat
 * 3) Approve speakers, push audio, etc.
 */
export class Space extends EventEmitter {
  private janusClient?: JanusClient;
  private chatClient?: ChatClient;
  private authToken?: string;
  private broadcastInfo?: BroadcastCreated;
  private isInitialized = false;
  private plugins = new Set<PluginRegistration>();
  private speakers = new Map<string, SpeakerInfo>();

  constructor(private readonly scraper: Scraper) {
    super();
  }

  public use(plugin: Plugin, config?: Record<string, any>) {
    const registration: PluginRegistration = { plugin, config };
    this.plugins.add(registration);

    console.log('[Space] Plugin added =>', plugin.constructor.name);

    plugin.onAttach?.(this);

    if (this.isInitialized && plugin.init) {
      plugin.init({
        space: this,
        pluginConfig: config,
      });
    }

    return this;
  }

  /**
   * Main entry point
   */
  async initialize(config: SpaceConfig) {
    console.log('[Space] Initializing...');

    // 1) get Periscope cookie
    const cookie = await this.scraper.getPeriscopeCookie();

    // 2) get region
    const region = await getRegion();
    console.log('[Space] Got region =>', region);

    // 3) create broadcast
    console.log('[Space] Creating broadcast...');
    const broadcast = await createBroadcast({
      description: config.description,
      languages: config.languages,
      cookie,
      region,
    });
    this.broadcastInfo = broadcast;

    // 4) Authorize token if needed
    console.log('[Space] Authorizing token...');
    this.authToken = await authorizeToken(cookie);

    // 5) Get TURN servers
    console.log('[Space] Getting turn servers...');
    const turnServers = await getTurnServers(cookie);

    // 6) Create Janus client
    this.janusClient = new JanusClient({
      webrtcUrl: broadcast.webrtc_gw_url,
      roomId: broadcast.room_id,
      credential: broadcast.credential,
      userId: broadcast.broadcast.user_id,
      streamName: broadcast.stream_name,
      turnServers,
    });
    await this.janusClient.initialize();

    this.janusClient.on('audioDataFromSpeaker', (data: AudioDataWithUser) => {
      // console.log('[Space] Received PCM from speaker =>', data.userId);
      this.handleAudioData(data);
      // You can store or forward to a plugin, run STT, etc.
    });

    this.janusClient.on('subscribedSpeaker', ({ userId, feedId }) => {
      const speaker = this.speakers.get(userId);
      if (!speaker) {
        console.log(
          '[Space] subscribedSpeaker => speaker not found for userId=',
          userId,
        );
        return;
      }

      speaker.janusParticipantId = feedId;
      console.log(
        `[Space] updated speaker info => userId=${userId}, feedId=${feedId}`,
      );
    });

    // 7) Publish the broadcast
    console.log('[Space] Publishing broadcast...');
    await publishBroadcast({
      title: config.title || '',
      broadcast,
      cookie,
      janusSessionId: this.janusClient.getSessionId(),
      janusHandleId: this.janusClient.getHandleId(),
      janusPublisherId: this.janusClient.getPublisherId(),
    });

    // 8) If interactive, open chat
    if (config.mode === 'INTERACTIVE') {
      console.log('[Space] Connecting chat...');
      this.chatClient = new ChatClient(
        broadcast.room_id,
        broadcast.access_token,
        broadcast.endpoint,
      );
      await this.chatClient.connect();
      this.setupChatEvents();
    }

    this.isInitialized = true;
    console.log('[Space] Initialized =>', broadcast.share_url);

    for (const { plugin, config: pluginConfig } of this.plugins) {
      if (plugin.init) {
        plugin.init({
          space: this,
          pluginConfig,
        });
      }
    }

    console.log('[Space] All plugins initialized');
    return broadcast;
  }

  reactWithEmoji(emoji: string) {
    if (!this.chatClient) return;
    this.chatClient.reactWithEmoji(emoji);
  }

  private setupChatEvents() {
    if (!this.chatClient) return;

    this.chatClient.on('speakerRequest', (req: SpeakerRequest) => {
      console.log('[Space] Speaker request =>', req);
      this.emit('speakerRequest', req);
    });
    this.chatClient.on('occupancyUpdate', (update: OccupancyUpdate) => {
      this.emit('occupancyUpdate', update);
    });
    this.chatClient.on('muteStateChanged', (evt) => {
      this.emit('muteStateChanged', evt);
    });
    this.chatClient.on('guestReaction', (reaction: GuestReaction) => {
      console.log('[Space] Guest reaction =>', reaction);
      this.emit('guestReaction', reaction);
    });
  }

  /**
   * Approves a speaker on Periscope side, then subscribes on Janus side
   */
  async approveSpeaker(userId: string, sessionUUID: string) {
    if (!this.isInitialized || !this.broadcastInfo) {
      throw new Error('[Space] Not initialized or no broadcastInfo');
    }

    if (!this.authToken) {
      throw new Error('[Space] No auth token available');
    }

    this.speakers.set(userId, {
      userId,
      sessionUUID,
    });

    // 1) Call the "request/approve" endpoint
    await this.callApproveEndpoint(
      this.broadcastInfo,
      this.authToken,
      userId,
      sessionUUID,
    );

    // 2) Subscribe in Janus => receive speaker's audio
    await this.janusClient?.subscribeSpeaker(userId);
  }

  private async callApproveEndpoint(
    broadcast: BroadcastCreated,
    authorizationToken: string,
    userId: string,
    sessionUUID: string,
  ): Promise<void> {
    const endpoint = 'https://guest.pscp.tv/api/v1/audiospace/request/approve';

    const headers = {
      'Content-Type': 'application/json',
      Referer: 'https://x.com/',
      Authorization: authorizationToken,
    };

    const body = {
      ntpForBroadcasterFrame: '2208988800024000300',
      ntpForLiveFrame: '2208988800024000300',
      chat_token: broadcast.access_token,
      session_uuid: sessionUUID,
    };

    console.log('[Space] Approving speaker =>', endpoint, body);
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(
        `[Space] Failed to approve speaker => ${resp.status}: ${error}`,
      );
    }

    console.log('[Space] Speaker approved =>', userId);
  }

  /**
   * Removes a speaker (userId) on the Twitter side (audiospace/stream/eject)
   * then unsubscribes in Janus if needed.
   */
  public async removeSpeaker(userId: string) {
    if (!this.isInitialized || !this.broadcastInfo) {
      throw new Error('[Space] Not initialized or no broadcastInfo');
    }
    if (!this.authToken) {
      throw new Error('[Space] No auth token available');
    }
    if (!this.janusClient) {
      throw new Error('[Space] No Janus client initialized');
    }

    const speaker = this.speakers.get(userId);
    if (!speaker) {
      throw new Error(
        `[Space] removeSpeaker => no speaker found for userId=${userId}`,
      );
    }

    const sessionUUID = speaker.sessionUUID;
    const janusParticipantId = speaker.janusParticipantId;
    console.log(sessionUUID, janusParticipantId, speaker);
    if (!sessionUUID || janusParticipantId === undefined) {
      throw new Error(
        `[Space] removeSpeaker => missing sessionUUID or feedId for userId=${userId}`,
      );
    }

    const janusHandleId = this.janusClient.getHandleId();
    const janusSessionId = this.janusClient.getSessionId();

    if (!janusHandleId || !janusSessionId) {
      throw new Error(
        `[Space] removeSpeaker => missing Janus handle or sessionId for userId=${userId}`,
      );
    }

    // 1) Call the Twitter eject endpoint
    await this.callRemoveEndpoint(
      this.broadcastInfo,
      this.authToken,
      sessionUUID,
      janusParticipantId,
      this.broadcastInfo.room_id,
      janusHandleId,
      janusSessionId,
    );

    // 2) Remove from local speakers map
    this.speakers.delete(userId);

    console.log(`[Space] removeSpeaker => removed userId=${userId}`);
  }

  /**
   * Calls the audiospace/stream/eject endpoint to remove a speaker on Twitter
   */
  private async callRemoveEndpoint(
    broadcast: BroadcastCreated,
    authorizationToken: string,
    sessionUUID: string,
    janusParticipantId: number,
    janusRoomId: string,
    webrtcHandleId: number,
    webrtcSessionId: number,
  ): Promise<void> {
    const endpoint = 'https://guest.pscp.tv/api/v1/audiospace/stream/eject';

    const headers = {
      'Content-Type': 'application/json',
      Referer: 'https://x.com/',
      Authorization: authorizationToken,
    };

    const body = {
      ntpForBroadcasterFrame: '2208988800024000300',
      ntpForLiveFrame: '2208988800024000300',
      session_uuid: sessionUUID,
      chat_token: broadcast.access_token,
      janus_room_id: janusRoomId,
      janus_participant_id: janusParticipantId,
      webrtc_handle_id: webrtcHandleId,
      webrtc_session_id: webrtcSessionId,
    };

    console.log('[Space] Removing speaker =>', endpoint, body);
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(
        `[Space] Failed to remove speaker => ${resp.status}: ${error}`,
      );
    }

    console.log('[Space] Speaker removed => sessionUUID=', sessionUUID);
  }

  pushAudio(samples: Int16Array, sampleRate: number) {
    this.janusClient?.pushLocalAudio(samples, sampleRate);
  }

  /**
   * This method is called by JanusClient on 'audioDataFromSpeaker'
   * or we do it from the 'initialize(...)' once Janus is set up.
   */
  private handleAudioData(data: AudioDataWithUser) {
    // Forward to plugins
    for (const { plugin } of this.plugins) {
      plugin.onAudioData?.(data);
    }
  }

  /**
   * Gracefully end the Space (stop broadcast, destroy Janus room, etc.)
   */
  public async finalizeSpace(): Promise<void> {
    console.log('[Space] finalizeSpace => stopping broadcast gracefully');

    const tasks: Array<Promise<any>> = [];

    if (this.janusClient) {
      tasks.push(
        this.janusClient.destroyRoom().catch((err) => {
          console.error('[Space] destroyRoom error =>', err);
        }),
      );
    }

    if (this.broadcastInfo) {
      tasks.push(
        this.endAudiospace({
          broadcastId: this.broadcastInfo.room_id,
          chatToken: this.broadcastInfo.access_token,
        }).catch((err) => {
          console.error('[Space] endAudiospace error =>', err);
        }),
      );
    }

    if (this.janusClient) {
      tasks.push(
        this.janusClient.leaveRoom().catch((err) => {
          console.error('[Space] leaveRoom error =>', err);
        }),
      );
    }

    await Promise.all(tasks);
    console.log('[Space] finalizeSpace => done.');
  }

  /**
   * Calls the endAudiospace endpoint from Twitter
   */
  private async endAudiospace(params: {
    broadcastId: string;
    chatToken: string;
  }): Promise<void> {
    const url = 'https://guest.pscp.tv/api/v1/audiospace/admin/endAudiospace';
    const headers = {
      'Content-Type': 'application/json',
      Referer: 'https://x.com/',
      Authorization: this.authToken || '',
    };

    const body = {
      broadcast_id: params.broadcastId,
      chat_token: params.chatToken,
    };

    console.log('[Space] endAudiospace =>', body);
    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`[Space] endAudiospace => ${resp.status} ${errText}`);
    }
    const json = await resp.json();
    console.log('[Space] endAudiospace => success =>', json);
  }

  public getSpeakers(): SpeakerInfo[] {
    return Array.from(this.speakers.values());
  }

  async stop() {
    console.log('[Space] Stopping...');

    await this.finalizeSpace().catch((err) => {
      console.error('[Space] finalizeBroadcast error =>', err);
    });

    if (this.chatClient) {
      await this.chatClient.disconnect();
      this.chatClient = undefined;
    }
    if (this.janusClient) {
      await this.janusClient.stop();
      this.janusClient = undefined;
    }
    for (const { plugin } of this.plugins) {
      plugin.cleanup?.();
    }
    this.plugins.clear();

    this.isInitialized = false;
  }
}
