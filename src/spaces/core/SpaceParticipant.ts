// src/core/SpaceParticipant.ts

import { EventEmitter } from 'events';
import { Logger } from '../logger';
import { ChatClient } from './ChatClient';
import { JanusClient } from './JanusClient';
import { Scraper } from '../../scraper';
import type {
  TurnServersInfo,
  Plugin,
  PluginRegistration,
  AudioDataWithUser,
} from '../types';
import {
  accessChat,
  authorizeToken,
  getTurnServers,
  muteSpeaker,
  negotiateGuestStream,
  setupCommonChatEvents,
  startWatching,
  stopWatching,
  submitSpeakerRequest,
  unmuteSpeaker,
  cancelSpeakerRequest,
} from '../utils';

interface SpaceParticipantConfig {
  spaceId: string;
  debug?: boolean;
}

/**
 * This class handles joining an existing Space in 'listener' mode,
 * and optionally requesting to become a speaker (WebRTC).
 */
export class SpaceParticipant extends EventEmitter {
  private readonly spaceId: string;
  private readonly debug: boolean;
  private logger: Logger;

  // Data from calls
  private cookie?: string;
  private authToken?: string;
  private chatJwtToken?: string;
  private chatToken?: string;
  private lifecycleToken?: string;
  private watchSession?: string; // returned by startWatching
  private chatClient?: ChatClient;
  private hlsUrl?: string;

  // Speaker request
  private sessionUUID?: string;
  private janusJwt?: string;
  private webrtcGwUrl?: string;
  private janusClient?: JanusClient;

  private plugins = new Set<PluginRegistration>();

  constructor(
    private readonly scraper: Scraper,
    config: SpaceParticipantConfig,
  ) {
    super();
    this.spaceId = config.spaceId;
    this.debug = config.debug ?? false;
    this.logger = new Logger(this.debug);
  }

  public use(plugin: Plugin, config?: Record<string, any>) {
    const registration: PluginRegistration = { plugin, config };
    this.plugins.add(registration);

    this.logger.debug(
      '[SpaceParticipant] Plugin added =>',
      plugin.constructor.name,
    );

    plugin.onAttach?.(this);

    return this;
  }

  /**
   * 1) Join space as listener (HLS + chat)
   */
  public async joinAsListener(): Promise<void> {
    this.logger.info(
      '[SpaceParticipant] Joining Space as listener =>',
      this.spaceId,
    );

    // 1) Get cookie from scraper
    this.cookie = await this.scraper.getPeriscopeCookie();
    this.authToken = await authorizeToken(this.cookie);

    // 2) fetchAudioSpaceMetadata => to get media_key, etc.
    const spaceMeta = await this.scraper.getAudioSpaceById(this.spaceId);
    const mediaKey = spaceMeta?.metadata?.media_key;
    if (!mediaKey) {
      throw new Error('[SpaceParticipant] No mediaKey found in metadata');
    }
    this.logger.debug('[SpaceParticipant] mediaKey =>', mediaKey);

    // 3) live_video_stream/status => get HLS, chatToken, lifecycleToken
    const status = await this.scraper.getAudioSpaceStreamStatus(mediaKey);
    this.hlsUrl = status?.source?.location;
    this.chatJwtToken = status?.chatToken;
    this.lifecycleToken = status?.lifecycleToken;
    this.logger.debug('[SpaceParticipant] HLS =>', this.hlsUrl);

    // 4) accessChat => get chat access_token
    if (!this.chatJwtToken) {
      throw new Error('[SpaceParticipant] No chatToken found');
    }
    const chatInfo = await accessChat(this.chatJwtToken, this.cookie!);
    this.chatToken = chatInfo.access_token;

    // 5) Connect ChatClient
    this.chatClient = new ChatClient({
      spaceId: chatInfo.room_id,
      accessToken: chatInfo.access_token,
      endpoint: chatInfo.endpoint,
      logger: this.logger,
    });
    await this.chatClient.connect();

    // (Optionally attach events from ChatClient)
    this.setupChatEvents();

    // 6) startWatching => so we appear as viewer
    this.watchSession = await startWatching(this.lifecycleToken!, this.cookie!);

    this.logger.info('[SpaceParticipant] Joined as listener.');
  }

