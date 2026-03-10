import { getTrends } from './trends';
import { TwitterAuth } from './auth';
import * as api from './api';

jest.mock('./api');

describe('getTrends', () => {
  const mockAuth = {} as TwitterAuth;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should parse trends correctly from a standard response', async () => {
    const mockResponse = {
      success: true,
      value: {
        timeline: {
          instructions: [
            {
              addEntries: {
                entries: [
                  {},
                  {
                    content: {
                      timelineModule: {
                        items: [
                          {
                            item: {
                              clientEventInfo: {
                                details: {
                                  guideDetails: {
                                    transparentGuideDetails: {
                                      trendMetadata: {
                                        trendName: 'Trend 1',
                                      },
                                    },
                                  },
                                },
                              },
                            },
                          },
                          {
                            item: {
                              clientEventInfo: {
                                details: {
                                  guideDetails: {
                                    transparentGuideDetails: {
                                      trendMetadata: {
                                        trendName: 'Trend 2',
                                      },
                                    },
                                  },
                                },
                              },
                            },
                          },
                        ],
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    };

    (api.requestApi as jest.Mock).mockResolvedValue(mockResponse);

    const trends = await getTrends(mockAuth);

    expect(trends).toEqual(['Trend 1', 'Trend 2']);
    expect(api.requestApi).toHaveBeenCalled();
  });

  test('should parse trends from pinEntry', async () => {
    const mockResponse = {
      success: true,
      value: {
        timeline: {
          instructions: [
            {
              pinEntry: {
                entry: {
                  content: {
                    timelineModule: {
                      items: [
                        {
                          item: {
                            clientEventInfo: {
                              details: {
                                guideDetails: {
                                  transparentGuideDetails: {
                                    trendMetadata: {
                                      trendName: 'Pinned Trend',
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                      ],
                    },
                  },
                },
              },
            },
          ],
        },
      },
    };

    (api.requestApi as jest.Mock).mockResolvedValue(mockResponse);

    const trends = await getTrends(mockAuth);

    expect(trends).toEqual(['Pinned Trend']);
  });

  test('should return empty array if no trends found', async () => {
    const mockResponse = {
      success: true,
      value: {
        timeline: {
          instructions: [],
        },
      },
    };

    (api.requestApi as jest.Mock).mockResolvedValue(mockResponse);

    const trends = await getTrends(mockAuth);

    expect(trends).toEqual([]);
  });
});
