import { GoogleGenerativeAI } from '@google/generative-ai';
import { query, withTransaction } from '../db/index.js';
import { logger } from '../utils/logger.js';

const GET_TRANSCRIPT_CONTEXT = `
  SELECT
    t.id,
    t.full_text,
    a.goal,
    a.name AS agent_name,
    a.kpi_config
  FROM transcripts t
  JOIN agents a ON a.id = t.agent_id
  WHERE t.id = $1
`;

const INSERT_ANALYSIS = `
  INSERT INTO analysis_results (
    transcript_id,
    overall_score,
    kpi_scores,
    failures,
    recommendations,
    use_actions,
    raw_gemini_response
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7)
  ON CONFLICT (transcript_id)
  DO UPDATE SET
    overall_score = EXCLUDED.overall_score,
    kpi_scores = EXCLUDED.kpi_scores,
    failures = EXCLUDED.failures,
    recommendations = EXCLUDED.recommendations,
    use_actions = EXCLUDED.use_actions,
    raw_gemini_response = EXCLUDED.raw_gemini_response,
    analyzed_at = NOW()
`;

const MARK_ANALYZED = `
  UPDATE transcripts
  SET analyzed = true
  WHERE id = $1
`;

function getModel() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
}

function extractJson(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) return trimmed;
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  return match ? match[1].trim() : trimmed;
}

function buildPrompt(context) {
  const kpiConfig = context.kpi_config || { criteria: [] };

  return [
    'You are scoring a HighLevel Voice AI call transcript.',
    'Respond ONLY in valid JSON matching the requested schema. Do not include markdown.',
    '',
    `Agent name: ${context.agent_name}`,
    `Agent goal: ${context.goal || 'No goal provided'}`,
    `KPI criteria: ${JSON.stringify(kpiConfig.criteria || [])}`,
    '',
    'Return this schema:',
    JSON.stringify({
      overall_score: 'number 0-10',
      kpi_scores: {
        '[criterion_name]': {
          score: 'number 0-10',
          reasoning: 'string'
        }
      },
      failures: [
        {
          type: 'string',
          description: 'string',
          transcript_segment: 'string exact quote from transcript'
        }
      ],
      recommendations: [
        {
          priority: 'high|medium|low',
          action: 'string',
          reasoning: 'string'
        }
      ],
      use_actions: [
        {
          segment: 'string exact quote',
          reason: 'string',
          suggested_action: 'string'
        }
      ]
    }),
    '',
    'Transcript:',
    context.full_text
  ].join('\n');
}

async function loadTranscriptContext(transcriptId) {
  try {
    const result = await query(GET_TRANSCRIPT_CONTEXT, [transcriptId]);
    return result.rows[0];
  } catch (error) {
    logger.error('Failed to load transcript for Gemini analysis', {
      transcriptId,
      message: error.message
    });
    throw error;
  }
}

async function storeAnalysis(transcriptId, parsed, rawText) {
  try {
    await withTransaction(async (client) => {
      await client.query(INSERT_ANALYSIS, [
        transcriptId,
        parsed.overall_score,
        JSON.stringify(parsed.kpi_scores || {}),
        JSON.stringify(parsed.failures || []),
        JSON.stringify(parsed.recommendations || []),
        JSON.stringify(parsed.use_actions || []),
        rawText
      ]);
      await client.query(MARK_ANALYZED, [transcriptId]);
    });
  } catch (error) {
    logger.error('Failed to store Gemini analysis', { transcriptId, message: error.message });
    throw error;
  }
}

export async function analyzeTranscript(transcriptId) {
  try {
    const context = await loadTranscriptContext(transcriptId);
    if (!context) {
      logger.warn('Transcript not found for analysis', { transcriptId });
      return null;
    }

    const result = await getModel().generateContent(buildPrompt(context));
    const rawText = result.response.text();
    const parsed = JSON.parse(extractJson(rawText));

    await storeAnalysis(transcriptId, parsed, rawText);
    logger.info('Stored Gemini analysis', { transcriptId, score: parsed.overall_score });
    return parsed;
  } catch (error) {
    logger.error('Gemini analysis skipped', { transcriptId, message: error.message });
    return null;
  }
}