  /**
   * Return the HLS URL for audio streaming in "listener" mode.
   */
  public getHlsUrl(): string | undefined {
    return this.hlsUrl;
  }

  /**
   * 2) Request speaker role
   * - Calls audiospace/request/submit => get sessionUUID
   */
  public async requestSpeaker(): Promise<{ sessionUUID: string }> {
    if (!this.chatJwtToken) {
      throw new Error('[SpaceParticipant] Must join as listener first');
    }
    if (!this.authToken) {
      throw new Error('[Space] No auth token available');
    }
    if (!this.chatToken) {
      throw new Error('[Space] No chat token available');
    }

    this.logger.info('[SpaceParticipant] Submitting speaker request...');

    // This calls /api/v1/audiospace/request/submit
    const { session_uuid } = await submitSpeakerRequest({
      broadcastId: this.spaceId,
      chatToken: this.chatToken!,
      authToken: this.authToken!,
    });
    this.sessionUUID = session_uuid;
    this.logger.info(
      '[SpaceParticipant] Speaker request submitted =>',
      session_uuid,
    );
    return { sessionUUID: this.sessionUUID };
  }

  /**
   * Cancels a previously submitted speaker request using the /audiospace/request/cancel endpoint.
   * This only works if you have a valid sessionUUID from requestSpeaker().
   */
  public async cancelSpeakerRequest(): Promise<void> {
    if (!this.sessionUUID) {
      throw new Error(
        '[SpaceParticipant] No sessionUUID found; cannot cancel a speaker request that was never submitted.',
      );
    }
    if (!this.authToken) {
      throw new Error(
        '[SpaceParticipant] No authToken available; cannot cancel speaker request.',
      );
    }
    if (!this.chatToken) {
      throw new Error(
        '[SpaceParticipant] No chatToken available; cannot cancel speaker request.',
      );
    }

    await cancelSpeakerRequest({
      broadcastId: this.spaceId,
      sessionUUID: this.sessionUUID,
      chatToken: this.chatToken,
      authToken: this.authToken,
    });

    this.logger.info(
      '[SpaceParticipant] Speaker request canceled =>',
      this.sessionUUID,
    );

    // Clear out the sessionUUID to allow a fresh request again
    this.sessionUUID = undefined;
  }

  /**
   * 3) Once the host has approved the speaker request, we do the
   * WebRTC negotiation (Janus) as a "guest".
   *
   * - getTurnServers
   * - audiospace/stream/negotiate => returns janus_jwt + webrtc_gw_url
   * - JanusClient => createSession(), attach, join, configure, ...
   */
  public async becomeSpeaker(): Promise<void> {
    if (!this.sessionUUID) {
      throw new Error(
        '[SpaceParticipant] No sessionUUID (did you requestSpeaker first?)',
      );
    }
    this.logger.info(
      '[SpaceParticipant] Negotiating speaker role via Janus...',
    );

    // 1) get turnServers
    const turnServers: TurnServersInfo = await getTurnServers(this.cookie!);
    this.logger.debug('[SpaceParticipant] turnServers =>', turnServers);

    // 2) audiospace/stream/negotiate => returns webrtc_gw_url, janus_jwt
    const nego = await negotiateGuestStream({
      broadcastId: this.spaceId,
      sessionUUID: this.sessionUUID,
      authToken: this.authToken!,
      cookie: this.cookie!,
    });
    this.janusJwt = nego.janus_jwt;
    this.webrtcGwUrl = nego.webrtc_gw_url;
    this.logger.debug('[SpaceParticipant] webrtcGwUrl =>', this.webrtcGwUrl);

    // 3) Create a "guest" JanusClient
    this.janusClient = new JanusClient({
      webrtcUrl: this.webrtcGwUrl!,
      roomId: this.spaceId,
      credential: this.janusJwt!, // Use the janus_jwt as "credential"
      userId: turnServers.username.split(':')[1], // or read from somewhere
      streamName: this.spaceId, // we can set the spaceId as the stream name
      turnServers,
      logger: this.logger,
    });

    // IMPORTANT: we do not call createRoom() for a guest speaker
    // We'll create a new method "joinAsGuestSpeaker" or we can override.
    await this.janusClient.initializeGuestSpeaker();

    this.janusClient.on('audioDataFromSpeaker', (data: AudioDataWithUser) => {
      this.logger.debug(
        '[SpaceParticipant] Received PCM from speaker =>',
        data.userId,
      );
      this.handleAudioData(data);
    });

    this.logger.info(
      '[SpaceParticipant] Now speaker on the Space =>',
      this.spaceId,
    );

    // now call init on each plugin if they need the chat
    for (const { plugin, config } of this.plugins) {
      plugin.init?.({ space: this, pluginConfig: config });
    }
  }

