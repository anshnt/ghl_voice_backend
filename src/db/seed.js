import 'dotenv/config';
import { pool, query, withTransaction } from './index.js';
import { logger } from '../utils/logger.js';

const LOCATION_ID = 'demo-location';
const CALL_COUNT = 180;

const UPSERT_AGENT = `
  INSERT INTO agents (location_id, ghl_agent_id, name, goal, script, kpi_config)
  VALUES ($1, $2, $3, $4, $5, $6)
  ON CONFLICT (ghl_agent_id)
  DO UPDATE SET
    name = EXCLUDED.name,
    goal = EXCLUDED.goal,
    script = EXCLUDED.script,
    kpi_config = EXCLUDED.kpi_config
  RETURNING id, name, goal
`;

const INSERT_TRANSCRIPT = `
  INSERT INTO transcripts (
    agent_id,
    ghl_conversation_id,
    caller_phone,
    duration_seconds,
    call_date,
    raw_transcript,
    full_text,
    analyzed
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, true)
  ON CONFLICT (ghl_conversation_id) DO NOTHING
  RETURNING id
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
  ON CONFLICT (transcript_id) DO NOTHING
`;

const criteria = [
  {
    name: 'Goal Completion',
    description: 'The agent drives the caller to a booked or clearly confirmed next step.',
    weight: 0.3
  },
  {
    name: 'Qualification',
    description: 'The agent captures need, timing, fit, and urgency before recommending action.',
    weight: 0.22
  },
  {
    name: 'Objection Handling',
    description: 'The agent handles hesitation, price sensitivity, and comparison shopping.',
    weight: 0.18
  },
  {
    name: 'Data Capture',
    description: 'The agent confirms contact details, address, preferred time, and service context.',
    weight: 0.15
  },
  {
    name: 'Compliance',
    description: 'The agent avoids unsupported claims and keeps a professional, policy-safe tone.',
    weight: 0.15
  }
];

const agents = [
  {
    ghlId: 'voice-agent-dental',
    name: 'Dental Intake AI',
    goal: 'Book consultation appointments for a dental clinic.',
    script: 'Confirm need, urgency, appointment preference, and contact information.',
    baseScore: 8.1
  },
  {
    ghlId: 'voice-agent-hvac',
    name: 'HVAC Scheduler AI',
    goal: 'Schedule service calls for homeowners with heating or cooling issues.',
    script: 'Identify equipment issue, urgency, address, and arrival window.',
    baseScore: 7.6
  },
  {
    ghlId: 'voice-agent-medspa',
    name: 'MedSpa Concierge AI',
    goal: 'Qualify interest and book aesthetic treatment consultations.',
    script: 'Ask treatment interest, prior experience, timeline, and booking preference.',
    baseScore: 7.2
  },
  {
    ghlId: 'voice-agent-legal',
    name: 'Legal Intake AI',
    goal: 'Qualify legal inquiries and route high-intent callers to a consultation.',
    script: 'Capture matter type, jurisdiction, urgency, and safe handoff details.',
    baseScore: 6.9
  },
  {
    ghlId: 'voice-agent-roofing',
    name: 'Roofing Estimate AI',
    goal: 'Book roof inspection appointments for homeowners.',
    script: 'Ask property issue, insurance status, timeline, address, and inspection window.',
    baseScore: 7.8
  }
];

const callerNeeds = [
  'I want to book an appointment this week.',
  'I need pricing before I decide.',
  'I am comparing a few providers right now.',
  'I need help as soon as possible.',
  'Can someone call me back after work?',
  'I have a question before scheduling.',
  'I am ready to book if you have availability.',
  'I need to understand whether this is covered.',
  'I tried another company and did not get a clear answer.',
  'I want the earliest available time.'
];

const outcomes = [
  {
    text: 'I can book you for Thursday at 10:30 or Friday at 2:00. Which works better?',
    lift: 0.7,
    failure: null,
    action: 'Keep offering two concrete appointment windows when intent is high.'
  },
  {
    text: 'Prices vary by case, so you can check the website and call back if it works.',
    lift: -1.7,
    failure: 'Objection Handling',
    action: 'Answer pricing hesitation with a range, context, and a low-friction consultation step.'
  },
  {
    text: 'Before I recommend a time, can I confirm what changed and how urgent this feels?',
    lift: 0.4,
    failure: null,
    action: 'Continue qualifying urgency before presenting the booking path.'
  },
  {
    text: 'Someone from the office can follow up later with details.',
    lift: -1.4,
    failure: 'Goal Completion',
    action: 'Replace vague callbacks with a scheduled time or confirmed owner.'
  },
  {
    text: 'I can help with that. What is the best phone number and service address?',
    lift: 0.2,
    failure: null,
    action: 'Confirm contact details immediately after need is established.'
  },
  {
    text: 'That should be fine. You can probably schedule online.',
    lift: -1.2,
    failure: 'Data Capture',
    action: 'Collect required details in-call instead of pushing the caller to self-serve.'
  },
  {
    text: 'A consultation is the safest next step, and I can reserve one now.',
    lift: 0.6,
    failure: null,
    action: 'Use safety-oriented language while still asking for the booking.'
  },
  {
    text: 'We guarantee this will solve the issue quickly.',
    lift: -2.0,
    failure: 'Compliance',
    action: 'Avoid guarantees; describe the evaluation process and realistic next step.'
  }
];

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function roundScore(value) {
  return Math.round(value * 10) / 10;
}

function pick(items, index, offset = 0) {
  return items[(index + offset) % items.length];
}

