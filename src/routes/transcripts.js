import express from 'express';
import { query } from '../db/index.js';
import { asyncRoute } from '../utils/asyncRoute.js';
import { HttpError } from '../utils/httpError.js';

const router = express.Router();

const LIST_TRANSCRIPTS = `
  SELECT
    t.id,
    t.agent_id,
    a.name AS agent_name,
    t.caller_phone,
    t.duration_seconds,
    t.call_date,
    t.analyzed,
    ar.overall_score,
    CASE WHEN ar.overall_score >= 7 THEN 'Pass' ELSE 'Fail' END AS status
  FROM transcripts t
  JOIN agents a ON a.id = t.agent_id
  LEFT JOIN analysis_results ar ON ar.transcript_id = t.id
  WHERE ($1::INTEGER IS NULL OR t.agent_id = $1)
  ORDER BY t.call_date DESC NULLS LAST, t.created_at DESC
  LIMIT $2 OFFSET $3
`;

const GET_TRANSCRIPT = `
  SELECT
    t.*,
    a.name AS agent_name,
    a.goal AS agent_goal,
    ar.overall_score,
    ar.kpi_scores,
    ar.failures,
    ar.recommendations,
    ar.use_actions,
    ar.analyzed_at
  FROM transcripts t
  JOIN agents a ON a.id = t.agent_id
  LEFT JOIN analysis_results ar ON ar.transcript_id = t.id
  WHERE t.id = $1
`;

function clampPagination(value, fallback, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, max);
}

router.get(
  '/',
  asyncRoute(async (req, res) => {
    const agentId = req.query.agentId ? Number(req.query.agentId) : null;
    const limit = clampPagination(req.query.limit, 20, 100);
    const offset = clampPagination(req.query.offset, 0, 10000);
    const result = await query(LIST_TRANSCRIPTS, [agentId, limit, offset]);
    res.json({ transcripts: result.rows, limit, offset });
  })
);

router.get(
  '/:id',
  asyncRoute(async (req, res) => {
    const result = await query(GET_TRANSCRIPT, [Number(req.params.id)]);
    const transcript = result.rows[0];
    if (!transcript) throw new HttpError(404, 'Transcript not found');
    res.json({ transcript });
  })
);

export default router;
