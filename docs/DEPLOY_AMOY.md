# Deploying STERN Protocol for real — Polygon Amoy testnet

> **OUT OF DATE — do not follow this file.**
>
> It describes an earlier architecture: MetaMask instead of Particle, an "oracle
> consortium" with `ORACLE_QUORUM` and `ORACLE_BOND_ETH`, and `postBond()` /
> `submitAttestation` calls. None of those exist in the contract any more, which
> now uses three named roles (`ROLE_QUALITY_AUDITOR`, `ROLE_LOGISTICS`,
> `ROLE_CUSTOMS`), `postVerifierBond()` and `submitMilestoneProof()`. It also
> omits every variable the gateway needs today — `ARBITER_PRIVATE_KEY`,
> `IDRT_MINTER_PRIVATE_KEY`, `AUTH_TOKEN_SECRET`, `INTERNAL_API_KEY`,
> `CORS_ORIGINS` — and all of the `VITE_PARTICLE_*` keys, without which the
> frontend runs on demo data.
>
> Use instead:
> - [`TRIAL_DEMO_AND_DEPLOY.md`](TRIAL_DEMO_AND_DEPLOY.md) — first deployment
> - [`DEPLOY_ULANG.md`](DEPLOY_ULANG.md) — redeploying something already live
>
> Kept only as a record of the earlier design.

Step-by-step runbook to take the MVP off `localhost` and onto a public URL backed by a
real (test) blockchain: **Polygon Amoy testnet + Vercel (frontend) + Render (oracle
gateway)**. Everything here uses **testnet POL, not real money** — Amoy is Polygon's
public test network, safe to use with throwaway wallets.

Condensed version of this runbook (infra rationale, hosting choices) lives in
[MVP_GUIDE.md §8-9](MVP_GUIDE.md). This file is the full click-by-click walkthrough,
including account setup.

---

## 0. What you need before starting

