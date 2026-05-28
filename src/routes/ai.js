import express from 'express';
import { answerDataQuestion, getAiSuggestions } from '../services/aiAdvisor.js';
import { asyncRoute } from '../utils/asyncRoute.js';
import { HttpError } from '../utils/httpError.js';

const router = express.Router();

router.get(
  '/suggestions',
  asyncRoute(async (_req, res) => {
    const payload = await getAiSuggestions();
    res.json(payload);
  })
);

router.post(
  '/chat',
  asyncRoute(async (req, res) => {
    if (typeof req.body?.question !== 'string') {
      throw new HttpError(400, 'question is required');
    }

    const payload = await answerDataQuestion(req.body.question);
    res.json(payload);
  })
);

export default router;
