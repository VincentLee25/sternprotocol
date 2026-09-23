CREATE TABLE dispute_threads (
  escrow_ref TEXT PRIMARY KEY,
  record JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE dispute_messages (
  id BIGSERIAL PRIMARY KEY,
  escrow_ref TEXT NOT NULL REFERENCES dispute_threads(escrow_ref),
  sender_user_id TEXT NOT NULL REFERENCES users(id),
  sender_address TEXT NOT NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('importer', 'exporter')),
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX dispute_messages_escrow_idx ON dispute_messages(escrow_ref, id);

CREATE TABLE dispute_inspections (
  id TEXT PRIMARY KEY,
  escrow_ref TEXT NOT NULL REFERENCES dispute_threads(escrow_ref),
  provider TEXT NOT NULL,
  reason TEXT NOT NULL,
  requested_evidence TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('requested', 'submitted')),
  evidence_cid TEXT,
  evidence_note TEXT,
  requested_by_user_id TEXT NOT NULL REFERENCES users(id),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ
);
CREATE INDEX dispute_inspections_escrow_idx ON dispute_inspections(escrow_ref, requested_at);
