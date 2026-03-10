import { Scraper } from './scraper';
import * as api from './api';

jest.mock('./api');

describe('Custom Headers', () => {
  let scraper: Scraper;

  beforeEach(() => {
    scraper = new Scraper({
      headers: {
        'X-Custom-Header': 'CustomValue',
      },
    });
    jest.clearAllMocks();
  });

  test('scraper should include custom headers in requests', async () => {
    (api.requestApi as jest.Mock).mockResolvedValue({
      success: true,
      value: {
        data: {
          user: {
            result: {
              rest_id: '123',
              legacy: {
                screen_name: 'test',
                name: 'Test User',
              },
            },
          },
        },
      },
    });

    await scraper.getProfile('test');

    expect(api.requestApi).toHaveBeenCalled();

    // Check that the auth object passed to requestApi has the headers
    const auth = (api.requestApi as jest.Mock).mock.calls[0][1];
    expect(auth.extraHeaders().get('X-Custom-Header')).toBe('CustomValue');
  });

  test('setOptions should update custom headers', async () => {
    (api.requestApi as jest.Mock).mockResolvedValue({
      success: true,
      value: {
        data: {
          user: {
            result: {
              rest_id: '123',
              legacy: {
                screen_name: 'test',
                name: 'Test User',
              },
            },
          },
        },
      },
    });

    scraper.setOptions({
      headers: {
        'X-Updated-Header': 'UpdatedValue',
      },
    });

    await scraper.getProfile('test');

    const auth = (api.requestApi as jest.Mock).mock.calls[0][1];
    expect(auth.extraHeaders().get('X-Updated-Header')).toBe('UpdatedValue');
    expect(auth.extraHeaders().has('X-Custom-Header')).toBe(false);
  });
});
