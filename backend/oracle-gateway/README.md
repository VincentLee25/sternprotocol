# STERN Oracle Gateway — Backend MVP

Backend service for the Phase 0 / MVP Oracle EOA flow plus read APIs and a demo IDRT faucet.

## What the backend owns

- Oracle EOA identity/role health.
- Mock external-source adapters (VGM, AIS, CEISA, inspection, IPFS).
- Deterministic fault simulation and structured evidence.
- Oracle milestone submission after automated checks pass.
- Read APIs for escrow history/detail/timelock/activity/dispute.
- Dispute preparation data/calldata. **The user still sends `raiseDispute` from their own Particle Smart Account.**
- Arbiter-side `resolveDispute` transaction, because the arbiter is a backend-managed service EOA in this MVP.
- Demo IDRT faucet for importer/exporter wallets.

## What the backend does NOT own

- Particle login/session storage. The backend verifies Particle's identity token for company authorization but does not replace Particle as the primary sign-in provider.
- Importer/exporter private keys.
- Importer/exporter `createEscrow`, `raiseDispute`, `claimRefund`, or other user-owned transactions.
- Frontend UI.

## Required environment

- `RPC_URL`
- `CONTRACT_ADDRESS`
- `ORACLE_PRIVATE_KEYS=QUALITY_PK,LOGISTICS_PK,CUSTOMS_PK`
- `ARBITER_PRIVATE_KEY` for `resolveDispute`
- `IDRT_MINTER_PRIVATE_KEY` for the demo faucet (fallback to `DEPLOYER_PRIVATE_KEY` is supported)

Optional:

- `PORT=4000`
- `DEMO_BALANCE_IDRT=150000000.00`
- `DEMO_CLAIMS_FILE=.demo-claims.json`
- `NATIVE_GAS_WARNING_WEI=1000000000000000`

Company identity and MFA additionally require:

- `AUTH_TOKEN_SECRET`: a random secret of at least 32 characters. Generate and keep this only in Railway variables; changing it invalidates active sessions.
- `DATABASE_URL`: PostgreSQL connection string. PostgreSQL is the runtime source of truth for STERN users, company membership, linked Particle identities, invitations, and MFA.
- `PARTICLE_PROJECT_ID` and `PARTICLE_SERVER_KEY`: used by the backend to verify Particle's signed-in identity before checking STERN company membership. The project ID can fall back to `VITE_PARTICLE_PROJECT_ID`; the server key must remain backend-only and must never use a `VITE_` variable.
- `PARTICLE_SAFE_RPC_URL` (optional): Polygon Amoy RPC used to independently derive the same Safe account as the frontend; defaults to the frontend's public RPC fallback. Keep the frontend and backend Safe library versions and account parameters aligned.

Particle is the public sign-in entry point. `POST /auth/particle/session` verifies the Particle token with Particle's server API, derives the Safe from its verified EVM owner, then resolves STERN membership. A pre-Particle member is linked only when that derived Safe exactly matches the stored company wallet; MFA, if enabled, must pass before the link and workspace session are issued. Unknown identities receive `registrationRequired` and use `POST /auth/register-company` with the same Particle proof. Neither route trusts a browser-supplied wallet address.

### PostgreSQL identity migration

Install backend dependencies and set `DATABASE_URL` in the backend environment. Before any schema or data change, confirm the variable is present and test an actual SQL connection without logging the URL:

```bash
npm run check:identity-db
```

Run this check in an environment that can reach the Railway PostgreSQL instance. A Railway private database hostname may not be reachable from a local machine. After the connection check succeeds, apply the schema before starting the gateway:

```bash
node backend/oracle-gateway/db/migrate.js
```

The migration runner records checksums in `schema_migrations`, applies new SQL files in order within a transaction, and rejects edits to an already applied migration. Gateway startup checks schema status but does **not** apply migrations automatically; this keeps the connection preflight and legacy import in an explicit order. The runtime does not read `identities.json` for authentication.

If an older deployment has company identities in `identities.json`, back up that file and explicitly import it once:

```bash
node backend/oracle-gateway/db/importLegacyIdentities.js --file /data/identities.json --dry-run
node backend/oracle-gateway/db/importLegacyIdentities.js --file /data/identities.json
```

For a local checkout, use `backend/data/identities.json` as the `--file` value. The CLI requires an explicit path so a stale file cannot be imported accidentally.

