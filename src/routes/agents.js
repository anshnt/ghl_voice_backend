import express from 'express';
import { query } from '../db/index.js';
import { asyncRoute } from '../utils/asyncRoute.js';
import { HttpError } from '../utils/httpError.js';
import { getKpiSummary } from '../services/kpiEvaluator.js';

const router = express.Router();

const LIST_AGENTS = `
  SELECT
    a.id,
    a.location_id,
    a.ghl_agent_id,
    a.name,
    a.goal,
    a.kpi_config,
    COALESCE(AVG(ar.overall_score), 0)::FLOAT AS avg_score
  FROM agents a
  LEFT JOIN transcripts t ON t.agent_id = a.id
  LEFT JOIN analysis_results ar ON ar.transcript_id = t.id
  WHERE ($1::TEXT IS NULL OR a.location_id = $1)
  GROUP BY a.id
  ORDER BY a.name ASC
`;

const GET_AGENT = `
  SELECT id, location_id, ghl_agent_id, name, goal, script, kpi_config
  FROM agents
  WHERE id = $1
`;

const RECENT_RECOMMENDATIONS = `
  SELECT DISTINCT ON (recommendation->>'action')
    recommendation->>'priority' AS priority,
    recommendation->>'action' AS action,
    recommendation->>'reasoning' AS reasoning,
    ar.analyzed_at
  FROM analysis_results ar
  JOIN transcripts t ON t.id = ar.transcript_id
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(ar.recommendations, '[]'::jsonb)) AS recommendation
  WHERE t.agent_id = $1
  ORDER BY recommendation->>'action', ar.analyzed_at DESC
`;

const KPI_SCORE_HISTORY = `
  SELECT ar.kpi_scores
  FROM analysis_results ar
  JOIN transcripts t ON t.id = ar.transcript_id
  WHERE t.agent_id = $1
  ORDER BY t.call_date DESC NULLS LAST, ar.analyzed_at DESC
  LIMIT 20
`;

function scoreForCriterion(kpiScores, name) {
  const value = kpiScores?.[name]?.score;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function average(values) {
  const validValues = values.filter((value) => value !== null);
  if (validValues.length === 0) return 0;
  return validValues.reduce((sum, value) => sum + value, 0) / validValues.length;
}

function trendArrow(current, previous) {
  if (current > previous + 0.2) return '↑';
  if (current < previous - 0.2) return '↓';
  return '→';
}

function buildKpiBreakdown(criteria, rows) {
  return criteria.map((criterion) => {
    const scores = rows.map((row) => scoreForCriterion(row.kpi_scores, criterion.name));
    const current = average(scores.slice(0, 10));
    const previous = average(scores.slice(10, 20));

    return {
      name: criterion.name,
      score: current,
      trend: trendArrow(current, previous)
    };
  });
}

router.get(
  '/',
  asyncRoute(async (req, res) => {
    const result = await query(LIST_AGENTS, [req.query.locationId || null]);
    res.json({ agents: result.rows });
  })
);

router.get(
  '/:id/insights',
  asyncRoute(async (req, res) => {
    const agentResult = await query(GET_AGENT, [Number(req.params.id)]);
    const agent = agentResult.rows[0];
    if (!agent) throw new HttpError(404, 'Agent not found');

    const [summary, recommendationsResult] = await Promise.all([
      getKpiSummary(agent.id),
      query(RECENT_RECOMMENDATIONS, [agent.id])
    ]);
    const historyResult = await query(KPI_SCORE_HISTORY, [agent.id]);
    const criteria = agent.kpi_config?.criteria || [];

    const priorityRank = { high: 0, medium: 1, low: 2 };
    const recommendations = recommendationsResult.rows
      .sort((a, b) => (priorityRank[a.priority] ?? 3) - (priorityRank[b.priority] ?? 3))
      .slice(0, 3);

    res.json({
      agent,
      summary,
      recommendations,
      kpi_breakdown: buildKpiBreakdown(criteria, historyResult.rows)
    });
  })
);

export default router;
