import { describe, expect, it } from 'vitest';
import { demoAgentInsights, demoAgents, demoSummary, demoTranscript, demoTranscripts } from './demoData.js';

describe('demoData', () => {
  it('creates a large analytics-ready dataset', () => {
    const summary = demoSummary();
    const agents = demoAgents();
    const transcripts = demoTranscripts({ limit: 200 });

    expect(summary.call_count).toBe(180);
    expect(summary.analyzed_count).toBe(180);
    expect(summary.score_distribution).toHaveLength(6);
    expect(summary.top_failures.length).toBeGreaterThan(0);
    expect(agents).toHaveLength(5);
    expect(transcripts).toHaveLength(180);
  });

  it('returns transcript detail and agent insights by id', () => {
    const transcript = demoTranscript(1);
    const insights = demoAgentInsights(1);

    expect(transcript.raw_transcript.length).toBeGreaterThan(0);
    expect(transcript.recommendations.length).toBeGreaterThan(0);
    expect(insights.agent.name).toBe('Dental Intake AI');
    expect(insights.kpi_breakdown.length).toBeGreaterThan(0);
  });
});
