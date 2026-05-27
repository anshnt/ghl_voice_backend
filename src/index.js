import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import agentsRouter from './routes/agents.js';
import authRouter from './routes/auth.js';
import kpiRouter from './routes/kpi.js';
import transcriptsRouter from './routes/transcripts.js';
import { highLevel, seedSandboxAccountFromEnv } from './services/ghlClient.js';
import { startTranscriptPoller } from './services/transcriptPoller.js';
import { logger } from './utils/logger.js';

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(cors({ origin: process.env.FRONTEND_URL || true }));
app.use(express.json({ limit: '1mb' }));

if (highLevel.webhooks?.subscribe) {
  app.post('/webhooks/ghl', highLevel.webhooks.subscribe());
} else {
  app.post('/webhooks/ghl', (_req, res) => {
    res.status(501).json({ error: true, message: 'GHL webhook middleware unavailable' });
  });
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/auth', authRouter);
app.use('/agents', agentsRouter);
app.use('/transcripts', transcriptsRouter);
app.use('/kpi', kpiRouter);

app.use((req, res) => {
  res.status(404).json({ error: true, message: `Route not found: ${req.method} ${req.path}` });
});

app.use((error, _req, res, _next) => {
  const statusCode = error.statusCode || 500;
  logger.error('Request failed', { statusCode, message: error.message });
  res.status(statusCode).json({ error: true, message: error.message || 'Internal server error' });
});

async function start() {
  try {
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
