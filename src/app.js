import cors from 'cors';
import express from 'express';
import agentsRouter from './routes/agents.js';
import aiRouter from './routes/ai.js';
import authRouter from './routes/auth.js';
import kpiRouter from './routes/kpi.js';
import transcriptsRouter from './routes/transcripts.js';
import { highLevel } from './services/ghlClient.js';
import { logger } from './utils/logger.js';

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://127.0.0.1:5173'
].filter(Boolean);

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error(`CORS origin not allowed: ${origin}`));
      }
    })
  );
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
  app.use('/ai', aiRouter);
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

  return app;
}
