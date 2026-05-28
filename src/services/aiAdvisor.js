import { GoogleGenerativeAI } from '@google/generative-ai';
import { demoAgents, demoSummary, demoTranscripts } from './demoData.js';
import { getAgentSummaries, getKpiSummary } from './kpiEvaluator.js';
import { logger } from '../utils/logger.js';

function priorityFromSummary(summary) {
  if (summary.pass_rate < 50 || summary.critical_count > 20) return 'high';
  if (summary.pass_rate < 70) return 'medium';
  return 'low';
}

function localSuggestions(summary, agents) {
  const weakestAgent = [...agents].sort((a, b) => (a.avg_score || 0) - (b.avg_score || 0))[0];
  const topFailure = summary.top_failures?.[0]?.type || 'Goal Completion';

  return [
    {
      priority: priorityFromSummary(summary),
      action: `Coach ${weakestAgent?.name || 'the lowest scoring agent'} on ${topFailure}.`,
      reasoning: `${topFailure} is the highest frequency failure and should be addressed first.`
    },
    {
      priority: 'medium',
      action: 'Review critical calls below 6.0 before tuning prompts.',
      reasoning: 'Critical calls usually reveal the most expensive workflow misses.'
    },
    {
      priority: 'low',
      action: 'Keep the current high-performing call patterns in the agent script examples.',
      reasoning: 'Stable examples reduce regression risk when prompts change.'
    }
  ];
}

async function loadContext() {
  try {
    const [summary, agents] = await Promise.all([getKpiSummary(), getAgentSummaries()]);
    return { summary, agents, source: 'database' };
  } catch (error) {
    logger.warn('AI advisor using demo context', { message: error.message });
    return { summary: demoSummary(), agents: demoAgents(), source: 'demo' };
  }
}

function compactContext({ summary, agents }) {
  return {
    avg_score: Number(summary.avg_score || 0).toFixed(1),
    pass_rate: Math.round(summary.pass_rate || 0),
    critical_count: summary.critical_count || 0,
    top_failures: (summary.top_failures || []).slice(0, 3),
    agents: agents.slice(0, 5).map((agent) => ({
      name: agent.name,
      avg_score: Number(agent.avg_score || 0).toFixed(1),
      pass_rate: Math.round(agent.pass_rate || 0),
      critical_count: agent.critical_count || 0
    })),
    recent_failed_calls: demoTranscripts({ limit: 12 })
      .filter((call) => call.status === 'Fail')
      .slice(0, 5)
      .map((call) => ({
        agent: call.agent_name,
        score: call.overall_score,
        failure: call.failures?.[0]?.type || 'Unknown'
      }))
  };
}

function model(maxOutputTokens) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    generationConfig: {
      maxOutputTokens,
      temperature: 0.2
    }
  });
}

async function askGemini(prompt, maxOutputTokens) {
  if (!process.env.GEMINI_API_KEY || process.env.NODE_ENV === 'test') return null;

  try {
    const result = await model(maxOutputTokens).generateContent(prompt);
    return result.response.text().trim();
  } catch (error) {
    logger.warn('Gemini advisor request failed', { message: error.message });
    return null;
  }
}

export async function getAiSuggestions() {
  const context = await loadContext();
  const compact = compactContext(context);
  const fallback = localSuggestions(context.summary, context.agents);
  const prompt = [
    'Return ONLY JSON array of 3 coaching recommendations.',
    'Each item: {"priority":"high|medium|low","action":"short","reasoning":"short"}.',
    `Data: ${JSON.stringify(compact)}`
  ].join('\n');
  const response = await askGemini(prompt, 360);

  if (!response) return { source: context.source, suggestions: fallback };

  try {
    return { source: context.source, suggestions: JSON.parse(response) };
  } catch (error) {
    logger.warn('Gemini suggestions JSON parse failed', { message: error.message });
    return { source: context.source, suggestions: fallback };
  }
}

export async function answerDataQuestion(question) {
  const trimmedQuestion = String(question || '').trim().slice(0, 500);
  const context = await loadContext();
  const compact = compactContext(context);

  if (!trimmedQuestion) {
    return { source: context.source, answer: 'Ask a question about scores, failures, agents, or calls.' };
  }

  const prompt = [
    'Answer as a concise Voice AI analytics copilot in 120 words or fewer.',
    'Use only this summarized dataset. If data is insufficient, say what is missing.',
    `Data: ${JSON.stringify(compact)}`,
    `Question: ${trimmedQuestion}`
  ].join('\n');
  const response = await askGemini(prompt, 220);

  if (response) return { source: context.source, answer: response };

  return {
    source: context.source,
    answer: `Current average score is ${compact.avg_score}, pass rate is ${compact.pass_rate}%, and the top failure is ${compact.top_failures[0]?.type || 'not available'}.`
  };
}
