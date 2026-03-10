import { Scraper } from './scraper';

describe('Thread Creation', () => {
  let scraper: Scraper;

  beforeEach(() => {
    scraper = new Scraper();
  });

  test('sendThread should chain tweets correctly', async () => {
    const sendTweetSpy = jest
      .spyOn(scraper, 'sendTweet')
      .mockImplementation(async (text, replyToId) => {
        let id = '0';
        if (text === 'first') id = '1';
        if (text === 'second') id = '2';
        if (text === 'third') id = '3';

        return {
          ok: true,
          clone: () => ({
            json: async () => ({ rest_id: id }),
          }),
          json: async () => ({ rest_id: id }),
        } as any;
      });

    const texts = ['first', 'second', 'third'];
    await scraper.sendThread(texts);

    expect(sendTweetSpy).toHaveBeenCalledTimes(3);
    expect(sendTweetSpy).toHaveBeenNthCalledWith(1, 'first', undefined);
    expect(sendTweetSpy).toHaveBeenNthCalledWith(2, 'second', '1');
    expect(sendTweetSpy).toHaveBeenNthCalledWith(3, 'third', '2');
  });

  test('sendThread should stop on failure', async () => {
    const sendTweetSpy = jest
      .spyOn(scraper, 'sendTweet')
      .mockImplementation(async (text) => {
        if (text === 'first') {
          return {
            ok: true,
            clone: () => ({
              json: async () => ({ rest_id: '1' }),
            }),
            json: async () => ({ rest_id: '1' }),
          } as any;
        }
        return { ok: false } as any;
      });

    const texts = ['first', 'second', 'third'];
    const responses = await scraper.sendThread(texts);

    expect(sendTweetSpy).toHaveBeenCalledTimes(2);
    expect(responses).toHaveLength(2);
    expect(responses[1].ok).toBe(false);
  });
});
