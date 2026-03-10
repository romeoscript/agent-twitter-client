import { getHomeTimelineV2, getLatestTimelineV2 } from './timeline-v2';
import { TwitterAuth } from './auth';

describe('TimelineV2 official', () => {
  let mockAuth: jest.Mocked<TwitterAuth>;
  let mockV2Client: any;

  beforeEach(() => {
    mockV2Client = {
      v2: {
        homeTimeline: jest.fn(),
      },
    };

    mockAuth = {
      getV2Client: jest.fn().mockReturnValue(mockV2Client),
    } as any;
  });

  test('getHomeTimelineV2 should call v2 homeTimeline with correct params', async () => {
    mockV2Client.v2.homeTimeline.mockResolvedValue({ data: [] });

    await getHomeTimelineV2(20, mockAuth);

    expect(mockV2Client.v2.homeTimeline).toHaveBeenCalledWith(
      expect.objectContaining({
        max_results: 20,
        'tweet.fields': expect.arrayContaining([
          'referenced_tweets',
          'created_at',
        ]),
      }),
    );
  });

  test('getLatestTimelineV2 should call v2 homeTimeline with correct params', async () => {
    mockV2Client.v2.homeTimeline.mockResolvedValue({ data: [] });

    await getLatestTimelineV2(20, mockAuth);

    expect(mockV2Client.v2.homeTimeline).toHaveBeenCalledWith(
      expect.objectContaining({
        max_results: 20,
        'tweet.fields': expect.arrayContaining([
          'referenced_tweets',
          'created_at',
        ]),
      }),
    );
  });

  test('should throw error if v2 client is not initialized', async () => {
    mockAuth.getV2Client.mockReturnValue(null);

    await expect(getHomeTimelineV2(20, mockAuth)).rejects.toThrow(
      'Twitter v2 client is not initialized.',
    );
  });
});
