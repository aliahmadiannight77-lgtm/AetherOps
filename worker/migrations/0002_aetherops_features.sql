PRAGMA foreign_keys = ON;

-- Extend the existing AetherOps schema without deleting or rewriting user data.
ALTER TABLE chats ADD COLUMN channel TEXT NOT NULL DEFAULT 'web';
ALTER TABLE messages ADD COLUMN model TEXT;
ALTER TABLE messages ADD COLUMN input_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE messages ADD COLUMN output_tokens INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS chats_user_updated_idx ON chats(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS messages_chat_created_idx ON messages(chat_id, created_at);

CREATE TABLE otp_challenges (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE rate_limits (
  scope TEXT NOT NULL,
  subject TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (scope, subject)
);

CREATE TABLE api_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);
CREATE INDEX api_tokens_user_idx ON api_tokens(user_id);

CREATE TABLE usage_daily (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_utc TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  requests INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day_utc)
);

CREATE TABLE telegram_links (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  telegram_user_id TEXT NOT NULL UNIQUE,
  telegram_chat_id TEXT NOT NULL,
  linked_at INTEGER NOT NULL
);

CREATE TABLE telegram_link_codes (
  code_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE telegram_updates (
  update_id INTEGER PRIMARY KEY,
  created_at INTEGER NOT NULL
);
