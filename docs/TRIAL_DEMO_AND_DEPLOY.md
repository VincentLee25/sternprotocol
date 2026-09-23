# STERN Trial Demo and Testnet Deployment

This guide is for the current Phase 0 implementation. It supports a credible live demo and a real Polygon Amoy testnet deployment. It is not authorization to move real customer funds or present mock data as a live government or shipping integration.

## What Is Integrated

- `SternEscrow` locks IDRT-demo, advances through three ordered verifier milestones, holds a challenge window at each milestone, then applies a timelock before release.
- The Oracle gateway checks VGM/inspection, AIS, CEISA, and CID-shaped evidence before it submits a milestone proof. Those source adapters are deterministic mocks today.
- An importer or exporter can raise a bonded on-chain dispute. The appointed arbiter resolves it. A deadline amendment requires proposal by one party and approval by the other.
- Particle authenticates users; PostgreSQL stores STERN work email, editable handle, company membership, linked Safe account, TOTP MFA, and `owner` / `admin` / `operator` roles. No second STERN password is collected.
- Particle/Safe smart accounts sign end-user on-chain actions when Particle and Pimlico are configured.

## What Is Not Integrated Yet

- There is no MetaMask-style on-chain delegation contract. One company can have many user accounts, each with one wallet and an application role. That role does not let one wallet sign for another wallet and does not change contract permissions.
- The deployed token from `scripts/deploy.js` is `IDRTDemo`, not an official real IDRT asset.
- VGM, AIS, CEISA, inspection, and IPFS adapters are mock sources. Fault simulation intentionally changes their response in memory.
- The company identity store is PostgreSQL. Older `identities.json` data must be imported explicitly before the gateway starts.
- The gateway reads escrows by scanning the contract. Use an event indexer and database before high transaction volume.

## A. Quick Local Demo

Use this when the audience needs to see the product flow quickly. No real money and no public blockchain are involved.

1. Install dependencies at the repository root and in `frontend`.

```powershell
npm install
Set-Location frontend
npm install
Set-Location ..
```

2. Create a root `.env` from `.env.example`. For an identity demo add:

```text
AUTH_TOKEN_SECRET=replace-with-a-random-secret-of-at-least-32-characters
DATABASE_URL=postgresql://...
PARTICLE_PROJECT_ID=your-particle-project-id
PARTICLE_SERVER_KEY=your-backend-only-particle-server-key
PORT=4000
```

3. Run `npm run migrate:identity` and, if an old `backend/data/identities.json` has accounts, run `npm run import:identities -- --file backend/data/identities.json`. Then start the gateway.

```powershell
node backend/oracle-gateway/index.js
```

4. In another terminal, start the frontend.

```powershell
Set-Location frontend
npm run dev
```

5. Open the address printed by Vite. Set `VITE_ORACLE_API=http://localhost:4000` in `frontend/.env` and restart Vite if it is not already set.

6. Choose **Access workspace**, authenticate in Particle, then enter the company name, work email, and STERN handle if this identity is new. The Safe address is linked automatically and the first member becomes `owner`.

7. Open **Security** in the workspace to enable authenticator MFA and confirm the six-digit code.

8. Use the existing dashboard to create an escrow. In mock-only mode the browser can show the workflow, but it does not prove an on-chain transaction.

## B. Dispute and Amendment Demo

Use a contract deployed with short windows for a live demonstration. Do not use the normal 6-hour challenge and 24-hour timelock settings when the audience is waiting.

1. Configure four funded Amoy test wallets: deployer/arbiter plus three verifier wallets in this exact order: quality auditor, logistics, customs.

2. Put these values in root `.env`. Keep this file private.

```text
AMOY_RPC_URL=https://your-polygon-amoy-rpc
RPC_URL=https://your-polygon-amoy-rpc
DEPLOYER_PRIVATE_KEY=0x...
ORACLE_PRIVATE_KEYS=0xQUALITY...,0xLOGISTICS...,0xCUSTOMS...
ARBITER_PRIVATE_KEY=0xDEPLOYER_OR_ARBITER...
INTERNAL_API_KEY=replace-with-a-long-random-value
CHALLENGE_WINDOW_SECONDS=60
TIMELOCK_DURATION_SECONDS=120
```

3. Deploy the short-window demo contract.

```powershell
npx hardhat run scripts/deploy.js --network amoy
```

4. Copy the printed `SternEscrow` address to `CONTRACT_ADDRESS`, then copy the printed `IDRTDemo` address to the frontend variable `VITE_IDRT_TOKEN_ADDRESS`. Set `VITE_CONTRACT_ADDRESS` and `VITE_ORACLE_API` too.

