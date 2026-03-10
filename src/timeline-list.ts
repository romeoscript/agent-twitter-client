import { QueryTweetsResponse } from './timeline-v1';
import { parseAndPush, TimelineEntryRaw } from './timeline-v2';
import { Profile, parseProfile } from './profile';
import { Tweet } from './tweets';

export interface ListMembersTimeline {
  data?: {
    list?: {
      members_timeline?: {
        timeline?: {
          instructions?: {
            entries?: TimelineEntryRaw[];
            entry?: TimelineEntryRaw;
            type?: string;
          }[];
        };
      };
    };
  };
}

export interface ListMembersResponse {
  users: Profile[];
  next?: string;
  previous?: string;
}

export function parseListMembers(
  timeline: ListMembersTimeline,
): ListMembersResponse {
  let bottomCursor: string | undefined;
  let topCursor: string | undefined;
  const users: Profile[] = [];
  const instructions =
    timeline.data?.list?.members_timeline?.timeline?.instructions ?? [];
  for (const instruction of instructions) {
    const entries = instruction.entries ?? [];

    for (const entry of entries) {
      const entryContent = entry.content;
      if (!entryContent) continue;

      if (entryContent.cursorType === 'Bottom') {
        bottomCursor = entryContent.value;
        continue;
      } else if (entryContent.cursorType === 'Top') {
        topCursor = entryContent.value;
        continue;
      }

      if (entryContent.itemContent?.user_results?.result) {
        const result = entryContent.itemContent.user_results.result;
        if (result.legacy) {
          users.push(parseProfile(result.legacy, result.is_blue_verified));
        }
      }
    }
  }

  return { users, next: bottomCursor, previous: topCursor };
}

export interface ListTimeline {
  data?: {
    list?: {
      tweets_timeline?: {
        timeline?: {
          instructions?: {
            entries?: TimelineEntryRaw[];
            entry?: TimelineEntryRaw;
            type?: string;
          }[];
        };
      };
    };
  };
}

export function parseListTimelineTweets(
  timeline: ListTimeline,
): QueryTweetsResponse {
  let bottomCursor: string | undefined;
  let topCursor: string | undefined;
  const tweets: Tweet[] = [];
  const instructions =
    timeline.data?.list?.tweets_timeline?.timeline?.instructions ?? [];
  for (const instruction of instructions) {
    const entries = instruction.entries ?? [];

    for (const entry of entries) {
      const entryContent = entry.content;
      if (!entryContent) continue;

      if (entryContent.cursorType === 'Bottom') {
        bottomCursor = entryContent.value;
        continue;
      } else if (entryContent.cursorType === 'Top') {
        topCursor = entryContent.value;
        continue;
      }

      const idStr = entry.entryId;
      if (
        !idStr.startsWith('tweet') &&
        !idStr.startsWith('list-conversation')
      ) {
        continue;
      }

      if (entryContent.itemContent) {
        parseAndPush(tweets, entryContent.itemContent, idStr);
      } else if (entryContent.items) {
        for (const contentItem of entryContent.items) {
          if (
            contentItem.item &&
            contentItem.item.itemContent &&
            contentItem.entryId
          ) {
            parseAndPush(
              tweets,
              contentItem.item.itemContent,
              contentItem.entryId.split('tweet-')[1],
            );
          }
        }
      }
    }
  }

  return { tweets, next: bottomCursor, previous: topCursor };
}
