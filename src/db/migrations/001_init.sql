CREATE TABLE IF NOT EXISTS ghl_accounts (
  id SERIAL PRIMARY KEY,
  location_id TEXT UNIQUE NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agents (
  id SERIAL PRIMARY KEY,
  location_id TEXT NOT NULL,
  ghl_agent_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  goal TEXT,
  script TEXT,
  kpi_config JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transcripts (
  id SERIAL PRIMARY KEY,
  agent_id INTEGER REFERENCES agents(id),
  ghl_conversation_id TEXT UNIQUE NOT NULL,
  caller_phone TEXT,
  duration_seconds INTEGER,
  call_date TIMESTAMPTZ,
  raw_transcript JSONB,
  full_text TEXT,
  analyzed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS analysis_results (
  id SERIAL PRIMARY KEY,
  transcript_id INTEGER REFERENCES transcripts(id) UNIQUE,
  overall_score NUMERIC(4,2),
  kpi_scores JSONB,
  failures JSONB,
  recommendations JSONB,
  use_actions JSONB,
  raw_gemini_response TEXT,
  analyzed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transcripts_agent_id ON transcripts(agent_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_analyzed ON transcripts(analyzed);
CREATE INDEX IF NOT EXISTS idx_analysis_results_transcript_id ON analysis_results(transcript_id);
CREATE INDEX IF NOT EXISTS idx_agents_location_id ON agents(location_id);
