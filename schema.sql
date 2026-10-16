-- Trip Split database schema (Cloudflare D1 / SQLite)
-- Run once:  npx wrangler d1 execute trip-split --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS meta (
  k TEXT PRIMARY KEY,
  v INTEGER NOT NULL
);
INSERT OR IGNORE INTO meta (k, v) VALUES ('version', 1);

CREATE TABLE IF NOT EXISTS members (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS trips (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  start_date TEXT NOT NULL DEFAULT '',
  end_date   TEXT NOT NULL DEFAULT '',
  members    TEXT NOT NULL,            -- JSON array of member ids
  created_at INTEGER NOT NULL,
  created_by TEXT
);

CREATE TABLE IF NOT EXISTS expenses (
  id         TEXT PRIMARY KEY,
  trip_id    TEXT NOT NULL,
  descr      TEXT NOT NULL,
  paise      INTEGER NOT NULL,          -- amount in paise (₹1 = 100)
  paid_by    TEXT NOT NULL,
  split      TEXT NOT NULL,            -- JSON array of member ids
  date       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  added_by   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_expenses_trip ON expenses (trip_id);

CREATE TABLE IF NOT EXISTS disputes (
  id          TEXT PRIMARY KEY,        -- <expense id>__<member id>
  expense_id  TEXT NOT NULL,
  trip_id     TEXT NOT NULL,
  member_id   TEXT NOT NULL,
  reason      TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open',
  at          INTEGER NOT NULL,
  resolved_at INTEGER,
  resolved_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_disputes_expense ON disputes (expense_id);

CREATE TABLE IF NOT EXISTS polls (
  id         TEXT PRIMARY KEY,
  trip_id    TEXT NOT NULL,
  question   TEXT NOT NULL,
  options    TEXT NOT NULL,            -- JSON array of strings
  closed     INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  created_by TEXT
);

CREATE TABLE IF NOT EXISTS votes (
  poll_id   TEXT NOT NULL,
  member_id TEXT NOT NULL,
  option    INTEGER NOT NULL,
  at        INTEGER NOT NULL,
  PRIMARY KEY (poll_id, member_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id        TEXT PRIMARY KEY,
  trip_id   TEXT NOT NULL,
  member_id TEXT NOT NULL,
  text      TEXT NOT NULL,
  at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_trip ON messages (trip_id, at);
