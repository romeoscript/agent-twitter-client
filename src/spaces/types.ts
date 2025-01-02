// src/types.ts

import { Space } from './core/Space';
import { SpaceParticipant } from './core/SpaceParticipant';

export interface AudioData {
  bitsPerSample: number; // e.g., 16
  sampleRate: number; // e.g., 48000
  channelCount: number; // e.g., 1 for mono, 2 for stereo
  numberOfFrames: number; // how many samples per channel
  samples: Int16Array; // the raw PCM data
}

export interface AudioDataWithUser extends AudioData {
  userId: string; // The ID of the speaker or user
}

export interface SpeakerRequest {
  userId: string;
  username: string;
  displayName: string;
  sessionUUID: string;
}

export interface OccupancyUpdate {
  occupancy: number;
  totalParticipants: number;
}

export interface GuestReaction {
  displayName: string;
  emoji: string;
}

export interface BroadcastCreated {
  room_id: string;
  credential: string;
  stream_name: string;
  webrtc_gw_url: string;
  broadcast: {
    user_id: string;
    twitter_id: string;
    media_key: string;
  };
  access_token: string;
  endpoint: string;
  share_url: string;
  stream_url: string;
}

export interface TurnServersInfo {
  ttl: string;
  username: string;
  password: string;
  uris: string[];
}

/**
 * This interface describes how a plugin can integrate with either a Space or a SpaceParticipant.
 *
 * - onAttach(...) is called as soon as the plugin is added via .use(plugin).
 *   This allows the plugin to store references or set up initial states.
 *
 * - init(...) is called when the space (or participant) has performed its base initialization
 *   (e.g., listener mode, basic chat, etc.). Plugins that do not strictly require Janus or speaker mode
 *   can finalize their setup here.
 *
 * - onJanusReady(...) is called only if the plugin needs direct access to a JanusClient instance.
 *   This happens once the user becomes a speaker (and thus Janus is fully set up).
 *   For example, a plugin that must subscribe to Janus events immediately at speaker time
 *   can implement this hook.
 *
 * - onAudioData(...) is called whenever raw PCM frames from a speaker are available,
 *   so the plugin can process or analyze audio data (e.g., STT or logging).
 *
 * - cleanup() is called right before the space/participant is torn down or the plugin is removed,
 *   allowing the plugin to do any necessary resource cleanup.
 */
export interface Plugin {
  /**
   * Called immediately when .use(plugin) is invoked.
   * This is typically for storing references or minimal setup.
   */
  onAttach?(spaceOrParticipant: any): void;

  /**
   * Called after the space (or participant) has fully joined in basic mode
   * (e.g., as a listener with chat). If a plugin only needs chat or HLS,
   * it can finalize in this method.
   */
  init?(params: { space: any; pluginConfig?: Record<string, any> }): void;

  /**
   * Called when the user becomes a speaker and a JanusClient is created or ready.
   * If a plugin needs to subscribe to Janus events or access the JanusClient directly,
   * it can do so here.
   */
  onJanusReady?(janusClient: any): void;

  /**
   * Called whenever PCM frames arrive from a speaker.
   * Allows the plugin to process or analyze the raw audio data.
   */
  onAudioData?(data: any): void;

  /**
   * Called to release any resources or stop any background tasks
   * when the plugin is removed or the space/participant stops.
   */
  cleanup?(): void;
}

export interface PluginRegistration {
  plugin: Plugin;
  config?: Record<string, any>;
}

export interface SpeakerInfo {
  userId: string;
  sessionUUID: string;
  janusParticipantId?: number;
}
