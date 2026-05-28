import { logger } from './logger.js';

export function shouldUseDemoFallback(error, context) {
  if (process.env.DEMO_DATA_FALLBACK !== 'true') return false;

  logger.warn('Using demo data fallback because PostgreSQL is unavailable', {
    context,
    message: error.message
  });
  return true;
}
