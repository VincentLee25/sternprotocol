CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  username TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_email_not_blank CHECK (length(btrim(email)) > 0),
  CONSTRAINT users_username_not_blank CHECK (length(btrim(username)) > 0)
);

CREATE UNIQUE INDEX users_email_lower_unique ON users (lower(email));
CREATE UNIQUE INDEX users_username_lower_unique ON users (lower(username));

CREATE TABLE companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT companies_name_not_blank CHECK (length(btrim(name)) > 0)
);

CREATE TABLE auth_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_subject TEXT NOT NULL,
  eoa_owner_address TEXT,
  smart_account_address TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT auth_identities_provider_subject_unique UNIQUE (provider, provider_subject),
  CONSTRAINT auth_identities_provider_not_blank CHECK (length(btrim(provider)) > 0),
  CONSTRAINT auth_identities_subject_not_blank CHECK (length(btrim(provider_subject)) > 0),
  CONSTRAINT auth_identities_smart_account_format CHECK (smart_account_address ~* '^0x[0-9a-f]{40}$'),
  CONSTRAINT auth_identities_eoa_owner_format CHECK (eoa_owner_address IS NULL OR eoa_owner_address ~* '^0x[0-9a-f]{40}$')
);

CREATE UNIQUE INDEX auth_identities_smart_account_lower_unique
  ON auth_identities (lower(smart_account_address));
CREATE INDEX auth_identities_user_id_idx ON auth_identities (user_id);

CREATE TABLE memberships (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'operator')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT memberships_user_company_unique UNIQUE (user_id, company_id)
);

CREATE INDEX memberships_company_id_idx ON memberships (company_id);

CREATE TABLE mfa_credentials (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  secret TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT mfa_enabled_requires_secret CHECK (NOT enabled OR NULLIF(btrim(secret), '') IS NOT NULL)
);

CREATE TABLE company_invitations (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'operator')),
  code_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by_user_id TEXT REFERENCES users(id),
  CONSTRAINT company_invitations_email_not_blank CHECK (length(btrim(email)) > 0),
  CONSTRAINT company_invitations_expiration_after_creation CHECK (expires_at > created_at),
  CONSTRAINT company_invitations_acceptance_consistent CHECK (
    (accepted_at IS NULL AND accepted_by_user_id IS NULL)
    OR (accepted_at IS NOT NULL AND accepted_by_user_id IS NOT NULL)
  )
);

CREATE INDEX company_invitations_company_id_idx ON company_invitations (company_id);
CREATE INDEX company_invitations_email_lower_idx ON company_invitations (lower(email));
