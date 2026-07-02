-- Tom's Pest Control SMS dashboard
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  status_match TEXT,
  template_id INTEGER NOT NULL REFERENCES templates(id),
  enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS outbound_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_uuid TEXT,
  job_uuid TEXT,
  to_number TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL,
  provider_response TEXT,
  idempotency_key TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inbound_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_number TEXT NOT NULL,
  body TEXT NOT NULL,
  port INTEGER,
  job_uuid TEXT,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS event_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_uuid TEXT,
  event_type TEXT NOT NULL,
  object_type TEXT,
  object_id TEXT,
  payload_json TEXT,
  idempotency_key TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oauth_tokens (
  account_uuid TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_outbound_job ON outbound_messages(job_uuid);
CREATE INDEX IF NOT EXISTS idx_inbound_from ON inbound_messages(from_number);
CREATE INDEX IF NOT EXISTS idx_event_log_object ON event_log(object_type, object_id);
