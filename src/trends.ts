import { addApiParams, requestApi } from './api';
import { TwitterAuth } from './auth';
import { TimelineV1 } from './timeline-v1';

export async function getTrends(
  auth: TwitterAuth,
  count = 20,
): Promise<string[]> {
  const params = new URLSearchParams();
  addApiParams(params, false);

  params.set('count', count.toString());
  params.set('candidate_source', 'trends');
  params.set('include_page_configuration', 'false');
  params.set('entity_tokens', 'false');

  const res = await requestApi<TimelineV1>(
    `https://api.twitter.com/2/guide.json?${params.toString()}`,
    auth,
  );
  if (!res.success) {
    throw res.err;
  }

  const instructions = res.value.timeline?.instructions ?? [];
  const trends: string[] = [];

  for (const instruction of instructions) {
    const entries = instruction.addEntries?.entries ?? [];
    for (const entry of entries) {
      const items = entry.content?.timelineModule?.items ?? [];
      for (const item of items) {
        const trend =
          item.item?.clientEventInfo?.details?.guideDetails
            ?.transparentGuideDetails?.trendMetadata?.trendName;
        if (trend != null) {
          trends.push(trend);
        }
      }
    }

    const pinEntry = instruction.pinEntry?.entry;
    if (pinEntry?.content?.timelineModule?.items) {
      const items = pinEntry.content.timelineModule.items;
      for (const item of items) {
        const trend =
          item.item?.clientEventInfo?.details?.guideDetails
            ?.transparentGuideDetails?.trendMetadata?.trendName;
        if (trend != null) {
          trends.push(trend);
        }
      }
    }
  }

  return trends;
}
