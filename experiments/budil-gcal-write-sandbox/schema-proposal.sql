-- PROPOSAL ONLY. DO NOT RUN. Application role and RLS design require review.
CREATE TABLE budil_calendar_attempts (
  tenant_id text NOT NULL,
  operation text NOT NULL CHECK (operation IN ('booking','reschedule')),
  idempotency_key char(64) NOT NULL,
  snapshot_sha256 char(64) NOT NULL,
  work_order_id text NOT NULL,
  calendar_id text NOT NULL,
  event_id text NOT NULL,
  state text NOT NULL CHECK (state IN ('claimed','indeterminate','conflict','verified')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,operation,idempotency_key)
);
CREATE UNIQUE INDEX budil_calendar_one_event_per_work
  ON budil_calendar_attempts (tenant_id,work_order_id,event_id)
  WHERE operation='booking';
-- Claim and local sync must execute in a server transaction. External Google calls
-- occur after durable claim. Ambiguous outcomes allow GET-only reconciliation.
