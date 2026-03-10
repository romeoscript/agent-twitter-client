import { Scraper } from './scraper';
import * as api from './api';

jest.mock('./api');

describe('List Members', () => {
  let scraper: Scraper;

  beforeEach(() => {
    scraper = new Scraper();
    jest.clearAllMocks();
  });

  test('fetchListMembers should return parsed list members', async () => {
    const mockResponse = {
      data: {
        list: {
          members_timeline: {
            timeline: {
              instructions: [
                {
                  type: 'TimelineAddEntries',
                  entries: [
                    {
                      entryId: 'user-1',
                      content: {
                        itemContent: {
                          user_results: {
                            result: {
                              legacy: {
                                screen_name: 'user1',
                                name: 'User One',
                                id_str: '1',
                                profile_image_url_https:
                                  'https://pic.com/1_normal.jpg',
                                description: 'Bio 1',
                                followers_count: 10,
                                friends_count: 20,
                                statuses_count: 30,
                                favourites_count: 40,
                                listed_count: 5,
                                location: 'Earth',
                                protected: false,
                                verified: true,
                              },
                              is_blue_verified: true,
                            },
                          },
                        },
                      },
                    },
                    {
                      entryId: 'cursor-bottom-1',
                      content: {
                        cursorType: 'Bottom',
                        value: 'next-cursor',
                      },
                    },
                  ],
                },
              ],
            },
          },
        },
      },
    };

    (api.requestApi as jest.Mock).mockResolvedValue({
      success: true,
      value: mockResponse,
    });

    const result = await scraper.fetchListMembers('123', 10);

    expect(result.users).toHaveLength(1);
    expect(result.users[0].username).toBe('user1');
    expect(result.users[0].isBlueVerified).toBe(true);
    expect(result.next).toBe('next-cursor');
  });
});
