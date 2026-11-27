PRAGMA foreign_keys = ON;

CREATE TABLE telegram_accounts (
  telegram_user_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  username TEXT,
  display_name TEXT NOT NULL,
  linked_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX telegram_accounts_user_idx ON telegram_accounts(user_id);