5. Restart the gateway and frontend. Confirm `GET /health` returns the expected contract address.

6. Create an escrow as an importer. The importer must have enough IDRT-demo and must approve it through the Smart Account flow.

7. Submit the first verifier proof, then wait for the 60-second challenge window. Repeat for shipping and customs. Start the timelock after `ArrivedCleared`, wait 120 seconds, then release to the exporter.

8. For a dispute, submit a normal proof first. Then call the mock fault endpoint using an escrow ID, for example:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:4000/oracle/simulate/0 -ContentType 'application/json' -Body '{"fault":"logistics"}'
```

9. The importer or exporter presses **Open dispute** while that milestone challenge window is still open. The appointed arbiter resolves it from the Ops console. Demonstrate either release-to-exporter or refund-to-importer.

10. For amendment, one party enters a later global deadline and presses **Propose**. The other party signs **Approve**. The deadline must increase; neither party may approve its own proposal.

11. Reset simulation after the demonstration:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:4000/oracle/simulate/0 -ContentType 'application/json' -Body '{"fault":"none"}'
```

## C. Railway Gateway and Testnet Frontend

### Railway

1. Create a Railway service from this repository. Its start command is:

```text
node backend/oracle-gateway/index.js
```

2. Add these Railway variables. Never add any private key, API key, or token secret to GitHub or frontend variables.

```text
PORT=${{PORT}}
RPC_URL=https://your-polygon-amoy-rpc
CONTRACT_ADDRESS=0xYourSternEscrow
ORACLE_PRIVATE_KEYS=0xQUALITY...,0xLOGISTICS...,0xCUSTOMS...
ARBITER_PRIVATE_KEY=0xYourArbiter
IDRT_MINTER_PRIVATE_KEY=0xYourIdrtMinter
INTERNAL_API_KEY=a-long-random-internal-key
AUTH_TOKEN_SECRET=a-random-secret-at-least-32-characters
DATABASE_URL=postgresql://...
PARTICLE_PROJECT_ID=your-particle-project-id
PARTICLE_SERVER_KEY=your-backend-only-particle-server-key
CORS_ORIGINS=https://your-frontend-domain
DEMO_CLAIMS_FILE=/data/demo-claims.json
```

3. Use a persistent PostgreSQL database for company identity. Attach a Railway volume at `/data` if you need demo faucet claim history across redeploys. If `/data/identities.json` exists from an older release, import it before starting the new gateway.

4. Verify the public health route:

```text
GET https://your-railway-domain/health
```

Do not expose `INTERNAL_API_KEY`; it protects Oracle and arbiter write routes.

### Frontend host

Deploy `frontend` as a Vite app. Set these build-time variables:

```text
VITE_ORACLE_API=https://your-railway-domain
VITE_CONTRACT_ADDRESS=0xYourSternEscrow
VITE_IDRT_TOKEN_ADDRESS=0xYourIdrtDemo
VITE_RPC_URL=https://your-polygon-amoy-rpc
VITE_PARTICLE_PROJECT_ID=...
VITE_PARTICLE_CLIENT_KEY=...
VITE_PARTICLE_APP_ID=...
VITE_PIMLICO_API_KEY=...
VITE_PARTICLE_ENABLED=true
```

After deployment, change `CORS_ORIGINS` to the exact frontend URL, not `*`.

## D. Pre-Demo Checklist

```powershell
npm run compile
npm test
npm run test:identity
Set-Location frontend
npm run build
```

Expected current results:

- Contract suite: 11 passing tests.
- Identity suite: 2 passing tests.
- Frontend production build: succeeds. The Particle dependency produces bundle-size and Node-module warnings; they do not fail the build.

Before presenting, rehearse with a fresh short-window Amoy deployment. Keep the normal 6-hour and 24-hour configuration for the longer testnet scenario.

## E. Production Gate

Do not move from Amoy to real value until all of these are complete:

- Replace `IDRTDemo` with the approved real token integration and independently validate its decimals, transfer behavior, and issuer controls.
- Replace all mock adapters with contracted, authenticated data providers and preserve signed source artifacts.
- Operate PostgreSQL with encrypted backups, account recovery, audit logs, rate limiting, and request tracing before production.
- Put arbiter and oracle keys in a proper signer/HSM or managed custody system. Never type production private keys into a browser.
- Build an event indexer, monitoring, alerts, incident response, and reconciliation process.
- Run static analysis, fuzz/property testing, independent smart-contract audit, application penetration test, and legal/compliance review.
- Decide explicitly whether on-chain wallet delegation is required. If yes, design it as a separate audited authorization system; application roles alone are not wallet delegation.
