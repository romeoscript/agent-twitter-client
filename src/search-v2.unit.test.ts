import { searchTweetsV2 } from './search';
import { TwitterAuth } from './auth';

describe('SearchV2 official', () => {
  let mockAuth: jest.Mocked<TwitterAuth>;
  let mockV2Client: any;

  beforeEach(() => {
    mockV2Client = {
      v2: {
        search: jest.fn(),
      },
    };

    mockAuth = {
      getV2Client: jest.fn().mockReturnValue(mockV2Client),
    } as any;
  });

  test('searchTweetsV2 should call v2 search with correct params', async () => {
    mockV2Client.v2.search.mockResolvedValue({ data: [] });

    await searchTweetsV2('node.js', 20, mockAuth);

    expect(mockV2Client.v2.search).toHaveBeenCalledWith(
      'node.js',
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

    await expect(searchTweetsV2('node.js', 20, mockAuth)).rejects.toThrow(
      'Twitter v2 client is not initialized.',
    );
  });
});
