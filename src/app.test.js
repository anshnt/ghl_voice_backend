import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

describe('Express app', () => {
  let app;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DEMO_DATA_FALLBACK = 'true';
    process.env.GHL_CLIENT_ID = 'test-client-id';
    process.env.GHL_CLIENT_SECRET = 'test-client-secret';
    process.env.GHL_REDIRECT_URI = 'http://localhost:3000/auth/callback';
    const { createApp } = await import('./app.js');
    app = createApp();
  });

  it('returns health status', async () => {
    const response = await request(app).get('/health').expect(200);
    expect(response.body).toEqual({ ok: true });
  });

  it('returns KPI summary with fallback analytics', async () => {
    const response = await request(app).get('/kpi/summary').expect(200);
    expect(response.body.summary.call_count).toBe(180);
    expect(response.body.agents).toHaveLength(5);
  });

  it('returns paginated transcripts', async () => {
    const response = await request(app).get('/transcripts?limit=3').expect(200);
    expect(response.body.transcripts).toHaveLength(3);
    expect(response.body.transcripts[0]).toHaveProperty('agent_name');
  });

  it('returns transcript detail', async () => {
    const response = await request(app).get('/transcripts/1').expect(200);
    expect(response.body.transcript.id).toBe(1);
    expect(response.body.transcript.raw_transcript.length).toBeGreaterThan(0);
  });

  it('returns AI suggestions and chat answers without external Gemini calls in tests', async () => {
    const suggestions = await request(app).get('/ai/suggestions').expect(200);
    expect(suggestions.body.suggestions.length).toBeGreaterThan(0);

    const chat = await request(app)
      .post('/ai/chat')
      .send({ question: 'Which failure is most common?' })
      .expect(200);
    expect(chat.body.answer).toContain('Current average score');
  });
});