  /**
   * Gracefully leave the Space:
   * - stopWatching
   * - if we became speaker, we call janusClient.leaveRoom or "request: leave"
   */
  public async leaveSpace(): Promise<void> {
    this.logger.info('[SpaceParticipant] Leaving space...');

    // 1) If we have a JanusClient (speaker), do .stop() or .leaveRoom()
    if (this.janusClient) {
      await this.janusClient.stop();
      this.janusClient = undefined;
    }

    // 2) stopWatching
    if (this.watchSession && this.cookie) {
      await stopWatching(this.watchSession, this.cookie);
    }

    // 3) Disconnect chat
    if (this.chatClient) {
      await this.chatClient.disconnect();
      this.chatClient = undefined;
    }

    this.logger.info('[SpaceParticipant] Left space =>', this.spaceId);
  }

  /**
   * Example: We can push audio frames if we are speaker
   */
  public pushAudio(samples: Int16Array, sampleRate: number) {
    if (!this.janusClient) {
      this.logger.warn(
        '[SpaceParticipant] Not a speaker yet; ignoring pushAudio',
      );
      return;
    }
    this.janusClient.pushLocalAudio(samples, sampleRate);
  }

  private handleAudioData(data: AudioDataWithUser) {
    for (const { plugin } of this.plugins) {
      plugin.onAudioData?.(data);
    }
  }

  private setupChatEvents() {
    if (!this.chatClient) return;
    setupCommonChatEvents(this.chatClient, this.logger, this);

    this.chatClient.on('newSpeakerAccepted', ({ userId }) => {
      this.logger.debug('[SpaceParticipant] newSpeakerAccepted =>', userId);

      if (userId === this.janusClient?.getHandleId()) {
        return;
      }
      // Subscribe
      if (!this.janusClient) {
        this.logger.warn(
          '[SpaceParticipant] no janusClient yet; ignoring new speaker...',
        );
        return;
      }
      this.janusClient.subscribeSpeaker(userId).catch((err) => {
        this.logger.error('[SpaceParticipant] subscribeSpeaker error =>', err);
      });
    });
  }

  /**
   * Mute yourself as a speaker (calls /audiospace/muteSpeaker).
   * Requires that you have a sessionUUID from request/submit.
   */
  public async muteSelf(): Promise<void> {
    if (!this.authToken || !this.chatToken) {
      throw new Error('[SpaceParticipant] Missing authToken or chatToken');
    }
    if (!this.sessionUUID) {
      throw new Error('[SpaceParticipant] No sessionUUID; are you a speaker?');
    }

    await muteSpeaker({
      broadcastId: this.spaceId,
      sessionUUID: this.sessionUUID,
      chatToken: this.chatToken,
      authToken: this.authToken,
    });
    this.logger.info('[SpaceParticipant] Successfully muted self.');
  }

  /**
   * Unmute yourself as a speaker (calls /audiospace/unmuteSpeaker).
   */
  public async unmuteSelf(): Promise<void> {
    if (!this.authToken || !this.chatToken) {
      throw new Error('[SpaceParticipant] Missing authToken or chatToken');
    }
    if (!this.sessionUUID) {
      throw new Error('[SpaceParticipant] No sessionUUID; are you a speaker?');
    }

    await unmuteSpeaker({
      broadcastId: this.spaceId,
      sessionUUID: this.sessionUUID,
      chatToken: this.chatToken,
      authToken: this.authToken,
    });
    this.logger.info('[SpaceParticipant] Successfully unmuted self.');
  }
}
