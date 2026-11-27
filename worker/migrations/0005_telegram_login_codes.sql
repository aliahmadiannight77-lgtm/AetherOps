CREATE TABLE telegram_login_challenges (
  state_hash TEXT PRIMARY KEY,
  code_hash TEXT,
  telegram_user_id TEXT,
  username TEXT,
  display_name TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  issued_at INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX telegram_login_expiry_idx ON telegram_login_challenges(expires_at);

CREATE TABLE telegram_preferences (
  telegram_user_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
