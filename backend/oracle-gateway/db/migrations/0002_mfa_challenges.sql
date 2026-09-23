ALTER TABLE mfa_credentials
  ADD COLUMN last_accepted_step BIGINT,
  ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  ADD COLUMN locked_until TIMESTAMPTZ;

CREATE TABLE mfa_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  auth_identity_id TEXT NOT NULL REFERENCES auth_identities(id) ON DELETE CASCADE,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT mfa_challenges_expiration_after_creation CHECK (expires_at > created_at)
);

CREATE INDEX mfa_challenges_user_id_idx ON mfa_challenges (user_id);
CREATE INDEX mfa_challenges_expires_at_idx ON mfa_challenges (expires_at);
