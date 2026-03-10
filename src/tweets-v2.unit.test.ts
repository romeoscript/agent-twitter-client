import { getBookmarksV2, getUserTweetsV2 } from './tweets';
import { TwitterAuth } from './auth';

describe('TweetsV2 official', () => {
  let mockAuth: jest.Mocked<TwitterAuth>;
  let mockV2Client: any;

  beforeEach(() => {
    mockV2Client = {
      v2: {
        bookmarks: jest.fn(),
        userTimeline: jest.fn(),
      },
    };

    mockAuth = {
      getV2Client: jest.fn().mockReturnValue(mockV2Client),
    } as any;
  });

  test('getBookmarksV2 should call v2 bookmarks with correct params', async () => {
    mockV2Client.v2.bookmarks.mockResolvedValue({ data: [] });

    await getBookmarksV2(20, mockAuth);

    expect(mockV2Client.v2.bookmarks).toHaveBeenCalledWith(
      expect.objectContaining({
        max_results: 20,
        'tweet.fields': expect.arrayContaining([
          'referenced_tweets',
          'created_at',
        ]),
      }),
    );
  });

  test('getUserTweetsV2 should call v2 userTimeline with correct params', async () => {
    mockV2Client.v2.userTimeline.mockResolvedValue({ data: [] });

    await getUserTweetsV2('user123', 20, mockAuth);

    expect(mockV2Client.v2.userTimeline).toHaveBeenCalledWith(
      'user123',
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

    await expect(getBookmarksV2(20, mockAuth)).rejects.toThrow(
      'Twitter v2 client is not initialized.',
    );
  });
});
