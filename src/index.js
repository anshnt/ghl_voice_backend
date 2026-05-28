import 'dotenv/config';
import { createApp } from './app.js';
import { seedSandboxAccountFromEnv } from './services/ghlClient.js';
import { startTranscriptPoller } from './services/transcriptPoller.js';
import { logger } from './utils/logger.js';

const port = Number(process.env.PORT || 3000);

async function start() {
  try {
    const app = createApp();
    await seedSandboxAccountFromEnv();
    startTranscriptPoller();
    app.listen(port, () => {
      logger.info(`Backend listening on port ${port}`);
    });
  } catch (error) {
    logger.error('Backend failed to start', { message: error.message });
    process.exitCode = 1;
  }
}

await start();
