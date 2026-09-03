# Oracle Evidence, Fault Simulation, Dispute, and Demo Faucet

## Evidence lifecycle

```text
Mock source
   ↓
Oracle verification
   ↓
expected vs actual evidence
   ↓
pass → Oracle EOA may submit proof
fail → backend returns evidence / 422, no bad proof is written
```

Each evidence item contains:

- `oracle`
- `source`
- `field`
- `expected`
- `actual`
- `passed`
- `discrepancy`
- `simulated`
- `checkedAt`
- `sourceData`

## Simulating an oracle/source problem

```bash
curl -X POST http://localhost:4000/oracle/simulate/0 \
  -H 'Content-Type: application/json' \
  -d '{"fault":"ais"}'
```

The simulation is stored in the running gateway process for that escrow. It changes the mock source result used by subsequent evidence reads; it does **not** write anything to the blockchain and cannot create a bad on-chain proof.

Example sequence:

```text
1. Submit a normal milestone proof.
2. POST /oracle/simulate/:id {"fault":"ais"}
3. GET /oracle/evidence/:id
4. FE sees the committed proof plus current AIS = in_port.
5. comparison.<milestone>.discrepancyAfterCommit becomes true.
6. User reviews the evidence and opens the real dispute through Particle.
```

Reset the running demo state with:

```bash
curl -X POST http://localhost:4000/oracle/simulate/0 \
  -H 'Content-Type: application/json' \
  -d '{"fault":"none"}'
```

The evidence response includes `comparison`, `committedDiscrepancies`, and `disputeDemo.actionable` so the FE can show a concrete evidence mismatch.

The simulation state is intentionally in-memory and resets when the gateway restarts. This is a demo mechanism, not a production evidence database.

## Demonstrating a real dispute

A dispute is different from simulation:

1. A milestone proof must already be committed on-chain.
2. The importer/exporter reviews the proof/evidence.
3. FE calls `POST /escrows/:id/dispute/prepare` to get bond amount and transaction calldata.
4. FE/Particle approves the required IDRT bond to the escrow contract.
5. FE/Particle sends `SternEscrow.raiseDispute(...)` from the user's own Smart Account.
6. Backend arbiter calls `POST /resolve-dispute/:id` to execute `resolveDispute(...)`.

The backend must never use an Oracle key to impersonate the importer/exporter for `raiseDispute`.

## Demo faucet

`POST /demo-balance/claim` mints the configured demo allocation to an importer/exporter Smart Account. The minter private key is server-side only. Claim state is kept in `.demo-claims.json` by default and is suitable only for an MVP/demo; production should use a database, rate limiting, and a proper user/wallet identity record.
