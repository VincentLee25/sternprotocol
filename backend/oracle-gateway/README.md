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

- Particle login/session.
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