The importer preserves company and user IDs, usernames, emails, roles, Safe addresses, creation dates, and TOTP state. It does not import the old STERN password hashes. An account without a Particle link is stored as a `legacy` identity keyed by its Safe; the backend may link it to a verified Particle owner of that exact Safe during sign-in. The importer is transactional and repeatable: an unchanged record is skipped, while competing IDs, emails, handles, wallet claims, memberships, or MFA records cause an explicit conflict and roll back the whole import. Keep the original JSON backup until you have checked the import report and signed in with the migrated accounts.

Never put server private keys or INTERNAL_API_KEY in the frontend or source control. Privileged write endpoints require INTERNAL_API_KEY via X-API-Key or Authorization: Bearer.

## API groups

### Health / registry

- `GET /health`
- `GET /oracle/identity`
- `GET /oracle/status`
- `GET /verifiers`

### Demo faucet

- `POST /demo-balance/claim`
- `GET /demo-balance/:smartAccountAddress`

### Escrow read model

- `GET /escrows?address=...&role=importer|exporter|arbiter&state=...`
- `GET /escrows/:escrowId`
- `GET /escrows/:escrowId/timelock`
- `GET /escrows/:escrowId/activity`
- `GET /escrows/:escrowId/dispute`
- `POST /escrows/:escrowId/dispute/prepare`

The current MVP read model scans `nextEscrowId()` and calls the contract. It is intentionally simple. A database/event indexer should replace this scan before high-volume production.

### Oracle evidence

- `GET /oracle/evidence/:contractId`
- `POST /oracle/simulate/:contractId`
- `GET /mock-status/:contractId`
- `POST /submit-oracle/:contractId` (internal API key required)
- `POST /milestones/:contractId/submit` (internal API key required)

### Arbiter

- `POST /resolve-dispute/:contractId` (internal API key required)

There is deliberately **no backend `raiseDispute` endpoint**. The dispute opener must be the importer/exporter wallet, so FE sends the contract transaction through Particle AA.

### Company identity

- `POST /auth/particle/session` verifies the Particle identity with Particle's server API, then checks whether it is linked to a STERN company user. A registered identity receives a STERN session or a short-lived MFA challenge; an unregistered identity does not receive workspace access.
- `POST /auth/register-company` verifies Particle first, then creates a company plus its `owner` account using company name, work email, STERN handle, and the automatically linked Safe account. It does not store a STERN password.
- `POST /auth/login` returns `410 PARTICLE_AUTH_REQUIRED`; Particle is the only live sign-in entry point.
- `POST /auth/mfa/setup`, `POST /auth/mfa/confirm`, and `POST /auth/mfa/verify` implement TOTP for Google Authenticator-compatible apps.
- `GET /auth/me` returns the PostgreSQL-backed STERN profile and selected company; `PATCH /auth/me` changes only the STERN handle, not the Particle identity or Safe.
- `GET /auth/memberships` lists the authenticated user's company memberships. `POST /auth/switch-company` issues a session for one of those memberships; it cannot switch to an unrelated company.
- `GET /companies/:companyId/users` lists members. `POST /companies/:companyId/invitations` creates a one-use invitation for an `admin` or `operator`; the owner can invite either role, while an admin can invite only operators. The invitation code is returned once for secure sharing and only its SHA-256 digest is stored.
- `POST /auth/accept-invitation` verifies Particle, requires the one-use invitation code, and checks that the entered STERN work email matches the invitation before adding membership. STERN does not independently verify ownership of that email address yet, so share invitation links only with the intended recipient. A returning STERN user with MFA enabled must complete the challenge before membership is created.

Company identity authorizes the application account. It does not grant a blockchain role or custody a user wallet; escrow permissions remain enforced by the deployed contract.

## Fault simulation

Example:

```bash
curl -X POST http://localhost:4000/oracle/simulate/0 \
  -H 'Content-Type: application/json' \
  -d '{"fault":"logistics"}'
```

Supported faults: `quality`, `vgm`, `inspection`, `logistics`, `ais`, `customs`, `ceisa`, `ipfs`.

A fault changes the mock source state for that escrow in the running gateway. The Oracle service evaluates the current source data and emits expected-vs-actual evidence. Failed checks are not submitted on-chain.

For a concrete dispute demo, commit a normal proof first, then call `POST /oracle/simulate/:id` with a fault. `GET /oracle/evidence/:id` will compare the committed proof with the now-failing current source and expose `comparison.<milestone>.discrepancyAfterCommit`. Reset with `{ "fault": "none" }`. Simulation state is in-memory and resets on gateway restart.

## Nested overrides

Submission endpoints accept an optional `overrides` object. It is merged into the source adapter options before verification. This keeps FE requests explicit and prevents the old integration issue where nested overrides were documented but not actually forwarded.
