import express from 'express';
import { query } from '../db/index.js';
import { asyncRoute } from '../utils/asyncRoute.js';
import { HttpError } from '../utils/httpError.js';
import { getAgentSummaries, getKpiSummary } from '../services/kpiEvaluator.js';

const router = express.Router();

const UPDATE_KPI = `
  UPDATE agents
  SET kpi_config = $2
  WHERE id = $1
  RETURNING id, name, goal, kpi_config
`;

router.get(
  '/summary',
  asyncRoute(async (req, res) => {
    const summary = await getKpiSummary(req.query.agentId || null);
    const agents = req.query.agentId ? [] : await getAgentSummaries();
    res.json({ summary, agents });
  })
);

router.post(
  '/config',
  asyncRoute(async (req, res) => {
    const { agentId, kpiConfig } = req.body;
    if (!agentId || !Array.isArray(kpiConfig?.criteria)) {
      throw new HttpError(400, 'agentId and kpiConfig.criteria are required');
    }

    const result = await query(UPDATE_KPI, [Number(agentId), JSON.stringify(kpiConfig)]);
    const agent = result.rows[0];
    if (!agent) throw new HttpError(404, 'Agent not found');

    res.json({ agent });
  })
);

export default router;
