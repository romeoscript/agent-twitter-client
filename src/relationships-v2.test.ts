import {
  getFollowersV2,
  getFollowingV2,
  getTweetLikers,
  getTweetRetweeters,
  followUserV2,
  unfollowUserV2,
  muteUserV2,
  unmuteUserV2,
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
        me: jest.fn(),
        follow: jest.fn(),
        unfollow: jest.fn(),
        mute: jest.fn(),
        unmute: jest.fn(),
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

  test('getTweetRetweeters should call v2 tweetRetweetedBy with correct params', async () => {
    mockV2Client.v2.tweetRetweetedBy.mockResolvedValue({ data: [] });

    await getTweetRetweeters('tweet123', 5, mockAuth);

    expect(mockV2Client.v2.tweetRetweetedBy).toHaveBeenCalledWith(
      'tweet123',
      expect.objectContaining({
        asPaginator: true,
        max_results: 5,
      }),
    );
  });

  test('followUserV2 should call v2 me and follow', async () => {
    mockV2Client.v2.me.mockResolvedValue({ data: { id: 'me123' } });
    mockV2Client.v2.follow.mockResolvedValue({ data: { following: true } });

    await followUserV2('user123', mockAuth);

    expect(mockV2Client.v2.me).toHaveBeenCalled();
    expect(mockV2Client.v2.follow).toHaveBeenCalledWith('me123', 'user123');
  });

  test('unfollowUserV2 should call v2 me and unfollow', async () => {
    mockV2Client.v2.me.mockResolvedValue({ data: { id: 'me123' } });
    mockV2Client.v2.unfollow.mockResolvedValue({ data: { following: false } });

    await unfollowUserV2('user123', mockAuth);

    expect(mockV2Client.v2.me).toHaveBeenCalled();
    expect(mockV2Client.v2.unfollow).toHaveBeenCalledWith('me123', 'user123');
  });

  test('muteUserV2 should call v2 me and mute', async () => {
    mockV2Client.v2.me.mockResolvedValue({ data: { id: 'me123' } });
    mockV2Client.v2.mute.mockResolvedValue({ data: { muting: true } });

    await muteUserV2('user123', mockAuth);

    expect(mockV2Client.v2.me).toHaveBeenCalled();
    expect(mockV2Client.v2.mute).toHaveBeenCalledWith('me123', 'user123');
  });

  test('unmuteUserV2 should call v2 me and unmute', async () => {
    mockV2Client.v2.me.mockResolvedValue({ data: { id: 'me123' } });
    mockV2Client.v2.unmute.mockResolvedValue({ data: { muting: false } });

    await unmuteUserV2('user123', mockAuth);

    expect(mockV2Client.v2.me).toHaveBeenCalled();
    expect(mockV2Client.v2.unmute).toHaveBeenCalledWith('me123', 'user123');
  });

  test('should throw error if v2 client is not initialized', async () => {
    mockAuth.getV2Client.mockReturnValue(null);

    await expect(getFollowersV2('123', 10, mockAuth)).rejects.toThrow(
      'Twitter v2 client is not initialized.',
    );
  });
});
