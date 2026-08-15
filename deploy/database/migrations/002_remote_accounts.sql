CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS account_sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS account_sessions_account_id_idx ON account_sessions (account_id);
CREATE INDEX IF NOT EXISTS account_sessions_expires_at_idx ON account_sessions (expires_at);

DELETE FROM account_sessions;
DELETE FROM account_snapshots;
DELETE FROM accounts;

INSERT INTO accounts (id, username, password_hash) VALUES
  ('yeatom', 'yeatom', crypt('yeatom', gen_salt('bf'))),
  ('junling', 'junling', crypt('junling', gen_salt('bf')));

INSERT INTO schema_migrations (version)
VALUES ('002_remote_accounts')
ON CONFLICT (version) DO NOTHING;
