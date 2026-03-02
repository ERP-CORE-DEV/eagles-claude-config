-- Migration 001: Initial schema
-- Applied automatically by each store's constructor
-- This file exists for documentation and manual recovery purposes

-- EventBus
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  published_at TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_topic ON events(topic, published_at);

-- TokenLedger
CREATE TABLE IF NOT EXISTS token_records (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  model_name TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL,
  completion_tokens INTEGER NOT NULL,
  total_tokens INTEGER NOT NULL,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd REAL NOT NULL,
  recorded_at TEXT NOT NULL,
  wave_number INTEGER,
  agent_name TEXT,
  tool_name TEXT
);
CREATE INDEX IF NOT EXISTS idx_token_session ON token_records(session_id);
CREATE INDEX IF NOT EXISTS idx_token_recorded ON token_records(recorded_at);
