import express from 'express';
import { highLevel } from '../services/ghlClient.js';
import { asyncRoute } from '../utils/asyncRoute.js';
import { HttpError } from '../utils/httpError.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

function callbackHandler() {
  if (highLevel.oauth?.callback) return highLevel.oauth.callback();

  return asyncRoute(async (req, res) => {
    const { code, locationId } = req.query;
    if (!code || !locationId) throw new HttpError(400, 'OAuth code and locationId are required');
    logger.warn('GHL SDK OAuth callback helper unavailable; fallback callback reached');
    res.json({ installed: false, message: 'Install webhook is preferred for this SDK version.' });
  });
}

router.get('/callback', callbackHandler());

export default router;
