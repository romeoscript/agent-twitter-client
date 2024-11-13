import { Scraper } from 'agent-twitter-client';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  // const scraper = new Scraper();
  // // v1 login
  // await scraper.login(
  //   process.env.TWITTER_USERNAME,
  //   process.env.TWITTER_PASSWORD,
  // );
  // // v2 login
  // await scraper.login(
  //   process.env.TWITTER_USERNAME,
  //   process.env.TWITTER_PASSWORD,
  //   undefined,
  //   undefined,
  //   process.env.TWITTER_API_KEY,
  //   process.env.TWITTER_API_SECRET_KEY,
  //   process.env.TWITTER_ACCESS_TOKEN,
  //   process.env.TWITTER_ACCESS_TOKEN_SECRET,
  // );
  // console.log('Logged in successfully!');
  // // Example: Posting a new tweet with a poll
  // await scraper.sendTweetV2(
  //   `When do you think we'll achieve AGI (Artificial General Intelligence)? 🤖 Cast your prediction!`,
  //   undefined,
  //   {
  //     poll: {
  //       options: [
  //         { label: '2025 🗓️' },
  //         { label: '2026 📅' },
  //         { label: '2027 🛠️' },
  //         { label: '2030+ 🚀' },
  //       ],
  //       durationMinutes: 1440,
  //     },
  //   },
  // );
  // console.log(await scraper.getTweet('id'));
  // const tweet = await scraper.getTweetV2('1856441982811529619', {
  //   expansions: ['attachments.poll_ids'],
  //   pollFields: ['options', 'end_datetime'],
  // });
  // console.log('tweet', tweet);
  // const tweets = await scraper.getTweetsV2(
  //   ['1856441982811529619', '1856429655215260130'],
  //   {
  //     expansions: ['attachments.poll_ids', 'attachments.media_keys'],
  //     pollFields: ['options', 'end_datetime'],
  //     mediaFields: ['url', 'preview_image_url'],
  //   },
  // );
  // console.log('tweets', tweets);
}

main();
