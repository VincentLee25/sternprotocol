# STERN Protocol

Deployment Link : https://thesternman.up.railway.app/

STERN is a smart escrow workflow for export-import settlement. It combines an IDRT-denominated escrow contract, off-chain evidence verification, and a company operations workspace so importers, exporters, verifiers, and arbiters can follow one auditable settlement lifecycle.

## Current Capability

- ERC-20 `IDRTDemo` escrow with two decimals for Phase 0/testnet.
- Ordered lifecycle: `Created -> Inspected -> Shipped -> ArrivedCleared -> TimelockActive -> Completed`, plus `Disputed` and `Refunded` terminal paths.
- Three role-bound verifier milestones: quality auditor, logistics, and customs. Each verifier posts an IDRT bond.
- Six-hour challenge windows and a 24-hour settlement timelock by default; both are constructor configuration, so use short windows only for a rehearsal contract.
- A 3% IDRT dispute bond. The arbiter resolves a dispute; a valid verifier slash splits 70% to the harmed party and 30% to treasury.
- Global deadline refund and bilateral deadline amendment.
- Oracle gateway that verifies external-source-shaped data before sending a milestone proof. Current VGM, AIS, CEISA, inspection, and CID adapters are deterministic mocks.
- Company login with email, username, wallet address, password hashing, TOTP MFA, and application roles `owner`, `admin`, and `operator`.
- Particle/Safe smart accounts for end-user signing when the required Particle and Pimlico configuration is supplied.

## Important Status

This repository is ready for local demonstrations and Polygon Amoy testnet deployment. It is not a real-value production deployment yet:

- The deploy script creates `IDRTDemo`, not an official IDRT integration.
- Government, port, inspection, and IPFS integrations remain mock adapters until the team has provider contracts, MOU/access approval, and credentials.
- A company role does not grant on-chain wallet delegation. One wallet cannot sign for another wallet in the current design.
- Production requires audited contract/token integration, authenticated source providers, managed signers, database/indexer, monitoring, and a security/legal review.

## Architecture

```text
Importer or exporter Smart Account
  -> IDRTDemo approval and SternEscrow transaction

Evidence providers
  -> VGM / inspection, AIS, CEISA, CID adapter checks
  -> Oracle gateway accepts only passing checks
  -> role-bound verifier submits proof on-chain

SternEscrow
  -> milestone challenge window
  -> timelock and release, refund, or arbiter resolution

Company identity service
  -> owner / admin / operator application permissions
  -> email + username + wallet + password + MFA
```

## Start Locally

```powershell
npm install
Set-Location frontend
npm install
Set-Location ..
npm run compile
npm test
npm run test:identity
```

Start the gateway after creating root `.env` from `.env.example` and adding `AUTH_TOKEN_SECRET` for company identity:

```powershell
node backend/oracle-gateway/index.js
```

Start the frontend in another terminal:

```powershell
Set-Location frontend
npm run dev
```

## Documentation

- [Trial demo and Amoy/Railway deployment](docs/TRIAL_DEMO_AND_DEPLOY.md)
- [Production integration and launch requirements](docs/PRODUCTION_INTEGRATION_REQUIREMENTS.md)
- [Delegated account architecture requirements](docs/DELEGATION_ACCOUNT_REQUIREMENTS.md)
- [Frontend visual and product specification for Stitch](DESIGN.md)
- [Phase 0 contract specification](docs/01_CONTRACT_SPEC.md)

## Validation

The current repository verification is:

```text
npm test                 11 passing contract tests
npm run test:identity    2 passing identity-service tests
frontend npm run build   production bundle succeeds
```

Never commit private keys, API keys, `INTERNAL_API_KEY`, `AUTH_TOKEN_SECRET`, or deployed production credentials.
