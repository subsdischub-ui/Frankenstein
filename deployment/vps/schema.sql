BEGIN;
CREATE TABLE IF NOT EXISTS lab_accounts (
  owner text PRIMARY KEY, state jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS lab_events (
  id text PRIMARY KEY, owner text NOT NULL, time timestamptz NOT NULL DEFAULT now(), payload jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS lab_experiments (
  id text PRIMARY KEY, owner text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), report jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS lab_market (
  id text PRIMARY KEY, payload jsonb NOT NULL
);
COMMIT;
