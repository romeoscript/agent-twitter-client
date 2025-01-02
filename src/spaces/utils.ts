// src/utils.ts

import { Headers } from 'headers-polyfill';
import type { BroadcastCreated, TurnServersInfo } from './types';
import { ChatClient } from './core/ChatClient';
import { Logger } from './logger';
import { EventEmitter } from 'events';

export async function authorizeToken(cookie: string): Promise<string> {
  const headers = new Headers({
    'X-Periscope-User-Agent': 'Twitter/m5',
    'Content-Type': 'application/json',
    'X-Idempotence': Date.now().toString(),
    Referer: 'https://x.com/',
    'X-Attempt': '1',
  });

  const resp = await fetch('https://proxsee.pscp.tv/api/v2/authorizeToken', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      service: 'guest',
      cookie: cookie,
    }),
  });

  if (!resp.ok) {
    throw new Error(`Failed to authorize token => ${resp.status}`);
  }

  const data = (await resp.json()) as { authorization_token: string };
  if (!data.authorization_token) {
    throw new Error('authorizeToken: Missing authorization_token in response');
  }

  return data.authorization_token;
}

export async function publishBroadcast(params: {
  title: string;
  broadcast: BroadcastCreated;
  cookie: string;
  janusSessionId?: number;
  janusHandleId?: number;
  janusPublisherId?: number;
}) {
  const headers = new Headers({
    'X-Periscope-User-Agent': 'Twitter/m5',
    'Content-Type': 'application/json',
    Referer: 'https://x.com/',
    'X-Idempotence': Date.now().toString(),
    'X-Attempt': '1',
  });

  await fetch('https://proxsee.pscp.tv/api/v2/publishBroadcast', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      accept_guests: true,
      broadcast_id: params.broadcast.room_id,
      webrtc_handle_id: params.janusHandleId,
      webrtc_session_id: params.janusSessionId,
      janus_publisher_id: params.janusPublisherId,
      janus_room_id: params.broadcast.room_id,
      cookie: params.cookie,
      status: params.title,
      conversation_controls: 0,
    }),
  });
}

export async function getTurnServers(cookie: string): Promise<TurnServersInfo> {
  const headers = new Headers({
    'X-Periscope-User-Agent': 'Twitter/m5',
    'Content-Type': 'application/json',
    Referer: 'https://x.com/',
    'X-Idempotence': Date.now().toString(),
    'X-Attempt': '1',
  });

  const resp = await fetch('https://proxsee.pscp.tv/api/v2/turnServers', {
    method: 'POST',
    headers,
    body: JSON.stringify({ cookie }),
  });
  if (!resp.ok) throw new Error('Failed to get turn servers => ' + resp.status);
  return resp.json();
}

/**
 * Get region from signer.pscp.tv
 */
export async function getRegion(): Promise<string> {
  const resp = await fetch('https://signer.pscp.tv/region', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Referer: 'https://x.com',
    },
    body: JSON.stringify({}),
  });
  if (!resp.ok) {
    throw new Error(`Failed to get region => ${resp.status}`);
  }
  const data = (await resp.json()) as { region: string };
  return data.region;
}

/**
 * Create broadcast on Periscope
 */
