// src/core/ChatClient.ts

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import type { SpeakerRequest, OccupancyUpdate } from '../types';

export class ChatClient extends EventEmitter {
  private ws?: WebSocket;
  private connected = false;

  constructor(
    private readonly spaceId: string,
    private readonly accessToken: string,
    private readonly endpoint: string,
  ) {
    super();
  }

  async connect() {
    const wsUrl = `${this.endpoint}/chatapi/v1/chatnow`.replace(
      'https://',
      'wss://',
    );
    console.log('[ChatClient] Connecting =>', wsUrl);

    this.ws = new WebSocket(wsUrl, {
      headers: {
        Origin: 'https://x.com',
        'User-Agent': 'Mozilla/5.0',
      },
    });

    await this.setupHandlers();
  }

  private setupHandlers(): Promise<void> {
    if (!this.ws) throw new Error('No WebSocket instance');

    return new Promise((resolve, reject) => {
      this.ws!.on('open', () => {
        console.log('[ChatClient] Connected');
        this.connected = true;
        this.sendAuthAndJoin();
        resolve();
      });

      this.ws!.on('message', (data: { toString: () => string; }) => {
        this.handleMessage(data.toString());
      });

      this.ws!.on('close', () => {
        console.log('[ChatClient] Closed');
        this.connected = false;
        this.emit('disconnected');
      });

      this.ws!.on('error', (err) => {
        console.error('[ChatClient] Error =>', err);
        reject(err);
      });
    });
  }

  private sendAuthAndJoin() {
    if (!this.ws) return;
    // Auth
    this.ws.send(
      JSON.stringify({
        payload: JSON.stringify({ access_token: this.accessToken }),
        kind: 3,
      }),
    );
    // Join
    this.ws.send(
      JSON.stringify({
        payload: JSON.stringify({
          body: JSON.stringify({ room: this.spaceId }),
          kind: 1,
        }),
        kind: 2,
      }),
    );
  }

  reactWithEmoji(emoji: string) {
    if (!this.ws) return;
    const payload = JSON.stringify({
      body: JSON.stringify({ body: emoji, type: 2, v: 2 }),
      kind: 1,
      /*
      // The 'sender' field is not required, it's not even verified by the server
      // Instead of passing attributes down here it's easier to ignore it
      sender: {
        user_id: null,
        twitter_id: null,
        username: null,
        display_name: null,
      },
      */
      payload: JSON.stringify({
        room: this.spaceId,
        body: JSON.stringify({ body: emoji, type: 2, v: 2 }),
      }),
      type: 2,
    });
    this.ws.send(payload);
  }

  private handleMessage(raw: string) {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!msg.payload) return;

    const payload = safeJson(msg.payload);
    if (!payload?.body) return;

    const body = safeJson(payload.body);

    // Example of speaker request detection
    if (body.guestBroadcastingEvent === 1) {
      const req: SpeakerRequest = {
        userId: body.guestRemoteID,
        username: body.guestUsername,
        displayName: payload.sender?.display_name || body.guestUsername,
        sessionUUID: body.sessionUUID,
      };
      this.emit('speakerRequest', req);
    }

    // Example of occupancy update
    if (typeof body.occupancy === 'number') {
      const update: OccupancyUpdate = {
        occupancy: body.occupancy,
        totalParticipants: body.total_participants || 0,
      };
      this.emit('occupancyUpdate', update);
    }

    // Example of mute state
    if (body.guestBroadcastingEvent === 16) {
      this.emit('muteStateChanged', {
        userId: body.guestRemoteID,
        muted: true,
      });
    }
    if (body.guestBroadcastingEvent === 17) {
      this.emit('muteStateChanged', {
        userId: body.guestRemoteID,
        muted: false,
      });
    }
    // Example of guest reaction
    if (body?.type === 2) {
      console.log('[ChatClient] Emiting guest reaction event =>', body);
      this.emit('guestReaction', {
        displayName: body.displayName,
        emoji: body.body,
      });
    }
  }

  async disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
      this.connected = false;
    }
  }
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
