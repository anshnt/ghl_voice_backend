# Voice AI Observability Copilot - Backend

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-18%2B-green?style=flat-square" alt="Node.js">
  <img src="https://img.shields.io/badge/Express.js-4.21-blue?style=flat-square" alt="Express.js">
  <img src="https://img.shields.io/badge/PostgreSQL-14%2B-blue?style=flat-square" alt="PostgreSQL">
</p>

The backend service for the Voice AI Observability Copilot. It handles transcript ingestion from HighLevel (GHL), AI-powered analysis using Google Gemini, KPI scoring, and provides a REST API for the frontend dashboard.

---

## 📋 Table of Contents

- [Architecture](#-architecture)
- [Project Structure](#-project-structure)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
- [Configuration](#-configuration)
- [API Endpoints](#-api-endpoints)
- [Database Schema](#-database-schema)
- [Services](#-services)
- [Development](#-development)
- [Testing](#-testing)
- [Troubleshooting](#-troubleshooting)

---

## 🏗️ Architecture

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              BACKEND ARCHITECTURE                                    │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  ┌──────────────────────────────────────────────────────────────────────────────┐  │
│  │                           EXPRESS HTTP SERVER                                 │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │  │
│  │  │   /agents   │  │ /transcripts│  │    /kpi    │  │      /auth          │  │  │
│  │  │   Routes    │  │   Routes    │  │   Routes    │  │      Routes         │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────────────┘  │
│                                        │                                            │
│  ┌─────────────────────────────────────┼────────────────────────────────────────┐  │
│  │                           MIDDLEWARE LAYER                                    │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │  │
│  │  │    CORS     │  │  JSON Body  │  │   Error     │  │     Logger          │  │  │
│  │  │  Middleware │  │   Parser    │  │   Handler   │  │    Middleware       │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────────────────┘  │
│                                        │                                            │
│  ┌─────────────────────────────────────┼────────────────────────────────────────┐  │
│  │                           SERVICE LAYER                                       │  │
│  │                                                                               │  │
│  │  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────────┐  │  │
│  │  │ Transcript      │    │   Gemini        │    │    KPI                 │  │  │
│  │  │ Poller          │───▶│   Analyzer      │───▶│    Evaluator            │  │  │
│  │  │ (node-cron)     │    │   (AI)          │    │    (Scoring)          │  │  │
│  │  └─────────────────┘    └─────────────────┘    └─────────────────────────┘  │  │
│  │           │                       │                       │                    │  │
│  │           └───────────────────────┴───────────────────────┘                    │  │
│  │                                       │                                         │  │
│  │  ┌───────────────────────────────────┼─────────────────────────────────────┐  │  │
│  │  │                    GHL CLIENT SERVICE                                  │  │  │
│  │  │  ┌─────────────────┐    ┌─────────────────┐    ┌────────────────────┐ │  │  │
│  │  │  │   OAuth         │    │  Conversation  │    │   Webhook         │ │  │  │
│  │  │  │   Manager       │    │  Fetcher        │    │   Handler         │ │  │  │
│  │  │  └─────────────────┘    └─────────────────┘    └────────────────────┘ │  │  │
│  │  └─────────────────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────────────────┘  │
│                                        │                                            │
│  ┌─────────────────────────────────────┼────────────────────────────────────────┐  │
│  │                           DATA ACCESS LAYER                                 │  │
│  │  ┌─────────────────────────────────────────────────────────────────────────┐ │  │
│  │  │                    PostgreSQL Connection Pool (pg)                     │ │  │
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │ │  │
│  │  │  │  Migration  │  │    Seed     │  │   Query     │  │  Transaction│  │ │  │
│  │  │  │   Runner    │  │   Runner    │  │   Builder   │  │   Helper    │  │ │  │
│  │  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │ │  │
│  │  └─────────────────────────────────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────────────────────────────┘  │
│                                        │                                            │
│                                        ▼                                            │
│  ┌───────────────────────────────────────────────────────────────────────────────┐  │
│  │                           POSTGRESQL DATABASE                                │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐ │  │
│  │  │ghl_accounts  │  │    agents     │  │  transcripts │  │analysis_results│ │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └────────────────┘ │  │
│  └───────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              DATA FLOW DIAGRAM                                        │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│   GHL Platform                  Backend                          Database           │
│   ────────────                  ────────                          ────────          │
│                                                                                      │
│   ┌─────────────┐                                                               │
│   │ Voice AI    │                                                               │
│   │ Call        │                                                               │
│   └──────┬──────┘                                                               │
│          │                                                                       │
│          │ (Webhook / Polling)                                                  │
│          ▼                                                                       │
│   ┌─────────────┐         ┌─────────────────┐                                   │
│   │ Conversation│────────▶│ Transcript      │                                   │
│   │ Data        │         │ Poller          │                                   │
│   └─────────────┘         └────────┬────────┘                                   │
│                                    │                                              │
│                                    │ (New transcript found)                       │
│                                    ▼                                              │
│                           ┌─────────────────┐                                     │
│                           │ Gemini          │                                     │
│                           │ Analyzer        │──────┐                             │
│                           └─────────────────┘     │                             │
│                                    │                │ (API Call)                │
│                                    │                │                             │
│                                    ▼                │                             │
│                           ┌─────────────────┐     │                             │
│                           │ KPI             │◀────┘                             │
│                           │ Evaluator       │                                    │
│                           └────────┬────────┘                                   │
│                                    │                                              │
│                                    │ (Store results)                              │
│                                    ▼                                              │
│                           ┌─────────────────┐     ┌─────────────────┐           │
│                           │ PostgreSQL      │◀────│ transcripts     │           │
│                           │ Database        │     │ table           │           │
│                           └────────┬────────┘     └─────────────────┘           │
│                                    │                                              │
│                                    │ (Store analysis)                             │
│                                    ▼                                              │
│                           ┌─────────────────┐                                    │
│                           │ analysis_results│                                   │
│                           │ table           │                                    │
│                           └─────────────────┘                                    │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 📂 Project Structure

```
backend/
│
├── package.json                 # NPM dependencies and scripts
├── eslint.config.js            # ESLint configuration
├── .env.example                # Environment variables template
├── .gitignore                   # Git ignore patterns
│
└── src/
    │
    ├── index.js               # Express application entry point
    │
    ├── db/                    # Database layer
    │   ├── index.js           # PostgreSQL connection pool
    │   ├── migrate.js        # Database migration runner
    │   ├── seed.js           # Demo data seeder
    │   └── migrations/
    │       └── 001_init.sql  # Initial database schema
    │
    ├── routes/                # Express route handlers
    │   ├── agents.js         # Agent CRUD operations
    │   ├── auth.js           # OAuth authentication
    │   ├── kpi.js            # KPI configuration & summary
    │   └── transcripts.js    # Transcript retrieval
    │
    ├── services/              # Business logic services
    │   ├── ghlClient.js      # HighLevel API client
    │   ├── geminiAnalyzer.js # Google Gemini AI integration
    │   ├── kpiEvaluator.js   # KPI score calculations
    │   └── transcriptPoller.js # Cron-based transcript polling
    │
    └── utils/                 # Utility functions
        ├── asyncRoute.js     # Express async error handler
        ├── httpError.js      # Custom HTTP error class
        └── logger.js         # Logging utility
```

---

## 🛠️ Tech Stack

| Technology | Version | Description |
|------------|---------|-------------|
| Node.js | 18+ | JavaScript runtime |
| Express.js | ^4.21 | Web application framework |
| PostgreSQL | 14+ | Relational database |
| pg | ^8.13 | PostgreSQL client for Node.js |
| Google Gemini AI | ^0.24 | AI-powered transcript analysis |
| node-cron | ^3.0 | Cron job scheduler |
| cors | ^2.8 | CORS middleware |
| dotenv | ^16.4 | Environment variable loader |
| ESLint | ^9.19 | JavaScript linting |
| Prettier | ^3.4 | Code formatter |

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18 or higher
- PostgreSQL 14 or higher
- Google Gemini API key

### Installation

```bash
# Install dependencies
npm install
```

### Configuration

1. Copy the environment template:

```bash
cp .env.example .env
```

2. Edit `.env` with your configuration:

```bash
# Database Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/voice_copilot

# Gemini AI Configuration
GEMINI_API_KEY=your_gemini_api_key_here

# Server Configuration
PORT=3000
FRONTEND_URL=http://localhost:5173
NODE_ENV=development

# GHL OAuth Configuration (Production)
GHL_CLIENT_ID=your_marketplace_app_client_id
GHL_CLIENT_SECRET=your_marketplace_app_client_secret
GHL_REDIRECT_URI=http://localhost:3000/auth/callback

# OR GHL Sandbox Configuration (Development)
GHL_SANDBOX_LOCATION_ID=your_sandbox_location_id
GHL_SANDBOX_ACCESS_TOKEN=your_sandbox_access_token
GHL_SANDBOX_REFRESH_TOKEN=your_sandbox_refresh_token
GHL_SANDBOX_TOKEN_EXPIRES_AT=2025-12-31T23:59:59Z
```

### Database Setup

```bash
# Run migrations to create tables
npm run migrate

# Seed demo data (optional but recommended)
npm run seed
```

### Running the Server

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

The server will start on `http://localhost:3000`

---

## ⚙️ Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `GEMINI_API_KEY` | Yes | - | Google Gemini API key |
| `PORT` | No | 3000 | Server port number |
| `FRONTEND_URL` | No | * | Frontend URL for CORS |
| `NODE_ENV` | No | development | Environment mode |
| `GHL_CLIENT_ID` | Marketplace | - | GHL marketplace app client ID |
| `GHL_CLIENT_SECRET` | Marketplace | - | GHL marketplace app client secret |
| `GHL_REDIRECT_URI` | Marketplace | - | OAuth callback URI |
| `GHL_SANDBOX_*` | Sandbox | - | Sandbox mode environment variables |

### KPI Configuration

Each agent can have custom KPI criteria stored in JSONB format:

```json
{
  "criteria": [
    {
      "name": "greeting",
      "weight": 1.5,
      "description": "Did the agent greet the caller properly?"
    },
    {
      "name": "objection_handling",
      "weight": 2.0,
      "description": "How well were objections addressed?"
    },
    {
      "name": "closing",
      "weight": 1.5,
      "description": "Was there a clear call to action?"
    }
  ]
}
```

---

## 🔌 API Endpoints

### Health Check

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Service health check |

**Response:**
```json
{
  "ok": true
}
```

### Agents

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/agents` | List all agents with average scores |
| GET | `/agents/:id` | Get single agent details |
| GET | `/agents/:id/insights` | Get agent insights and recommendations |

**GET /agents**
```json
{
  "agents": [
    {
      "id": 1,
      "location_id": "loc_123",
      "ghl_agent_id": "agent_abc",
      "name": "Sales Agent",
      "goal": "Book appointments",
      "kpi_config": {...},
      "avg_score": 7.5
    }
  ]
}
```

### Transcripts

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/transcripts` | List transcripts with pagination |
| GET | `/transcripts/:id` | Get full transcript with analysis |

**Query Parameters:**
- `agentId` (optional): Filter by agent ID
- `limit` (optional): Number of results (default: 20, max: 100)
- `offset` (optional): Pagination offset (default: 0)

### KPI

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/kpi/summary` | Get KPI summary |
| POST | `/kpi/config` | Update agent KPI configuration |

**GET /kpi/summary**
```json
{
  "summary": {
    "totalCalls": 180,
    "avgScore": 7.2,
    "passRate": 78.5,
    "criticalCalls": 12,
    "avgDuration": 342,
    "scoreRange": "4.2-9.8",
    "topFailure": "Objection Handling"
  }
}
```

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/auth/callback` | OAuth callback handler |
| POST | `/webhooks/ghl` | GHL webhook receiver |

---

## 🗄️ Database Schema

### Entity Relationship Diagram

```
┌──────────────────────┐         ┌──────────────────────┐
│   ghl_accounts      │         │       agents         │
├──────────────────────┤         ├──────────────────────┤
│ id (PK)             │         │ id (PK)              │
│ location_id (UK)   │◀───────▶│ location_id (FK)    │
│ access_token        │         │ ghl_agent_id (UK)    │
│ refresh_token       │         │ name                 │
│ token_expires_at   │         │ goal                 │
│ created_at          │         │ script               │
└──────────────────────┘         │ kpi_config (JSONB)  │
                                 │ created_at           │
                                 └──────────┬──────────┘
                                            │
                                            │ (1:N)
                                            ▼
                                 ┌──────────────────────┐
                                 │     transcripts      │
                                 ├──────────────────────┤
                                 │ id (PK)              │
                                 │ agent_id (FK)        │
                                 │ ghl_conversation_id  │
                                 │ caller_phone         │
                                 │ duration_seconds     │
                                 │ call_date            │
                                 │ raw_transcript       │
                                 │ full_text            │
                                 │ analyzed (boolean)   │
                                 │ created_at           │
                                 └──────────┬───────────┘
                                            │
                                            │ (1:1)
                                            ▼
                                 ┌──────────────────────┐
                                 │  analysis_results    │
                                 ├──────────────────────┤
                                 │ id (PK)              │
                                 │ transcript_id (FK)   │
                                 │ overall_score        │
                                 │ kpi_scores (JSONB)   │
                                 │ failures (JSONB)     │
                                 │ recommendations      │
                                 │ use_actions         │
                                 │ raw_gemini_response │
                                 │ analyzed_at         │
                                 └──────────────────────┘
```

### Table Definitions

#### ghl_accounts
```sql
CREATE TABLE ghl_accounts (
  id SERIAL PRIMARY KEY,
  location_id TEXT UNIQUE NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### agents
```sql
CREATE TABLE agents (
  id SERIAL PRIMARY KEY,
  location_id TEXT NOT NULL,
  ghl_agent_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  goal TEXT,
  script TEXT,
  kpi_config JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### transcripts
```sql
CREATE TABLE transcripts (
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
```

#### analysis_results
```sql
CREATE TABLE analysis_results (
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
```

### Indexes
```sql
CREATE INDEX idx_transcripts_agent_id ON transcripts(agent_id);
CREATE INDEX idx_transcripts_analyzed ON transcripts(analyzed);
CREATE INDEX idx_analysis_results_transcript_id ON analysis_results(transcript_id);
CREATE INDEX idx_agents_location_id ON agents(location_id);
```

---

## 🔧 Services

### Transcript Poller (`transcriptPoller.js`)

Runs every 10 minutes to fetch new voice conversations from GHL.

**Key Functions:**
- `startTranscriptPoller()` - Initializes the cron job
- `fetchAndProcessConversations()` - Fetches and processes new transcripts
- `markConversationProcessed()` - Marks conversations as processed

### Gemini Analyzer (`geminiAnalyzer.js`)

Analyzes transcripts using Google Gemini AI.

**Key Functions:**
- `analyzeTranscript(transcriptId)` - Analyzes a single transcript
- `buildPrompt(context)` - Constructs the AI prompt
- `extractJson(text)` - Parses AI response

### KPI Evaluator (`kpiEvaluator.js`)

Calculates KPI scores and generates summaries.

**Key Functions:**
- `getKpiSummary(agentId)` - Gets KPI summary data
- `getAgentSummaries()` - Gets summary for all agents
- `calculateScores(kpiScores)` - Calculates weighted scores

### GHL Client (`ghlClient.js`)

Wrapper for HighLevel API interactions.

**Key Functions:**
- `listInstalledLocations()` - Lists installed GHL locations
- `searchVoiceConversations()` - Searches for voice conversations
- `getConversationMessages()` - Gets conversation messages

---

## 💻 Development

### Available Scripts

```bash
npm run dev          # Start development server with nodemon
npm start            # Start production server
npm run migrate      # Run database migrations
npm run seed         # Seed demo data
npm run lint         # Run ESLint
npm run format       # Run Prettier
```

### Code Style

- ESLint with recommended configurations
- Prettier for code formatting
- ES Modules (ESM) syntax

### Adding New Routes

1. Create route file in `src/routes/`
2. Import and mount in `src/index.js`

```javascript
// src/routes/example.js
import express from 'express';
import { asyncRoute } from '../utils/asyncRoute.js';

const router = express.Router();

router.get(
  '/',
  asyncRoute(async (req, res) => {
    res.json({ message: 'Hello World' });
  })
);

export default router;
```

```javascript
// src/index.js
import exampleRouter from './routes/example.js';
// ...
app.use('/example', exampleRouter);
```

---

## 🧪 Testing

### Manual API Testing

```bash
# Health check
curl http://localhost:3000/health

# List agents
curl http://localhost:3000/agents

# List transcripts
curl http://localhost:3000/transcripts

# KPI summary
curl http://localhost:3000/kpi/summary
```

### Testing with Demo Data

After running `npm run seed`, you can test with 180 demo calls:

```bash
# Get all agents with scores
curl http://localhost:3000/agents | jq

# Get KPI summary
curl http://localhost:3000/kpi/summary | jq

# Get specific transcript
curl http://localhost:3000/transcripts/1 | jq
```

---

## 🔍 Troubleshooting

### Database Connection Issues

```bash
# Check PostgreSQL is running
docker ps | grep postgres

# Test connection
psql $DATABASE_URL -c "SELECT version();"
```

### Gemini API Errors

```bash
# Verify API key is set
echo $GEMINI_API_KEY

# Test API key
curl -H "Authorization: Bearer $GEMINI_API_KEY" \
  "https://generativelanguage.googleapis.com/v1/models"
```

### No Transcripts Being Polled

1. Verify GHL credentials in `.env`
2. Check sandbox location has voice AI calls
3. Review cron job logs in terminal output

### CORS Errors

Ensure `FRONTEND_URL` is set correctly in environment:

```bash
FRONTEND_URL=http://localhost:5173
```

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

<p align="center">Built with ❤️ for Voice AI Quality Assurance</p>