const criteria = [
  'Goal Completion',
  'Qualification',
  'Objection Handling',
  'Data Capture',
  'Compliance'
];

const agents = [
  ['Dental Intake AI', 'Book consultation appointments for a dental clinic.', 8.1],
  ['HVAC Scheduler AI', 'Schedule service calls for heating or cooling issues.', 7.6],
  ['MedSpa Concierge AI', 'Qualify interest and book aesthetic consultations.', 7.2],
  ['Legal Intake AI', 'Qualify legal inquiries and route consultation-ready callers.', 6.9],
  ['Roofing Estimate AI', 'Book roof inspection appointments for homeowners.', 7.8]
].map(([name, goal, baseScore], index) => ({
  id: index + 1,
  location_id: 'demo-location',
  ghl_agent_id: `demo-agent-${index + 1}`,
  name,
  goal,
  kpi_config: {
    criteria: criteria.map((criterion) => ({
      name: criterion,
      description: `${criterion} quality signal for Voice AI review.`,
      weight: 0.2
    }))
  },
  baseScore
}));

const failureTypes = [
  null,
  null,
  'Objection Handling',
  'Goal Completion',
  null,
  'Data Capture',
  null,
  'Compliance',
  'Qualification'
];

const recommendations = {
  'Objection Handling': 'Respond to price or comparison concerns with a concrete reason to continue.',
  'Goal Completion': 'Replace vague callbacks with a specific appointment or owned next step.',
  'Data Capture': 'Collect contact details and service context before ending the call.',
  Compliance: 'Avoid guarantees and describe the evaluation process instead.',
  Qualification: 'Ask one more fit or urgency question before recommending the next step.'
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function callDate(index) {
  const date = new Date();
  date.setDate(date.getDate() - Math.floor(index / 3));
  date.setHours(9 + (index % 9), (index * 7) % 60, 0, 0);
  return date.toISOString();
}

function scoreFor(agent, index, failureType) {
  const wave = Math.sin(index / 6) * 0.45;
  const penalty = failureType ? 1.25 + (index % 3) * 0.3 : 0;
  return round(clamp(agent.baseScore + wave - penalty, 3.8, 9.7));
}

function transcript(agent, index, failureType) {
  const lastLine = failureType
    ? recommendations[failureType]
    : 'I can reserve one of two available times now and confirm the best phone number.';

  return [
    { speaker: 'Agent', text: `Thanks for calling. This is ${agent.name}. How can I help today?`, timestamp: '00:00' },
    { speaker: 'Caller', text: 'I want to understand availability and next steps.', timestamp: '00:06' },
    { speaker: 'Agent', text: 'I can help with that. What timeline are you hoping for?', timestamp: '00:14' },
    { speaker: 'Caller', text: index % 2 ? 'Sooner is better if you have anything open.' : 'I am comparing options right now.', timestamp: '00:22' },
    { speaker: 'Agent', text: lastLine, timestamp: '00:34' }
  ];
}

function buildAnalysis(agent, score, failureType, segment) {
  const priority = score < 6.4 ? 'high' : score < 7.4 ? 'medium' : 'low';
  const action = failureType ? recommendations[failureType] : 'Keep offering specific next-step options.';

  return {
    overall_score: score,
    kpi_scores: Object.fromEntries(
      criteria.map((criterion, index) => [
        criterion,
        {
          score: round(clamp(score + 0.4 - index * 0.15 - (criterion === failureType ? 1 : 0), 0, 10)),
          reasoning: `${criterion} was evaluated against the configured rubric.`
        }
      ])
    ),
    failures: failureType
      ? [{ type: failureType, description: `${agent.name} underperformed on ${failureType}.`, transcript_segment: segment }]
      : [],
    recommendations: [{ priority, action, reasoning: `This is the highest leverage coaching point for ${agent.name}.` }],
    use_actions: [{ segment, reason: 'High leverage call moment.', suggested_action: action }]
  };
}

const transcripts = Array.from({ length: 180 }, (_, index) => {
  const agent = agents[index % agents.length];
  const failureType = failureTypes[(index + agent.id) % failureTypes.length];
  const score = scoreFor(agent, index, failureType);
  const rawTranscript = transcript(agent, index, failureType);
  const analysis = buildAnalysis(agent, score, failureType, rawTranscript.at(-1).text);

  return {
    id: index + 1,
    agent_id: agent.id,
    agent_name: agent.name,
    agent_goal: agent.goal,
    ghl_conversation_id: `demo-fallback-${String(index + 1).padStart(3, '0')}`,
    caller_phone: `+1555${String(1000000 + index).slice(-7)}`,
    duration_seconds: 95 + ((index * 17) % 360),
    call_date: callDate(index),
    raw_transcript: rawTranscript,
    full_text: rawTranscript.map((line) => `${line.speaker}: ${line.text}`).join('\n'),
    analyzed: true,
    status: score >= 7 ? 'Pass' : 'Fail',
    ...analysis
  };
});

function average(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

function topFailures(rows) {
  const counts = new Map();
  rows.flatMap((row) => row.failures).forEach((failure) => {
    counts.set(failure.type, (counts.get(failure.type) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 5);
}

function scoreDistribution(rows) {
  const buckets = ['0-4.9', '5.0-5.9', '6.0-6.9', '7.0-7.9', '8.0-8.9', '9.0-10'];
  return buckets.map((bucket) => ({
    bucket,
    count: rows.filter((row) => {
      const score = Number(row.overall_score);
      if (bucket === '0-4.9') return score < 5;
      if (bucket === '5.0-5.9') return score >= 5 && score < 6;
      if (bucket === '6.0-6.9') return score >= 6 && score < 7;
      if (bucket === '7.0-7.9') return score >= 7 && score < 8;
      if (bucket === '8.0-8.9') return score >= 8 && score < 9;
      return score >= 9;
    }).length
  }));
}

function dailyTrend(rows) {
  const byDay = new Map();
  rows.forEach((row) => {
    const day = row.call_date.slice(0, 10);
    byDay.set(day, [...(byDay.get(day) || []), row]);
  });
  return [...byDay.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-60)
    .map(([day, dayRows]) => ({
      day,
      avg_score: average(dayRows.map((row) => row.overall_score)),
      pass_rate: (dayRows.filter((row) => row.overall_score >= 7).length / dayRows.length) * 100,
      analyzed_count: dayRows.length
    }));
}

function recentRecommendations(rows) {
  const seen = new Set();
  return rows
    .flatMap((row) => row.recommendations)
    .filter((item) => {
      if (seen.has(item.action)) return false;
      seen.add(item.action);
      return true;
    })
    .slice(0, 8);
}

export function demoAgents() {
  return agents.map((agent) => {
    const rows = transcripts.filter((row) => row.agent_id === agent.id);
    return {
      ...agent,
      avg_score: average(rows.map((row) => row.overall_score)),
      pass_rate: (rows.filter((row) => row.overall_score >= 7).length / rows.length) * 100,
      call_count: rows.length,
      analyzed_count: rows.length,
      critical_count: rows.filter((row) => row.overall_score < 6).length,
      failure_count: rows.flatMap((row) => row.failures).length
    };
  });
}

export function demoSummary(agentId = null) {
  const rows = agentId ? transcripts.filter((row) => row.agent_id === Number(agentId)) : transcripts;
  return {
    avg_score: average(rows.map((row) => row.overall_score)),
    pass_rate: (rows.filter((row) => row.overall_score >= 7).length / rows.length) * 100,
    avg_duration_seconds: average(rows.map((row) => row.duration_seconds)),
    lowest_score: Math.min(...rows.map((row) => row.overall_score)),
    highest_score: Math.max(...rows.map((row) => row.overall_score)),
    critical_count: rows.filter((row) => row.overall_score < 6).length,
    top_failures: topFailures(rows),
    score_distribution: scoreDistribution(rows),
    daily_trend: dailyTrend(rows),
    recent_recommendations: recentRecommendations(rows),
    call_count: rows.length,
    analyzed_count: rows.length
  };
}

export function demoTranscripts({ agentId = null, limit = 20, offset = 0 } = {}) {
  return transcripts
    .filter((row) => !agentId || row.agent_id === Number(agentId))
    .sort((left, right) => new Date(right.call_date) - new Date(left.call_date))
    .slice(offset, offset + limit);
}

export function demoTranscript(id) {
  return transcripts.find((row) => row.id === Number(id));
}

export function demoAgentInsights(id) {
  const agent = agents.find((row) => row.id === Number(id));
  const rows = demoTranscripts({ agentId: id, limit: 40 });
  const kpi_breakdown = criteria.map((name) => ({
    name,
    score: average(rows.map((row) => row.kpi_scores[name]?.score)),
    trend: '→'
  }));
  return {
    agent,
    summary: demoSummary(id),
    recommendations: recentRecommendations(rows).slice(0, 3),
    kpi_breakdown
  };
}
