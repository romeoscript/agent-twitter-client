// src/test.ts

import 'dotenv/config';
import { Space } from './core/Space';
import { Scraper } from '../scraper';
import { SpaceConfig } from './types';
import { RecordToDiskPlugin } from './plugins/RecordToDiskPlugin';
import { SttTtsPlugin } from './plugins/SttTtsPlugin';
import { IdleMonitorPlugin } from './plugins/IdleMonitorPlugin';

/**
 * Main test entry point
 */
async function main() {
  console.log('[Test] Starting...');

  // 1) Twitter login with your scraper
  const scraper = new Scraper();
  await scraper.login(
    process.env.TWITTER_USERNAME!,
    process.env.TWITTER_PASSWORD!,
  );

  // 2) Create the Space instance
  const space = new Space(scraper);

  // Add a plugin to record audio
  const recordPlugin = new RecordToDiskPlugin();
  space.use(recordPlugin);

  // Create our TTS/STT plugin instance
  const sttTtsPlugin = new SttTtsPlugin();
  space.use(sttTtsPlugin, {
    openAiApiKey: process.env.OPENAI_API_KEY,
    elevenLabsApiKey: process.env.ELEVENLABS_API_KEY,
    voiceId: 'D38z5RcWu1voky8WS1ja', // example
    // You can also initialize systemPrompt, chatContext, etc. here if you wish
    // systemPrompt: "You are a calm and friendly AI assistant."
  });

  // Create an IdleMonitorPlugin to stop after 30s of silence
  const idlePlugin = new IdleMonitorPlugin(30_000, 10_000);
  space.use(idlePlugin);

  // If idle occurs, say goodbye and end the Space
  space.on('idleTimeout', async (info) => {
    console.log(`[Test] idleTimeout => no audio for ${info.idleMs}ms.`);
    await sttTtsPlugin.speakText('Ending Space due to inactivity. Goodbye!');
    await space.stop();
    console.log('[Test] Space stopped due to silence.');
    process.exit(0);
  });

  // 3) Initialize the Space
  const config: SpaceConfig = {
    mode: 'INTERACTIVE',
    title: 'AI Chat - Dynamic GPT Config',
    description: 'Space that demonstrates dynamic GPT personalities.',
    languages: ['en'],
  };

  const broadcastInfo = await space.initialize(config);
  const spaceUrl = broadcastInfo.share_url.replace('broadcasts', 'spaces');
  console.log('[Test] Space created =>', spaceUrl);

  // (Optional) Tweet out the Space link
  await scraper.sendTweet(`${config.title} ${spaceUrl}`);
  console.log('[Test] Tweet sent');

  // ---------------------------------------
  // Example of dynamic GPT usage:
  // You can change the system prompt at runtime
  setTimeout(() => {
    console.log('[Test] Changing system prompt to a new persona...');
    sttTtsPlugin.setSystemPrompt(
      'You are a very sarcastic AI who uses short answers.',
    );
  }, 45_000);

  // Another example: after some time, switch to GPT-4
  setTimeout(() => {
    console.log('[Test] Switching GPT model to "gpt-4" (if available)...');
    sttTtsPlugin.setGptModel('gpt-4');
  }, 60_000);

  // Also, demonstrate how to manually call askChatGPT and speak the result
  setTimeout(async () => {
    console.log('[Test] Asking GPT for an introduction...');
    try {
      const response = await sttTtsPlugin['askChatGPT']('Introduce yourself');
      console.log('[Test] ChatGPT introduction =>', response);

      // Then speak it
      await sttTtsPlugin.speakText(response);
    } catch (err) {
      console.error('[Test] askChatGPT error =>', err);
    }
  }, 75_000);

  // Example: periodically speak a greeting every 60s
  setInterval(() => {
    sttTtsPlugin
      .speakText('Hello everyone, this is an automated greeting.')
      .catch((err) => console.error('[Test] speakText() =>', err));
  }, 60_000);

  // 4) Some event listeners
  space.on('speakerRequest', async (req) => {
    console.log('[Test] Speaker request =>', req);
    await space.approveSpeaker(req.userId, req.sessionUUID);

    // Remove the speaker after 10 seconds (testing only)
    setTimeout(() => {
      console.log(
        `[Test] Removing speaker => userId=${req.userId} (after 10s)`,
      );
      space.removeSpeaker(req.userId).catch((err) => {
        console.error('[Test] removeSpeaker error =>', err);
      });
    }, 10_000);
  });

  space.on('error', (err) => {
    console.error('[Test] Space Error =>', err);
  });

  console.log('[Test] Space is running... press Ctrl+C to exit.');

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n[Test] Caught interrupt signal, stopping...');
    await space.stop();
    console.log('[Test] Space stopped. Bye!');
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[Test] Unhandled main error =>', err);
  process.exit(1);
});
