import cron from 'node-cron';
import { query } from '../db/index.js';
import { logger } from '../utils/logger.js';
import {
  getConversationMessages,
  listInstalledLocations,
  markConversationProcessed,
  searchVoiceConversations
} from './ghlClient.js';
import { analyzeTranscript } from './geminiAnalyzer.js';

const FIND_AGENT = `
  SELECT id
  FROM agents
  WHERE location_id = $1
  ORDER BY created_at ASC
  LIMIT 1
`;

const EXISTS_TRANSCRIPT = `
  SELECT id
  FROM transcripts
  WHERE ghl_conversation_id = $1
`;

const INSERT_TRANSCRIPT = `
  INSERT INTO transcripts (
    agent_id,
    ghl_conversation_id,
    caller_phone,
    duration_seconds,
    call_date,
    raw_transcript,
    full_text
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7)
  RETURNING id
`;

function normalizeList(payload, key) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.[key])) return payload[key];
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function mapMessage(message) {
  const speaker = message.direction === 'outbound' ? 'Agent' : 'Caller';
  return {
    speaker,
    text: message.body || message.message || message.text || '',
    timestamp: message.dateAdded || message.createdAt || message.timestamp || null
  };
}

function buildTranscript(messages) {
  const transcript = messages.map(mapMessage).filter((entry) => entry.text.trim().length > 0);
  const fullText = transcript
    .map((entry) => `${entry.speaker}: ${entry.text}`)
    .join('\n')
    .trim();

  return { transcript, fullText };
}

async function insertConversation(locationId, conversation) {
  try {
    const existing = await query(EXISTS_TRANSCRIPT, [conversation.id]);
    if (existing.rows.length > 0) return null;

    const agentResult = await query(FIND_AGENT, [locationId]);
    const agent = agentResult.rows[0];
    if (!agent) {
      logger.warn('Skipping conversation because no agent exists for location', { locationId });
      return null;
    }

    const messagePayload = await getConversationMessages(locationId, conversation.id);
    const messages = normalizeList(messagePayload, 'messages');
    const built = buildTranscript(messages);
    if (!built.fullText) return null;

    const result = await query(INSERT_TRANSCRIPT, [
      agent.id,
      conversation.id,
      conversation.contactPhone || conversation.phone || null,
      conversation.durationSeconds || conversation.duration_seconds || null,
      conversation.dateAdded || conversation.createdAt || new Date(),
      JSON.stringify(built.transcript),
      built.fullText
    ]);

    await markConversationProcessed(locationId, conversation.id);
    return result.rows[0].id;
  } catch (error) {
    logger.error('Failed to insert GHL conversation transcript', {
      locationId,
      conversationId: conversation.id,
      message: error.message
    });
    return null;
  }
}

async function pollLocation(locationId) {
  try {
    const payload = await searchVoiceConversations(locationId);
    const conversations = normalizeList(payload, 'conversations');
    let inserted = 0;

    for (const conversation of conversations) {
      const transcriptId = await insertConversation(locationId, conversation);
      if (!transcriptId) continue;

      inserted += 1;
      await analyzeTranscript(transcriptId);
    }

    logger.info('Completed GHL transcript poll', { locationId, inserted });
  } catch (error) {
    logger.error('GHL transcript poll failed for location', { locationId, message: error.message });
  }
}

export async function pollTranscriptsOnce() {
  try {
    const locations = await listInstalledLocations();
    for (const locationId of locations) {
      await pollLocation(locationId);
    }
  } catch (error) {
    logger.error('GHL transcript poll failed', { message: error.message });
  }
}

export function startTranscriptPoller() {
  cron.schedule('*/10 * * * *', async () => {
    await pollTranscriptsOnce();
  });

  logger.info('Transcript poller scheduled every 10 minutes');
}
