import {
  getFollowersV2,
  getFollowingV2,
  getTweetLikers,
} from './relationships';
import { TwitterAuth } from './auth';

describe('Relationships v2', () => {
  let mockAuth: jest.Mocked<TwitterAuth>;
  let mockV2Client: any;

  beforeEach(() => {
    mockV2Client = {
      v2: {
        followers: jest.fn(),
        following: jest.fn(),
        tweetLikedBy: jest.fn(),
        tweetRetweetedBy: jest.fn(),
      },
    };

    mockAuth = {
      getV2Client: jest.fn().mockReturnValue(mockV2Client),
    } as any;
  });

  test('getFollowersV2 should call v2 followers with correct params', async () => {
    mockV2Client.v2.followers.mockResolvedValue({ data: [] });

    await getFollowersV2('123', 10, mockAuth);

    expect(mockV2Client.v2.followers).toHaveBeenCalledWith(
      '123',
      expect.objectContaining({
        max_results: 10,
        'user.fields': expect.arrayContaining(['username', 'verified']),
      }),
    );
  });

  test('getFollowingV2 should call v2 following with correct params', async () => {
    mockV2Client.v2.following.mockResolvedValue({ data: [] });

    await getFollowingV2('123', 10, mockAuth);

    expect(mockV2Client.v2.following).toHaveBeenCalledWith(
      '123',
      expect.objectContaining({
        max_results: 10,
        'user.fields': expect.arrayContaining(['username', 'verified']),
      }),
    );
  });

  test('getTweetLikers should call v2 tweetLikedBy with correct params', async () => {
    mockV2Client.v2.tweetLikedBy.mockResolvedValue({ data: [] });

    await getTweetLikers('tweet123', 5, mockAuth);

    expect(mockV2Client.v2.tweetLikedBy).toHaveBeenCalledWith(
      'tweet123',
      expect.objectContaining({
        asPaginator: true,
        max_results: 5,
      }),
    );
  });

  test('should throw error if v2 client is not initialized', async () => {
    mockAuth.getV2Client.mockReturnValue(null);

    await expect(getFollowersV2('123', 10, mockAuth)).rejects.toThrow(
      'Twitter v2 client is not initialized.',
    );
  });
});