function callDate(index) {
  const date = new Date();
  date.setDate(date.getDate() - Math.floor(index / 3));
  date.setHours(9 + (index % 9), (index * 7) % 60, 0, 0);
  return date;
}

function scoreFor(agent, outcome, index) {
  const wave = Math.sin(index / 6) * 0.45;
  const weekdayLift = callDate(index).getDay() === 1 ? -0.25 : 0.15;
  return roundScore(clamp(agent.baseScore + outcome.lift + wave + weekdayLift, 3.2, 9.8));
}

function transcriptLines(agent, need, outcome, index) {
  return [
    {
      speaker: 'Agent',
      text: `Thanks for calling. This is ${agent.name}. How can I help today?`,
      timestamp: '00:00'
    },
    { speaker: 'Caller', text: need, timestamp: '00:06' },
    {
      speaker: 'Agent',
      text: 'I can help with that. What timeline are you hoping for?',
      timestamp: '00:14'
    },
    {
      speaker: 'Caller',
      text: pick(
        [
          'Ideally this week if you have availability.',
          'I am flexible, but I want to understand the next step.',
          'Sooner is better because this has been bothering me.',
          'I can do mornings or late afternoon.'
        ],
        index
      ),
      timestamp: '00:23'
    },
    { speaker: 'Agent', text: outcome.text, timestamp: '00:34' }
  ];
}

function fullText(lines) {
  return lines.map((line) => `${line.speaker}: ${line.text}`).join('\n');
}

function kpiScore(score, delta) {
  return roundScore(clamp(score + delta, 0, 10));
}

function analysis(agent, score, outcome) {
  const isFailure = score < 7 || outcome.failure;
  const failureType = outcome.failure || (score < 7 ? 'Goal Completion' : null);
  const priority = score < 6.4 ? 'high' : score < 7.4 ? 'medium' : 'low';

  return {
    overall_score: score,
    kpi_scores: {
      'Goal Completion': {
        score: kpiScore(score, failureType === 'Goal Completion' ? -0.8 : 0.2),
        reasoning: 'The call was scored on whether it created a concrete next step.'
      },
      Qualification: {
        score: kpiScore(score, failureType === 'Qualification' ? -0.9 : -0.1),
        reasoning: 'The agent was evaluated on need, urgency, timing, and fit discovery.'
      },
      'Objection Handling': {
        score: kpiScore(score, failureType === 'Objection Handling' ? -1.1 : -0.2),
        reasoning: 'The agent was checked for useful responses to hesitation and pricing concerns.'
      },
      'Data Capture': {
        score: kpiScore(score, failureType === 'Data Capture' ? -1 : 0),
        reasoning: 'The agent was checked for contact and service detail collection.'
      },
      Compliance: {
        score: kpiScore(score, failureType === 'Compliance' ? -1.3 : 0.4),
        reasoning: 'The call remained professional and avoided risky promises unless flagged.'
      }
    },
    failures: isFailure
      ? [
          {
            type: failureType,
            description: `${agent.name} needs a stronger ${failureType.toLowerCase()} move here.`,
            transcript_segment: outcome.text
          }
        ]
      : [],
    recommendations: [
      {
        priority,
        action: outcome.action,
        reasoning: `This recommendation targets ${agent.name}'s most recent scoring pattern.`
      }
    ],
    use_actions: [
      {
        segment: outcome.text,
        reason: 'This moment has high leverage for the next best action.',
        suggested_action: outcome.action
      }
    ]
  };
}

async function seedAgents(client) {
  const rows = [];
  for (const agent of agents) {
    const result = await client.query(UPSERT_AGENT, [
      LOCATION_ID,
      agent.ghlId,
      agent.name,
      agent.goal,
      agent.script,
      JSON.stringify({ criteria })
    ]);
    rows.push({ ...agent, id: result.rows[0].id });
  }
  return rows;
}

async function insertCall(client, agent, index) {
  const need = pick(callerNeeds, index, agent.id);
  const outcome = pick(outcomes, index, agent.id * 2);
  const score = scoreFor(agent, outcome, index);
  const lines = transcriptLines(agent, need, outcome, index);
  const inserted = await client.query(INSERT_TRANSCRIPT, [
    agent.id,
    `demo-bulk-conversation-${String(index + 1).padStart(3, '0')}`,
    `+1555${String(1000000 + index).slice(-7)}`,
    95 + ((index * 17) % 360),
    callDate(index),
    JSON.stringify(lines),
    fullText(lines),
    true
  ]);

  const transcript = inserted.rows[0];
  if (!transcript) return false;

  const result = analysis(agent, score, outcome);
  await client.query(INSERT_ANALYSIS, [
    transcript.id,
    result.overall_score,
    JSON.stringify(result.kpi_scores),
    JSON.stringify(result.failures),
    JSON.stringify(result.recommendations),
    JSON.stringify(result.use_actions),
    JSON.stringify(result)
  ]);
  return true;
}

async function seed() {
  try {
    let inserted = 0;
    await withTransaction(async (client) => {
      const seededAgents = await seedAgents(client);
      for (let index = 0; index < CALL_COUNT; index += 1) {
        const agent = seededAgents[index % seededAgents.length];
        if (await insertCall(client, agent, index)) inserted += 1;
      }
    });

    const count = await query('SELECT COUNT(*)::INTEGER AS count FROM transcripts');
    logger.info('Seed completed', { inserted, transcripts: count.rows[0].count });
  } catch (error) {
    logger.error('Seed failed', { message: error.message });
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

await seed();
