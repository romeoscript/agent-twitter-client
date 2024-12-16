import { TwitterAuth } from './auth';
import { updateCookieJar } from './requests';

export interface DirectMessage {
  id: string;
  text: string;
  senderId: string;
  recipientId: string;
  createdAt: string;
  mediaUrls?: string[];
  senderScreenName?: string;
  recipientScreenName?: string;
}

export interface DirectMessageConversation {
  conversationId: string;
  messages: DirectMessage[];
  participants: {
    id: string;
    screenName: string;
  }[];
}

export interface DirectMessageEvent {
  id: string;
  type: string;
  message_create: {
    sender_id: string;
    target: {
      recipient_id: string;
    };
    message_data: {
      text: string;
      created_at: string;
      entities?: {
        urls?: Array<{
          url: string;
          expanded_url: string;
          display_url: string;
        }>;
        media?: Array<{
          url: string;
          type: string;
        }>;
      };
    };
  };
}

export interface DirectMessagesResponse {
  events: DirectMessageEvent[];
  apps?: Record<string, any>;
  next_cursor?: string;
}

function parseDirectMessageConversations(
  data: any,
): DirectMessageConversation[] {
  try {
    const conversations = data.data.inbox.conversations;
    return conversations.map((conv: any) => ({
      conversationId: conv.conversation_id,
      messages: parseDirectMessages(conv.messages),
      participants: conv.participants.map((p: any) => ({
        id: p.user_id,
        screenName: p.screen_name,
      })),
    }));
  } catch (error) {
    console.error('Error parsing DM conversations:', error);
    return [];
  }
}

function parseDirectMessages(data: any): DirectMessage[] {
  try {
    return data.map((msg: any) => ({
      id: msg.message_id,
      text: msg.message_data.text,
      senderId: msg.message_data.sender_id,
      recipientId: msg.message_data.recipient_id,
      createdAt: msg.message_data.created_at,
      mediaUrls: msg.message_data.attachment?.media_urls,
      senderScreenName: msg.message_data.sender_screen_name,
      recipientScreenName: msg.message_data.recipient_screen_name,
    }));
  } catch (error) {
    console.error('Error parsing DMs:', error);
    return [];
  }
}

function parseDirectMessageResponse(data: any): DirectMessage {
  try {
    const msg = data.data.message_create;
    return {
      id: msg.message_id,
      text: msg.message_data.text,
      senderId: msg.message_data.sender_id,
      recipientId: msg.message_data.recipient_id,
      createdAt: msg.message_data.created_at,
      mediaUrls: msg.message_data.attachment?.media_urls,
      senderScreenName: msg.message_data.sender_screen_name,
      recipientScreenName: msg.message_data.recipient_screen_name,
    };
  } catch (error) {
    console.error('Error parsing DM response:', error);
    throw error;
  }
}

export async function getDirectMessageConversations(
  auth: TwitterAuth,
  cursor: string,
) {
  if (!auth.isLoggedIn()) {
    throw new Error('Authentication required to fetch direct messages');
  }

  const url =
    'https://twitter.com/i/api/graphql/7s3kOODhC5vgXlO0OlqYdA/DMInboxTimeline';
  const messageListUrl = 'https://x.com/i/api/1.1/dm/inbox_initial_state.json';

  const params = new URLSearchParams();

  if (cursor) {
    params.append('cursor', cursor);
  }

  const finalUrl = `${url}${params.toString() ? '?' + params.toString() : ''}`;
  const cookies = await auth.cookieJar().getCookies(url);
  const xCsrfToken = cookies.find((cookie) => cookie.key === 'ct0');
  const userTwitterId = cookies.find((cookie) => cookie.key === 'twid');

  const headers = new Headers({
    authorization: `Bearer ${(auth as any).bearerToken}`,
    cookie: await auth.cookieJar().getCookieString(messageListUrl),
    'content-type': 'application/json',
    'User-Agent':
      'Mozilla/5.0 (Linux; Android 11; Nokia G20) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.88 Mobile Safari/537.36',
    'x-guest-token': (auth as any).guestToken,
    'x-twitter-auth-type': 'OAuth2Client',
    'x-twitter-active-user': 'yes',
    'x-csrf-token': xCsrfToken?.value as string,
  });

  const response = await fetch(finalUrl, {
    method: 'GET',
    headers,
  });

  await updateCookieJar(auth.cookieJar(), response.headers);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  // parse the response
  const data = await response.json();
  return parseDirectMessageConversations(data);
}

export async function sendDirectMessage(
  auth: TwitterAuth,
  senderId: string,
  recipientId: string,
  text: string,
): Promise<DirectMessageEvent> {
  if (!auth.isLoggedIn()) {
    throw new Error('Authentication required to send direct messages');
  }

  const url =
    'https://twitter.com/i/api/graphql/7s3kOODhC5vgXlO0OlqYdA/DMInboxTimeline';
  const messageDmUrl = 'https://x.com/i/api/1.1/dm/new2.json';

  const cookies = await auth.cookieJar().getCookies(url);
  const xCsrfToken = cookies.find((cookie) => cookie.key === 'ct0');

  const headers = new Headers({
    authorization: `Bearer ${(auth as any).bearerToken}`,
    cookie: await auth.cookieJar().getCookieString(url),
    'content-type': 'application/json',
    'User-Agent':
      'Mozilla/5.0 (Linux; Android 11; Nokia G20) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.88 Mobile Safari/537.36',
    'x-guest-token': (auth as any).guestToken,
    'x-twitter-auth-type': 'OAuth2Client',
    'x-twitter-active-user': 'yes',
    'x-csrf-token': xCsrfToken?.value as string,
  });

  const payload = {
    conversation_id: `${senderId}-${recipientId}`,
    recipient_ids: false,
    text: text,
    cards_platform: 'Web-12',
    include_cards: 1,
    include_quote_count: true,
    dm_users: false,
  };

  const response = await fetch(messageDmUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  await updateCookieJar(auth.cookieJar(), response.headers);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()).event;
}
