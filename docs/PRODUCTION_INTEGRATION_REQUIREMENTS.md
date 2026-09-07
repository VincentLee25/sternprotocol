# Production Integration Requirements

## Honest Deployment Status

The application can be deployed as a real running service on Railway plus Polygon Amoy. That does not make its external data real: the source adapters currently return deterministic mock data. Do not present CEISA, AIS, inspection, VGM, or IPFS results as live partner data until a provider connection is active and auditable.

## What Is Needed for Real APIs

| Integration | Required before activation | Production implementation |
| --- | --- | --- |
| CEISA/INSW customs | Formal access/MOU, organization approval, API documentation, test credentials, data-processing terms | Server-side OAuth/client certificate client; encrypted credential store; signed response archive; outage/retry policy |
| AIS/shipping | Commercial AIS or carrier agreement, vessel/container identifiers, rate-limit terms | Provider adapter with request signing, normalized event schema, raw response archive, source timestamp |
| VGM/port | Terminal/shipping-line data agreement or verified IoT partner | Signed device/provider events, calibration and provenance policy, exception handling |
| Inspection | Surveyor agreement and certificate verification method | Certificate issuer verification, signed artifact/CID, verifier authorization workflow |
| Document storage | IPFS pinning provider/account and retention policy | Upload service, immutable CID, malware scan, encryption/key policy, retrieval SLA |
| IDRT | Written approval from issuer/custodian and verified token contract | Replace `IDRTDemo`; test decimals, permit/approval behavior, transfer restrictions, freezes, and custody/reconciliation |

## Adapter Boundary

Keep every live provider server-side. The browser must never receive provider credentials, Oracle keys, arbiter keys, or `INTERNAL_API_KEY`.

Each provider adapter must return a normalized record with:

```text
provider
providerEventId
subjectId
observedAt
receivedAt
verificationResult
rawArtifactCid
signatureOrIntegrityProof
schemaVersion
```

The gateway should submit a milestone only after validating the provider response, the subject binding, freshness, signature/integrity proof, and conflict policy. Persist the raw artifact and its hash before a blockchain write.

## Railway Production Service

Use a persistent volume at `/data` and set:

```text
RPC_URL
CONTRACT_ADDRESS
ORACLE_PRIVATE_KEYS
ARBITER_PRIVATE_KEY
IDRT_MINTER_PRIVATE_KEY
INTERNAL_API_KEY
AUTH_TOKEN_SECRET
IDENTITY_STORE_FILE=/data/identities.json
DEMO_CLAIMS_FILE=/data/demo-claims.json
CORS_ORIGINS=https://frontend.example
```

For a multi-instance launch, replace JSON files with Postgres before scaling Railway replicas. Add migrations, encrypted backups, audit trails, rate limiting, request tracing, alerts, and health checks for each provider.

## Mainnet Gate

All of the following are required before real funds:

1. A formal decision on the correct chain and legal/custody model for the real IDRT asset.
2. A verified real token integration on a non-production environment.
3. Independent Solidity audit, token-integration review, fuzz/property tests, and application penetration test.
4. Managed/HSM or custody-backed Oracle and arbiter signers, with rotation, revocation, and incident response.
5. Live provider contracts, data processing agreements, source provenance, and replay/outage handling.
6. Database/event indexer, monitoring, reconciliation, operations runbook, and support process.
7. Legal, privacy, sanctions/AML, and customs compliance approval for the intended pilot.

Until this gate is passed, call the deployment an Amoy testnet pilot, not production escrow.