export async function createBroadcast(params: {
  description?: string;
  languages?: string[];
  cookie: string;
  region: string;
}): Promise<BroadcastCreated> {
  const headers = new Headers({
    'X-Periscope-User-Agent': 'Twitter/m5',
    'Content-Type': 'application/json',
    'X-Idempotence': Date.now().toString(),
    Referer: 'https://x.com/',
    'X-Attempt': '1',
  });

  const resp = await fetch('https://proxsee.pscp.tv/api/v2/createBroadcast', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      app_component: 'audio-room',
      content_type: 'visual_audio',
      cookie: params.cookie,
      conversation_controls: 0,
      description: params.description || '',
      height: 1080,
      is_360: false,
      is_space_available_for_replay: false,
      is_webrtc: true,
      languages: params.languages ?? [],
      region: params.region,
      width: 1920,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Failed to create broadcast => ${resp.status} ${text}`);
  }

  const data = await resp.json();
  return data as BroadcastCreated;
}

/**
 * Access the chat endpoint (proxsee.pscp.tv/api/v2/accessChat).
 * Returns the chat access_token, endpoint, etc.
 */
export async function accessChat(
  chatToken: string,
  cookie: string,
): Promise<any> {
  const url = 'https://proxsee.pscp.tv/api/v2/accessChat';
  const headers = new Headers({
    'Content-Type': 'application/json',
    'X-Periscope-User-Agent': 'Twitter/m5',
  });

  const body = {
    chat_token: chatToken,
    cookie,
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    throw new Error(`accessChat => request failed with status ${resp.status}`);
  }
  return resp.json();
}

/**
 * Call /startWatching to be counted as a viewer (session token).
 */
export async function startWatching(
  lifecycleToken: string,
  cookie: string,
): Promise<string> {
  const url = 'https://proxsee.pscp.tv/api/v2/startWatching';
  const headers = new Headers({
    'Content-Type': 'application/json',
    'X-Periscope-User-Agent': 'Twitter/m5',
  });

  const body = {
    auto_play: false,
    life_cycle_token: lifecycleToken,
    cookie,
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    throw new Error(
      `startWatching => request failed with status ${resp.status}`,
    );
  }
  const json = await resp.json();
  // Typically returns { session: "..." }
  return json.session;
}

/**
 * Call /stopWatching to end your viewer session.
 */
export async function stopWatching(
  session: string,
  cookie: string,
): Promise<void> {
  const url = 'https://proxsee.pscp.tv/api/v2/stopWatching';
  const headers = new Headers({
    'Content-Type': 'application/json',
    'X-Periscope-User-Agent': 'Twitter/m5',
  });

  const body = { session, cookie };
  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    throw new Error(
      `stopWatching => request failed with status ${resp.status}`,
    );
  }
}

/**
 * Join an existing AudioSpace (POST /audiospace/join).
 * Sometimes required before submitting a speaker request, depending on the flow.
 * The server often returns an object like { can_auto_join: false }.
 */
export async function joinAudioSpace(params: {
  broadcastId: string;
  chatToken: string;
  authToken: string;
  joinAsAdmin?: boolean; // default = false
  shouldAutoJoin?: boolean; // default = false
}): Promise<any> {
  const url = 'https://guest.pscp.tv/api/v1/audiospace/join';

  // This matches the values seen in your DevTools logs
  const body = {
    ntpForBroadcasterFrame: '2208988800031000000',
    ntpForLiveFrame: '2208988800031000000',
    broadcast_id: params.broadcastId,
    join_as_admin: params.joinAsAdmin ?? false,
    should_auto_join: params.shouldAutoJoin ?? false,
    chat_token: params.chatToken,
  };

  const headers = new Headers({
    'Content-Type': 'application/json',
    Authorization: params.authToken,
  });

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    throw new Error(
      `joinAudioSpace => request failed with status ${resp.status}`,
    );
  }

  // Typically returns something like: { "can_auto_join": false }
  return resp.json();
}

/**
 * Submit a speaker request to the host.
 * This calls /audiospace/request/submit and returns a sessionUUID.
 */
export async function submitSpeakerRequest(params: {
  broadcastId: string;
  chatToken: string;
  authToken: string;
}): Promise<{ session_uuid: string }> {
  const url = 'https://guest.pscp.tv/api/v1/audiospace/request/submit';
  const headers = new Headers({
    'Content-Type': 'application/json',
    Authorization: params.authToken,
  });

  const body = {
    ntpForBroadcasterFrame: '2208988800030000000',
    ntpForLiveFrame: '2208988800030000000',
    broadcast_id: params.broadcastId,
    chat_token: params.chatToken,
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    throw new Error(
      `submitSpeakerRequest => request failed with status ${resp.status}`,
    );
  }
  return resp.json();
}

/**
 * Cancels a pending speaker request (POST /audiospace/request/cancel).
 * This is typically called if you have already submitted a request/submit,
 * and you decide to withdraw it before the host approves it.
 */
export async function cancelSpeakerRequest(params: {
  broadcastId: string;
  sessionUUID: string; // the sessionUUID you got from request/submit
  chatToken: string;
  authToken: string; // your user's auth token
}): Promise<void> {
  const url = 'https://guest.pscp.tv/api/v1/audiospace/request/cancel';

  const headers = new Headers({
    'Content-Type': 'application/json',
    Authorization: params.authToken,
  });

  const body = {
    ntpForBroadcasterFrame: '2208988800002000000',
    ntpForLiveFrame: '2208988800002000000',
    broadcast_id: params.broadcastId,
    session_uuid: params.sessionUUID,
    chat_token: params.chatToken,
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    throw new Error(
      `cancelSpeakerRequest => request failed with status ${resp.status}`,
    );
  }
  return resp.json();
}

/**
 * Negotiate guest streaming with /audiospace/stream/negotiate.
 * Returns the webrtc_gw_url and janus_jwt used to connect to Janus.
 */
export async function negotiateGuestStream(params: {
  broadcastId: string;
  sessionUUID: string;
  authToken: string; // if needed for "Authorization"
  cookie: string;
}): Promise<{ janus_jwt: string; webrtc_gw_url: string }> {
  const url = 'https://guest.pscp.tv/api/v1/audiospace/stream/negotiate';
  const headers = new Headers({
    'Content-Type': 'application/json',
    Authorization: params.authToken, // Add or remove if needed
  });

  const body = {
    session_uuid: params.sessionUUID,
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    throw new Error(
      `negotiateGuestStream => request failed with status ${resp.status}`,
    );
  }
  return resp.json();
}

/**
 * Mute speaker (POST /audiospace/muteSpeaker).
 * - If you're the host, session_uuid can be "".
 * - If you're a guest speaker, pass the session_uuid you received from request/submit.
 */
export async function muteSpeaker(params: {
  broadcastId: string;
  sessionUUID?: string; // empty string if host, or the session_uuid if speaker
  chatToken: string; // The "2xxx..." token from accessChat
  authToken: string; // The JWT or Bearer token
}): Promise<void> {
  const url = 'https://guest.pscp.tv/api/v1/audiospace/muteSpeaker';

  // These NTP values are used by the official Twitter client
  const body = {
    ntpForBroadcasterFrame: 2208988800031000000,
    ntpForLiveFrame: 2208988800031000000,
    session_uuid: params.sessionUUID ?? '', // Host => "", Speaker => actual UUID
    broadcast_id: params.broadcastId,
    chat_token: params.chatToken,
  };

  const headers = new Headers({
    'Content-Type': 'application/json',
    Authorization: params.authToken,
  });

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`muteSpeaker => ${resp.status} ${text}`);
  }
  // Returns { "success": true } on success.
}

/**
 * Unmute speaker (POST /audiospace/unmuteSpeaker).
 * - If you're the host, session_uuid can be "".
 * - If you're a guest speaker, pass your session_uuid from request/submit.
 */
export async function unmuteSpeaker(params: {
  broadcastId: string;
  sessionUUID?: string; // empty string if host, or the session_uuid if speaker
  chatToken: string; // The "2xxx..." token from accessChat
  authToken: string; // The JWT or Bearer token
}): Promise<void> {
  const url = 'https://guest.pscp.tv/api/v1/audiospace/unmuteSpeaker';

  const body = {
    ntpForBroadcasterFrame: 2208988800031000000,
    ntpForLiveFrame: 2208988800031000000,
    session_uuid: params.sessionUUID ?? '',
    broadcast_id: params.broadcastId,
    chat_token: params.chatToken,
  };

  const headers = new Headers({
    'Content-Type': 'application/json',
    Authorization: params.authToken,
  });

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`unmuteSpeaker => ${resp.status} ${text}`);
  }
  // Returns { "success": true } on success.
}

/**
 * Sets up common ChatClient event handlers (occupancy, muteState, etc.).
 * Then re-emits them via a given EventEmitter (e.g. your Space or SpaceParticipant).
 */
export function setupCommonChatEvents(
  chatClient: ChatClient,
  logger: Logger,
  emitter: EventEmitter,
) {
  // Occupancy
  chatClient.on('occupancyUpdate', (upd) => {
    logger.debug('[ChatEvents] occupancyUpdate =>', upd);
    emitter.emit('occupancyUpdate', upd);
  });

  // Reactions
  chatClient.on('guestReaction', (reaction) => {
    logger.debug('[ChatEvents] guestReaction =>', reaction);
    emitter.emit('guestReaction', reaction);
  });

  // Mute state
  chatClient.on('muteStateChanged', (evt) => {
    logger.debug('[ChatEvents] muteStateChanged =>', evt);
    emitter.emit('muteStateChanged', evt);
  });

  // Speaker request
  chatClient.on('speakerRequest', (req) => {
    logger.debug('[ChatEvents] speakerRequest =>', req);
    emitter.emit('speakerRequest', req);
  });
}
