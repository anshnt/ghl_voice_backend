import * as ghlSdk from '@gohighlevel/api-client';
import { query } from '../db/index.js';
import { logger } from '../utils/logger.js';

const UPSERT_ACCOUNT = `
  INSERT INTO ghl_accounts (location_id, access_token, refresh_token, token_expires_at)
  VALUES ($1, $2, $3, $4)
  ON CONFLICT (location_id)
  DO UPDATE SET
    access_token = EXCLUDED.access_token,
    refresh_token = EXCLUDED.refresh_token,
    token_expires_at = EXCLUDED.token_expires_at
  RETURNING *
`;

const GET_ACCOUNT = `
  SELECT location_id, access_token, refresh_token, token_expires_at
  FROM ghl_accounts
  WHERE location_id = $1
`;

const LIST_ACCOUNTS = `
  SELECT location_id, access_token, refresh_token, token_expires_at
  FROM ghl_accounts
  ORDER BY created_at ASC
`;

function toExpiresAt(tokenData) {
  if (tokenData.token_expires_at) return tokenData.token_expires_at;
  if (tokenData.expires_at) return new Date(tokenData.expires_at);
  const seconds = Number(tokenData.expires_in || 3600);
  return new Date(Date.now() + seconds * 1000);
}

export class PostgresSessionStorage {
  async get(locationId) {
    try {
      const result = await query(GET_ACCOUNT, [locationId]);
      const account = result.rows[0];
      if (!account) return null;

      return {
        locationId: account.location_id,
        access_token: account.access_token,
        refresh_token: account.refresh_token,
        token_expires_at: account.token_expires_at
      };
    } catch (error) {
      logger.error('Failed to load GHL session', { locationId, message: error.message });
      throw error;
    }
  }

  async set(locationId, tokenData) {
    try {
      const result = await query(UPSERT_ACCOUNT, [
        locationId,
        tokenData.access_token,
        tokenData.refresh_token,
        toExpiresAt(tokenData)
      ]);
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to save GHL session', { locationId, message: error.message });
      throw error;
    }
  }
}

const sessionStorage = new PostgresSessionStorage();
const HighLevel = ghlSdk.HighLevel || ghlSdk.default;

export const highLevel = new HighLevel({
  clientId: process.env.GHL_CLIENT_ID,
  clientSecret: process.env.GHL_CLIENT_SECRET,
  redirectUri: process.env.GHL_REDIRECT_URI,
  sessionStorage
});

export async function seedSandboxAccountFromEnv() {
  try {
    if (!process.env.GHL_SANDBOX_LOCATION_ID || !process.env.GHL_SANDBOX_ACCESS_TOKEN) return;

    await sessionStorage.set(process.env.GHL_SANDBOX_LOCATION_ID, {
      access_token: process.env.GHL_SANDBOX_ACCESS_TOKEN,
      refresh_token: process.env.GHL_SANDBOX_REFRESH_TOKEN || 'sandbox-refresh-token',
      token_expires_at: process.env.GHL_SANDBOX_TOKEN_EXPIRES_AT || new Date(Date.now() + 86400000)
    });
    logger.info('Loaded sandbox GHL credentials from environment');
  } catch (error) {
    logger.error('Failed to seed sandbox GHL credentials', { message: error.message });
  }
}

async function retryRateLimit(work, context) {
  try {
    return await work();
  } catch (error) {
    const status = error.response?.status || error.status;
    if (status !== 429) throw error;

    logger.warn('GHL rate limit hit; retrying once', context);
    await new Promise((resolve) => {
      setTimeout(resolve, 2000);
    });
    return work();
  }
}

function locationClient(locationId) {
  if (typeof highLevel.location === 'function') {
    return highLevel.location(locationId);
  }

  return highLevel;
}

export async function listInstalledLocations() {
  try {
    const result = await query(LIST_ACCOUNTS);
    return result.rows.map((row) => row.location_id);
  } catch (error) {
    logger.error('Failed to list installed GHL locations', { message: error.message });
    throw error;
  }
}

export async function searchVoiceConversations(locationId) {
  try {
    const client = locationClient(locationId);
    return await retryRateLimit(
      async () =>
        client.conversations.search({
          locationId,
          provider: 'Call',
          type: 'TYPE_VOICE'
        }),
      { locationId, operation: 'searchVoiceConversations' }
    );
  } catch (error) {
    logger.error('Failed to search GHL voice conversations', { locationId, message: error.message });
    throw error;
  }
}

export async function getConversationMessages(locationId, conversationId) {
  try {
    const client = locationClient(locationId);
    return await retryRateLimit(
      async () => client.conversations.messages.list({ conversationId }),
      { locationId, conversationId, operation: 'getConversationMessages' }
    );
  } catch (error) {
    logger.error('Failed to fetch GHL conversation messages', {
      locationId,
      conversationId,
      message: error.message
    });
    throw error;
  }
}

export async function markConversationProcessed(locationId, conversationId) {
  try {
    const client = locationClient(locationId);
    if (!client.conversations.messages.update) return;

    await retryRateLimit(
      async () =>
        client.conversations.messages.update({
          conversationId,
          processed: true
        }),
      { locationId, conversationId, operation: 'markConversationProcessed' }
    );
  } catch (error) {
    logger.warn('Unable to mark GHL conversation processed', {
      locationId,
      conversationId,
      message: error.message
    });
  }
}
