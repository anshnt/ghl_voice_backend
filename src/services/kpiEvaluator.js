import { query } from '../db/index.js';
import { logger } from '../utils/logger.js';

const AGGREGATE_STATS = `
  SELECT
    COUNT(t.id)::INTEGER AS call_count,
    COUNT(ar.id)::INTEGER AS analyzed_count,
    COALESCE(AVG(ar.overall_score), 0)::FLOAT AS avg_score,
    COALESCE(AVG(t.duration_seconds), 0)::FLOAT AS avg_duration_seconds,
    COALESCE(MIN(ar.overall_score), 0)::FLOAT AS lowest_score,
    COALESCE(MAX(ar.overall_score), 0)::FLOAT AS highest_score,
    COUNT(*) FILTER (WHERE ar.overall_score < 6)::INTEGER AS critical_count,
    COALESCE(
      100.0 * SUM(CASE WHEN ar.overall_score >= 7 THEN 1 ELSE 0 END) / NULLIF(COUNT(ar.id), 0),
      0
    )::FLOAT AS pass_rate
  FROM transcripts t
  LEFT JOIN analysis_results ar ON ar.transcript_id = t.id
  WHERE ($1::INTEGER IS NULL OR t.agent_id = $1)
`;

const TOP_FAILURES = `
  SELECT failure->>'type' AS type, COUNT(*)::INTEGER AS count
  FROM analysis_results ar
  JOIN transcripts t ON t.id = ar.transcript_id
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(ar.failures, '[]'::jsonb)) AS failure
  WHERE ($1::INTEGER IS NULL OR t.agent_id = $1)
  GROUP BY failure->>'type'
  ORDER BY count DESC, type ASC
  LIMIT 5
`;

const SCORE_DISTRIBUTION = `
  SELECT bucket, COUNT(*)::INTEGER AS count
  FROM (
    SELECT
      CASE
        WHEN overall_score < 5 THEN '0-4.9'
        WHEN overall_score < 6 THEN '5.0-5.9'
        WHEN overall_score < 7 THEN '6.0-6.9'
        WHEN overall_score < 8 THEN '7.0-7.9'
        WHEN overall_score < 9 THEN '8.0-8.9'
        ELSE '9.0-10'
      END AS bucket
    FROM analysis_results ar
    JOIN transcripts t ON t.id = ar.transcript_id
    WHERE ($1::INTEGER IS NULL OR t.agent_id = $1)
  ) scored
  GROUP BY bucket
  ORDER BY bucket ASC
`;

const DAILY_TREND = `
  SELECT
    DATE_TRUNC('day', t.call_date)::DATE AS day,
    COALESCE(AVG(ar.overall_score), 0)::FLOAT AS avg_score,
    COALESCE(
      100.0 * SUM(CASE WHEN ar.overall_score >= 7 THEN 1 ELSE 0 END) / NULLIF(COUNT(ar.id), 0),
      0
    )::FLOAT AS pass_rate,
    COUNT(ar.id)::INTEGER AS analyzed_count
  FROM transcripts t
  JOIN analysis_results ar ON ar.transcript_id = t.id
  WHERE ($1::INTEGER IS NULL OR t.agent_id = $1)
  GROUP BY DATE_TRUNC('day', t.call_date)
  ORDER BY day ASC
  LIMIT 60
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
  WHERE ($1::INTEGER IS NULL OR t.agent_id = $1)
  ORDER BY recommendation->>'action', ar.analyzed_at DESC
  LIMIT 8
`;

const AGENT_SUMMARIES = `
  SELECT
    a.id,
    a.name,
    COALESCE(AVG(ar.overall_score), 0)::FLOAT AS avg_score,
    COALESCE(
      100.0 * SUM(CASE WHEN ar.overall_score >= 7 THEN 1 ELSE 0 END) / NULLIF(COUNT(ar.id), 0),
      0
    )::FLOAT AS pass_rate,
    COUNT(t.id)::INTEGER AS call_count,
    COUNT(ar.id)::INTEGER AS analyzed_count,
    COUNT(*) FILTER (WHERE ar.overall_score < 6)::INTEGER AS critical_count,
    COUNT(failure)::INTEGER AS failure_count
  FROM agents a
  LEFT JOIN transcripts t ON t.agent_id = a.id
  LEFT JOIN analysis_results ar ON ar.transcript_id = t.id
  LEFT JOIN LATERAL jsonb_array_elements(COALESCE(ar.failures, '[]'::jsonb)) AS failure ON true
  GROUP BY a.id
  ORDER BY avg_score DESC, a.name ASC
`;

const BUCKET_ORDER = ['0-4.9', '5.0-5.9', '6.0-6.9', '7.0-7.9', '8.0-8.9', '9.0-10'];

function normalizeDistribution(rows) {
  return BUCKET_ORDER.map((bucket) => {
    const match = rows.find((row) => row.bucket === bucket);
    return { bucket, count: match?.count || 0 };
  });
}

function sortRecommendations(rows) {
  const priorityRank = { high: 0, medium: 1, low: 2 };
  return rows.sort((a, b) => (priorityRank[a.priority] ?? 3) - (priorityRank[b.priority] ?? 3));
}

export async function getKpiSummary(agentId = null) {
  try {
    const numericAgentId = agentId ? Number(agentId) : null;
    const [statsResult, failuresResult, distributionResult, trendResult, recommendationsResult] =
      await Promise.all([
        query(AGGREGATE_STATS, [numericAgentId]),
        query(TOP_FAILURES, [numericAgentId]),
        query(SCORE_DISTRIBUTION, [numericAgentId]),
        query(DAILY_TREND, [numericAgentId]),
        query(RECENT_RECOMMENDATIONS, [numericAgentId])
      ]);
    const stats = statsResult.rows[0];

    return {
      avg_score: Number(stats.avg_score || 0),
      pass_rate: Number(stats.pass_rate || 0),
      avg_duration_seconds: Number(stats.avg_duration_seconds || 0),
      lowest_score: Number(stats.lowest_score || 0),
      highest_score: Number(stats.highest_score || 0),
      critical_count: stats.critical_count,
      top_failures: failuresResult.rows,
      score_distribution: normalizeDistribution(distributionResult.rows),
      daily_trend: trendResult.rows,
      recent_recommendations: sortRecommendations(recommendationsResult.rows),
      call_count: stats.call_count,
      analyzed_count: stats.analyzed_count
    };
  } catch (error) {
    logger.error('Failed to compute KPI summary', { agentId, message: error.message });
    throw error;
  }
}

export async function getAgentSummaries() {
  try {
    const result = await query(AGENT_SUMMARIES);
    return result.rows;
  } catch (error) {
    logger.error('Failed to compute agent summaries', { message: error.message });
    throw error;
  }
}
