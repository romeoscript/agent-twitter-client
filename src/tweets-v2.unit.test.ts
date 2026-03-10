import {
  getBookmarksV2,
  getUserTweetsV2,
  retweetTweetV2,
  likeTweetV2,
  getListTweetsV2,
  getQuoteTweetsV2,
  getTweetV2,
  getTweetsV2,
  getUserLikedTweetsV2,
} from './tweets';
import { TwitterAuth } from './auth';

describe('TweetsV2 official', () => {
  let mockAuth: jest.Mocked<TwitterAuth>;
  let mockV2Client: any;

  beforeEach(() => {
    mockV2Client = {
      v2: {
        bookmarks: jest.fn(),
        userTimeline: jest.fn(),
        me: jest.fn(),
        retweet: jest.fn(),
        like: jest.fn(),
        listTweets: jest.fn(),
        quotes: jest.fn(),
        singleTweet: jest.fn(),
        tweets: jest.fn(),
        userLikedTweets: jest.fn(),
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

  test('retweetTweetV2 should call v2 me and retweet', async () => {
    mockV2Client.v2.me.mockResolvedValue({ data: { id: 'me123' } });
    mockV2Client.v2.retweet.mockResolvedValue({ data: { retweeted: true } });

    await retweetTweetV2('tweet123', mockAuth);

    expect(mockV2Client.v2.me).toHaveBeenCalled();
    expect(mockV2Client.v2.retweet).toHaveBeenCalledWith('me123', 'tweet123');
  });

  test('likeTweetV2 should call v2 me and like', async () => {
    mockV2Client.v2.me.mockResolvedValue({ data: { id: 'me123' } });
    mockV2Client.v2.like.mockResolvedValue({ data: { liked: true } });

    await likeTweetV2('tweet123', mockAuth);

    expect(mockV2Client.v2.me).toHaveBeenCalled();
    expect(mockV2Client.v2.like).toHaveBeenCalledWith('me123', 'tweet123');
  });

  test('getListTweetsV2 should call v2 listTweets with correct params', async () => {
    mockV2Client.v2.listTweets.mockResolvedValue({ data: [] });

    await getListTweetsV2('list123', 20, mockAuth);

    expect(mockV2Client.v2.listTweets).toHaveBeenCalledWith(
      'list123',
      expect.objectContaining({
        max_results: 20,
        tweetFields: expect.arrayContaining([
          'referenced_tweets',
          'created_at',
        ]),
      }),
    );
  });

  test('getQuoteTweetsV2 should call v2 quotes with correct params', async () => {
    mockV2Client.v2.quotes.mockResolvedValue({ data: [] });

    await getQuoteTweetsV2('tweet123', 20, mockAuth);

    expect(mockV2Client.v2.quotes).toHaveBeenCalledWith(
      'tweet123',
      expect.objectContaining({
        max_results: 20,
        tweetFields: expect.arrayContaining([
          'referenced_tweets',
          'created_at',
        ]),
      }),
    );
  });

  test('getTweetV2 should call v2 singleTweet with correct params', async () => {
    mockV2Client.v2.singleTweet.mockResolvedValue({
      data: { id: 'tweet123', text: 'hello' },
    });

    await getTweetV2('tweet123', mockAuth);

    expect(mockV2Client.v2.singleTweet).toHaveBeenCalledWith(
      'tweet123',
      expect.objectContaining({
        'tweet.fields': expect.arrayContaining(['attachments', 'author_id']),
      }),
    );
  });

  test('getTweetsV2 should call v2 tweets with correct params', async () => {
    mockV2Client.v2.tweets.mockResolvedValue({
      data: [{ id: 'tweet123', text: 'hello' }],
    });

    await getTweetsV2(['tweet123'], mockAuth);

    expect(mockV2Client.v2.tweets).toHaveBeenCalledWith(
      ['tweet123'],
      expect.objectContaining({
        'tweet.fields': expect.arrayContaining(['attachments', 'author_id']),
      }),
    );
  });

  test('getUserLikedTweetsV2 should call v2 userLikedTweets with correct params', async () => {
    mockV2Client.v2.userLikedTweets.mockResolvedValue({ data: [] });

    await getUserLikedTweetsV2('user123', 20, mockAuth);

    expect(mockV2Client.v2.userLikedTweets).toHaveBeenCalledWith(
      'user123',
      expect.objectContaining({
        max_results: 20,
        tweetFields: expect.arrayContaining([
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