| # | Account | Free? | Used for |
|---|---|---|---|
| 1 | A wallet app (MetaMask browser extension) | Yes | Holding the 4 testnet wallets below, signing transactions |
| 2 | GitHub account | Yes | Already have it — repo is [github.com/VincentLee25/sternprotocol](https://github.com/VincentLee25/sternprotocol) |
| 3 | Vercel account | Yes (hobby tier) | Hosting the frontend (static Vite build) |
| 4 | Render account | Yes (free tier, sleeps after inactivity) | Hosting the oracle gateway (needs a persistent Node process, so not Vercel) |

You do **not** need a Polygon/crypto exchange account — testnet POL comes from a free
faucet, no purchase involved.

### Wallets you need (4 minimum)

The contract requires **1 deployer** + **3 distinct oracle addresses** (the bonded
consortium — no duplicates allowed). Create 4 fresh MetaMask accounts dedicated to
this project (`Account → Create account`, name them so you don't mix them up with
personal wallets):

1. `stern-deployer` — deploys the contract, pays deploy gas
2. `stern-oracle-sucofindo` — oracle #1
3. `stern-oracle-sgs` — oracle #2
4. `stern-oracle-port-authority` — oracle #3

Optional but recommended for a convincing live demo: 2 more wallets for
`stern-exporter` and `stern-arbiter`, so you can actually switch MetaMask accounts
during Act 4 (dispute voting) instead of narrating it. The **importer** role can just
be whichever wallet creates the escrow (e.g. reuse `stern-deployer`).

None of these need to hold real funds — ever. Never import a wallet that holds real
mainnet assets into this workflow.

---

## 1. Add the Amoy network to MetaMask

1. Open MetaMask → network dropdown → **Add network** → **Add a network manually**.
2. Fill in:
   ```
   Network name:      Polygon Amoy Testnet
   RPC URL:            https://rpc-amoy.polygon.technology
   Chain ID:            80002
   Currency symbol:    POL
   Block explorer URL: https://amoy.polygonscan.com
   ```
3. Save, then switch to it for each of the 4 (or 6) wallets above in turn to confirm
   they show `0 POL`.

---

## 2. Fund the wallets from the faucet

1. Go to the [Polygon faucet](https://faucet.polygon.technology).
2. Select network **Polygon Amoy**, paste each wallet address, request POL.
   Faucets are rate-limited (usually once per day per address) — request for all 4-6
   wallets before moving on.
3. Each oracle wallet needs enough POL to cover: the bond amount (see step 4 — keep
   this small on testnet) + gas for `postBond` + gas for each `submitAttestation` call
   during the demo. The deployer needs gas for the deploy transaction plus 3 more
   `postBond` calls if you reuse it, though the script below has oracles post their
   own bonds.
4. Confirm balances show up in MetaMask (Amoy network selected) before continuing.

---

## 3. Configure the root `.env`

Copy your private keys from MetaMask (**Account details → Show private key** — never
share these, never commit them). Fill in the root `.env`:

```bash
AMOY_RPC_URL=https://rpc-amoy.polygon.technology
DEPLOYER_PRIVATE_KEY=<stern-deployer private key>
ORACLE_PRIVATE_KEYS=<sucofindo key>,<sgs key>,<port-authority key>
REQUIRED_CONFIRMATIONS=5
ORACLE_QUORUM=2
ORACLE_BOND_ETH=0.01
```

Notes:
- `ORACLE_BOND_ETH=0.01` — keep this small. The local default is `1` (fine when POL
  is free/instant on Hardhat), but on a real testnet with rate-limited faucets, 1 POL
  per oracle (3 total) can be hard to refill mid-demo. `0.01` still demonstrates
  slashing (50% of remaining bond) without draining faucet funds.
- `ORACLE_PRIVATE_KEYS` is now used in **two** places: `hardhat.config.js` (to derive
  the deploy-time oracle signers on Amoy) and `backend/oracle-gateway/config.js` (to
  submit attestations later). One value, both places — keep it in sync if you ever
  rotate keys.
- `RPC_URL` and `CONTRACT_ADDRESS` stay as placeholders for now — you'll fill
  `CONTRACT_ADDRESS` after the deploy in step 4.

---

## 4. Deploy the contract to Amoy

```bash
npx hardhat run scripts/deploy.js --network amoy
```

Expected output (addresses will differ):

```
SternEscrow deployed to: 0x....
Owner: 0x.... (stern-deployer)
Oracle consortium (quorum 2-of-3, bond 0.01 ETH each):
  Oracle #0: 0x.... (bond posted)
  Oracle #1: 0x.... (bond posted)
  Oracle #2: 0x.... (bond posted)
Required confirmations: 5
Gateway env: ORACLE_PRIVATE_KEYS already holds these 3 keys — reuse the same .env value for the gateway.
```

If this errors with `insufficient funds`, one of the 4 wallets didn't get faucet POL
— check balances in MetaMask and request again. If it errors with `Need 3 oracle
signers, found N`, `ORACLE_PRIVATE_KEYS` in `.env` doesn't have exactly 3
comma-separated keys.

Copy the deployed address:

```bash
CONTRACT_ADDRESS=<address printed above>
```

into the root `.env`.

Verify on the block explorer: `https://amoy.polygonscan.com/address/<address>` — you
should see the deploy transaction plus 3 `postBond` transactions.

---

## 5. Deploy the oracle gateway to Render

1. [render.com](https://render.com) → sign up (GitHub login is easiest — it can read
   the repo directly).
2. **New → Web Service** → connect `VincentLee25/sternprotocol`.
3. Settings:
   ```
   Root directory:  (leave blank — repo root)
   Build command:   npm install
   Start command:   node backend/oracle-gateway/index.js
   Instance type:   Free
   ```
4. Environment variables (Render dashboard → Environment):
   ```
   RPC_URL=https://rpc-amoy.polygon.technology
   CONTRACT_ADDRESS=<address from step 4>
   ORACLE_PRIVATE_KEYS=<same 3 keys as .env>
   ```
   (Render injects its own `PORT` — `backend/oracle-gateway/config.js` already reads
   `process.env.PORT`, so leave it unset.)
5. Deploy. Once live, note the URL, e.g. `https://sternprotocol-gateway.onrender.com`.
6. Smoke-test: `curl https://sternprotocol-gateway.onrender.com/health` should return
   `{"ok":true,...}`.

Free-tier Render services sleep after ~15 minutes idle and take 30-60s to wake on the
next request — hit `/health` a minute before you go on stage so the first real oracle
call during the demo isn't slow.

---

## 6. Deploy the frontend to Vercel

1. [vercel.com](https://vercel.com) → sign up with GitHub → **Add New Project** →
   import `VincentLee25/sternprotocol`.
2. Framework preset: **Vite**. Root directory: **`frontend`**.
3. Environment variables:
   ```
   VITE_CONTRACT_ADDRESS=<address from step 4>
   VITE_ORACLE_API=<Render URL from step 5>
   ```
4. Deploy. You'll get a URL like `https://sternprotocol.vercel.app`.

---

## 7. Walk the Golden Path once on the public deployment

Before presenting, do one full dry run against the live URLs (not localhost) so you
catch anything env-specific:

1. Open the Vercel URL, switch MetaMask to **Polygon Amoy**, connect the importer
   wallet.
2. Create one throwaway escrow (small value, short-ish deadline) using the Act 1-5
   script in [PRODUCT_PLAN.md §3](PRODUCT_PLAN.md).
3. Confirm the oracle gateway responds (Submit verification succeeds, 2-of-3
   attestations land on-chain — check the tx on `amoy.polygonscan.com`).
4. Confirm release/refund/dispute/amendment each work with the right MetaMask account
   connected.
5. Put the contract address + a PolygonScan Amoy link on your final pitch slide as
   proof of a real public transaction.

---

## 8. Troubleshooting

- **"escrow not found" from the gateway** — the gateway's `CONTRACT_ADDRESS` and the
  frontend's `VITE_CONTRACT_ADDRESS` point at different deployments, or the gateway
  process is still holding an old value in memory. Redeploy env vars on Render and
  trigger a redeploy (env changes don't hot-reload the running process).
- **"oracle bond required"** — that oracle's bond dropped below `ORACLE_BOND_ETH`
  (e.g. after being slashed in an earlier test run). Top it up by calling
  `postBond()` from that wallet (Hardhat console, or a small throwaway script) before
  the real demo — don't let a leftover slashed test wallet break the live run.
- **MetaMask "transaction failed" / stuck nonce** — Settings → Advanced → Clear
  activity tab data, for the account that's stuck.
- **Render gateway slow on first request** — free tier cold start; hit `/health`
  a minute before presenting.
