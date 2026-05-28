# Backend README

The backend is an Express API that ingests HighLevel Voice AI call transcripts, stores them in PostgreSQL, analyzes them with Gemini, and exposes dashboard-ready analytics to the Vue frontend.

## New Features

### Demo Data System
- **`src/services/demoData.js`**: Generates realistic demo data for 5 agents with 180 analyzed calls
- **`src/utils/demoFallback.js`**: Provides graceful fallback when PostgreSQL is unavailable
- **`src/services/demoData.test.js`**: Unit tests for demo data generation

### AI Analysis
- **`src/services/geminiAnalyzer.js`**: Gemini-powered call analysis
- **`src/services/aiAdvisor.js`**: AI-driven coaching recommendations
- **`src/routes/ai.js`**: API endpoints for AI suggestions and questions

## Local Run

Create `backend/.env`:

```bash
PORT=3000
NODE_ENV=development
DATABASE_URL=postgresql://user:password@localhost:5432/voice_copilot
GHL_SANDBOX_LOCATION_ID=demo-location
GHL_SANDBOX_ACCESS_TOKEN=your_token
GHL_SANDBOX_REFRESH_TOKEN=your_refresh_token
GEMINI_API_KEY=your_gemini_key
FRONTEND_URL=http://localhost:5173
DEMO_DATA_FALLBACK=true
```

Then run:

```bash
npm install
npm run migrate
npm run seed
npm run dev
```

## Ingesting Data Into The Platform

There are three supported ingestion paths:

1. Marketplace install flow: GHL calls `POST /webhooks/ghl`, and the official SDK stores tokens through `PostgresSessionStorage`.
2. Sandbox token flow: set `GHL_SANDBOX_LOCATION_ID` and token values in `.env`, then the poller can fetch conversations for that location.
3. Demo seed flow: run `npm run seed` to create 180 realistic analyzed calls across five agents.

The poller runs every 10 minutes. It searches GHL conversations with provider type `Call`, fetches messages, normalizes them into transcript rows, inserts new conversations by `ghl_conversation_id`, then immediately calls Gemini analysis for each new transcript.

```mermaid
flowchart TD
  A["GHL Call conversation"] --> B["Cron poller every 10 minutes"]
  B --> C["GHL SDK client"]
  C --> D["Messages normalized into transcript"]
  D --> E["transcripts table"]
  E --> F["Gemini analyzer"]
  F --> G["analysis_results table"]
  G --> H["KPI summary API"]
```

## API User Flow

```mermaid
sequenceDiagram
  participant User
  participant Frontend
  participant API
  participant DB
  participant Gemini

  Note over API,DB: Ingestion Flow
  API->>DB: Store raw transcript
  DB-->>API: Transcript saved
  API->>Gemini: Request call analysis
  Gemini-->>API: Return scores & recommendations
  API->>DB: Store analysis results
  DB-->>API: Analysis saved

  Note over User,Frontend: Dashboard Flow
  User->>Frontend: Opens dashboard
  Frontend->>API: GET /kpi/summary
  API->>DB: Aggregate transcript scores
  DB-->>API: KPI metrics
  API-->>Frontend: Summary, agents, trends

  Note over User,Frontend: Transcript Detail Flow
  User->>Frontend: Opens transcript
  Frontend->>API: GET /transcripts/:id
  API->>DB: Fetch transcript + analysis
  DB-->>API: Annotated result
  API-->>Frontend: Failure and recommendation data
```

## Demo Fallback

When `DEMO_DATA_FALLBACK=true`, routes return generated demo data if PostgreSQL is unavailable. This is useful for UI demos on machines without Docker or a local Postgres service. Disable it for production.

## Verification

```bash
npm run lint
node --check src/index.js
```
