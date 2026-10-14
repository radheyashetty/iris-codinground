-- schema.sql — Database schema for the Leave Request Workflow Engine.
-- Applied automatically by src/db/connection.ts on startup.

CREATE TABLE IF NOT EXISTS actors (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  role  TEXT NOT NULL CHECK (role IN ('employee','manager','hr'))
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id           TEXT PRIMARY KEY,            -- UUID v4
  employee_id  TEXT NOT NULL REFERENCES actors(id),
  leave_type   TEXT NOT NULL CHECK (leave_type IN ('annual','sick','casual','unpaid')),
  start_date   TEXT NOT NULL,               -- ISO date YYYY-MM-DD
  end_date     TEXT NOT NULL,
  reason       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'draft',
  version      INTEGER NOT NULL DEFAULT 1,  -- optimistic locking counter
  created_at   TEXT NOT NULL,               -- ISO-8601 UTC
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_requests_status ON leave_requests(status);

-- Append-only audit log. NEVER update or delete rows (enforced by triggers below).
CREATE TABLE IF NOT EXISTS transitions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id  TEXT NOT NULL REFERENCES leave_requests(id),
  from_state  TEXT,                         -- NULL only for the creation event
  to_state    TEXT NOT NULL,
  action      TEXT NOT NULL,                -- 'create' | 'submit' | 'approve' | 'reject'
  actor_id    TEXT NOT NULL REFERENCES actors(id),
  actor_role  TEXT NOT NULL,                -- snapshot of role at the time
  comment     TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transitions_request ON transitions(request_id, id);

CREATE TRIGGER IF NOT EXISTS transitions_no_update BEFORE UPDATE ON transitions
BEGIN SELECT RAISE(ABORT, 'transitions is append-only'); END;

CREATE TRIGGER IF NOT EXISTS transitions_no_delete BEFORE DELETE ON transitions
BEGIN SELECT RAISE(ABORT, 'transitions is append-only'); END;
