# Cost and Operations Measurement Plan

This plan records the real measurements needed to estimate the cost and operating effort of one STERN escrow. Do not fill actual values from estimates or mock runs. The current repository does not contain production Polygon receipts, Pimlico invoices, Railway usage exports, provider storage bills, or pilot time-study data.

## Planning Estimates (24 September 2026)

These are budgeting estimates, not measured STERN production costs. Provider prices and the exchange rate below are public references; resource sizes, evidence volume, and pilot rates are explicit planning assumptions. Replace them with invoices, receipts, and pilot observations before making a production unit-economics claim.

### Estimated costs

| Cost item | Planning estimate | Basis and limits |
| --- | ---: | --- |
| Polygon happy-path lifecycle | **$0.24 / Rp4,273 per escrow** | Existing action budget in `04_DISPUTE_BOND_COST_STRUCTURE.md`: create $0.05 + three proofs $0.09 + start timelock $0.05 + release $0.05. This models six mined transactions when approval is batched; actual gas varies by bytecode, state, gas price, and token. |
| Polygon simple transaction reference | **$0.009-$0.022 / tx** | Network-wide historical 2026 reference in the research note, not a quote for a Stern contract call. Contract actions budgeted there at $0.01-$0.10 each. |
| Dispute path increment | **about $0.08 / Rp1,424** | Planning allowance for a $0.05 dispute raise plus $0.03 resolution, in addition to the applicable lifecycle actions. A real outcome may replace release with refund/split and has different gas. |
| Pimlico sponsored-action allowance | **$0.15 underlying gas per escrow** | Assumes three sponsored actions at $0.05 each (create, dispute, release); actual sponsorship depends on policy and which path is used. Pimlico says testnets are free and production is pay-as-you-go; reconcile its invoice to UserOperations. Do not add this $0.15 again to the Polygon gas total: it is the payer/provider route for part of that same gas. |
| Railway, small gateway + Postgres | **about $14.55 / month usage** | Assumption: combined average 1 GB RAM, 0.2 vCPU, 2 GB volume, 5 GB egress. Arithmetic at public rates: $10/GB-month RAM + $20/vCPU-month + $0.15/GB-month volume + $0.05/GB egress. A Hobby plan's $5 minimum is credited toward usage; this envelope is roughly $14.55 total, not $14.55 plus $5. Actual memory/CPU and always-on idle usage can change it materially. |
| Pinata Picnic storage plan | **$20 / month, includes 1 TB storage and 500 GB bandwidth** | Public plan price. At 20 MB evidence per escrow and 100 new escrows/month, this is **$0.20 fixed storage-plan allocation per new escrow** ($20/100); at 1,000/month it is **$0.02**. These assume the included capacity suffices and use new escrows/month as the allocation denominator. |
| Pinata storage overage | **$0.07 / GB-month** | Public Picnic overage. A 20 MB evidence bundle costs about **$0.0014 per retained month** only when over the included quota; at 12 months retained that is $0.0168 per escrow if the bundle is entirely over quota. Bandwidth overage is $0.10/GB. |
| Human review | **5 / 15 / 30 active minutes per reviewed case** | Low/base/high planning assumptions only; not an internet-derived Stern benchmark. Labor cost = minutes / 60 × the company's loaded hourly reviewer cost. Do not count waiting time as active review. |
| Exception rate | **5% / 10% / 20%** | Low/base/high sensitivity inputs, not observed rates or a claimed industry average. At the base 10% and 15 minutes/case, expected review effort is **1.5 minutes per completed escrow**. |
| Dispute rate | **1% / 2% / 5%** | Low/base/high sensitivity inputs, not observed rates or a claimed industry average. At 2%, a $0.08 dispute-path increment contributes **$0.0016 expected gas per funded escrow**, excluding bond principal, adjudication labor, and outcome-specific transactions. |

### Example monthly budget

Using the assumptions above, before human labor, audit/security, taxes, support, and payment-provider fees:

| Volume | Railway allocation | Pinata allocation | Polygon gas | Approx. total per new escrow |
| ---: | ---: | ---: | ---: | ---: |
| 100 new escrows/month | $0.1455 | $0.20 | $0.24 | **$0.5855 per escrow** |
| 1,000 new escrows/month | $0.01455 | $0.02 | $0.24 | **$0.27455 per escrow** |

The totals allocate monthly shared Railway and Pinata plan costs across new escrows and add the estimated on-chain lifecycle. They are not invoices or a production quote. At the 2% dispute sensitivity, add about $0.0016 expected gas per funded escrow; add reviewer labor using the formula above. Pimlico is not added as a second copy of Polygon gas. The public Pimlico page describes testnet use as free and production as pay-as-you-go; use the actual account billing/export to price the sponsored share.

For conversion, **$1 = Rp17,803** is Bank Indonesia JISDOR for 23 September 2026, the latest published observation used here. This is a dated reference, not a guaranteed conversion rate. Thus the example totals are about **Rp10,424** and **Rp4,888 per new escrow**, respectively.

### Public price references

- Railway usage pricing and plan credit: <https://docs.railway.com/pricing> and <https://docs.railway.com/pricing/plans>. The illustrative resource envelope above is our assumption, not Railway's recommended production sizing.
- Pimlico production/testnet billing overview: <https://www.pimlico.io/>. Pricing, supported chains, sponsorship rules, and account terms can change; the dashboard invoice is authoritative for this project.
- Pinata current plans and overages: <https://pinata.cloud/pricing>.
- Bank Indonesia JISDOR: <https://www.bi.go.id/en/statistik/informasi-kurs/transaksi-bi/jisdor/default.aspx>.
- Polygon network fee reference and methodology noted in `04_DISPUTE_BOND_COST_STRUCTURE.md`; use explorer receipts and `gasUsed × effectiveGasPrice` for Stern measurements, not a network average: <https://poltrack.tech/report> and <https://polygonscan.com/gastracker>.

### Assumptions to replace first

1. Record actual transaction receipts for at least 20 complete happy paths and each available dispute/refund path; report median and p90 per action.
2. Export one full Railway billing period and Pimlico UserOperation/billing data. The infrastructure envelope is only a starting scenario, not a capacity forecast.
3. Measure evidence bundle sizes and retention. The 20 MB value is a planning placeholder, and monthly storage accumulates while evidence is retained.
4. Time 10-20 representative human reviews. Keep the 5%/10%/20% exception and 1%/2%/5% dispute values as sensitivity analysis until pilot denominators are large enough to report observed rates.

## Measurement Status

| Input | Source of truth | Current availability |
| --- | --- | --- |
| Polygon gas used and price | Polygon transaction receipt | Collect from a deployed Amoy lifecycle; repeat on the intended production chain later |
| On-chain transaction count | Lifecycle transaction hashes and receipts | Collect per escrow and lifecycle outcome |
| Pimlico cost | Pimlico dashboard/invoice plus UserOperation details | Collect for the same UserOperations and billing period |
| Railway cost | Railway usage/billing export | Collect monthly; separate fixed service cost from workload-driven cost |
| Evidence storage | Actual storage provider usage and invoice | Collect bytes, retention period, retrieval/egress, and price |
| Human review time | Timed internal sample | Run a 10-20 case study using the same task definition |
| Exception rate | Pilot case log | Requires a pilot using the agreed denominator below |
| Dispute rate | Pilot escrow and dispute records | Requires funded escrow observations; do not substitute a survey for observed rate |

## Collection Definitions

### 1. Actual Polygon Gas

For each transaction that changes the STERN contract state, save:

- escrow ID, lifecycle action, transaction hash, network, block number, timestamp;
- `gasUsed` and `effectiveGasPrice` from the mined transaction receipt;
- `from`, `to`, receipt status, and contract event emitted.

Calculate the native transaction fee as:

```text
POL fee = gasUsed * effectiveGasPrice / 10^18
```

Use the receipt's effective price, not a current gas tracker quote. Keep the native fee in POL. Convert to IDR/USD only with a separately timestamped market price and source.

### 2. On-Chain Transactions per Escrow

Trace and group transactions by escrow ID. For the happy path, capture every actual receipt for:

```text
create escrow -> inspected proof -> shipped proof -> customs proof
-> start timelock -> release
```

Also measure refund, dispute raise, arbiter resolution, and deadline amendment as separate outcome paths. Record token approval separately if it is a distinct transaction. A batched Smart Account UserOperation may contain multiple calls but produce a single chain transaction; report both call count and mined transaction count.

### 3. Gas Cost by Action

Store one row per mined transaction and calculate `gasUsed * effectiveGasPrice`. Report median, p90, minimum/maximum, and sample count by action. Do not multiply one transaction's gas by a presumed lifecycle count when receipts are available.

### 4. Pimlico Cost

For each UserOperation, record its hash, escrow/action, bundler transaction hash, actual UserOperation gas fields, paymaster/sponsorship result, and any provider-reported cost. Reconcile these with Pimlico's billing export for the same period.

Report two figures separately:

```text
observed on-chain fee (receipt)      = protocol transaction's actual native fee
observed Pimlico billed amount       = provider's actual invoice/account charge
```

Do not assume they are equal. Include currency, billing period, sponsorship policy, and failed/reverted operations.

### 5. Railway Cost

Export the actual Railway bill/usage for a full billing period. Record service, CPU, memory, storage, egress, volume, deployed hours, and amount/currency. Report:

```text
monthly fixed/allocated platform cost
variable cost attributable to the measured workload
cost per completed escrow = allocated cost / completed escrows in that period
```

State the allocation method and workload volume. With a single shared gateway, per-escrow cost is an allocation, not a directly metered fact.

### 6. Evidence Storage

For every evidence object, record escrow ID, object type, raw bytes, stored bytes, provider, retention period, retrieval count, egress bytes, and invoice amount. Calculate average and p90 storage per escrow. Include pinning, replication, request, and retrieval charges where applicable.

```text
storage per escrow = sum(stored bytes for its evidence)
storage cost per escrow over period = attributable provider charge / escrow count
```

Keep storage size and cost separate because retention and retrieval change the cost over time.

### 7. Human Review Time

Run a time study on 10-20 representative cases. Define the start/end points before timing, such as reviewer opens a complete case through recorded disposition. Capture case type, reviewer role, active minutes, waiting time separately, outcome, and exception reason. Report median and p90; show sample size and exclude or separately report training cases.

### 8. Exception Rate

Use completed cases during the stated pilot period:

```text
exception rate = unique cases requiring human review / all completed cases
```

Count each case once in the numerator, even when it has multiple exception reasons. Report reason categories separately (source unavailable, source conflict, stale evidence, failed validation, document mismatch, other). State whether cases still in progress are excluded.

### 9. Dispute Rate

Use funded escrows whose outcome is known by the reporting cutoff:

```text
dispute rate = unique funded escrows with at least one dispute / all funded escrows
```

Count an escrow once in the primary numerator even if it has multiple dispute events. Separately report number of dispute events, upheld/frivolous outcomes, disputed value, and unresolved cases. Record period, cohort, and cutoff date. Survey intent is not an observed dispute rate.

## Per-Escrow Record Template

Keep one lifecycle summary plus linked transaction rows. Never store private keys, API secrets, raw personal data, or customer documents in a public repository.

```text
period_start_utc,period_end_utc,network,contract_address,escrow_id,outcome
tx_hash,action,receipt_status,gas_used,effective_gas_price_wei,fee_pol
user_operation_hash,user_operation_gas,pimlico_billed_amount,pimlico_billed_currency
evidence_bytes,evidence_provider,retention_days,egress_bytes,storage_cost,cost_currency
railway_period_cost,cpu_hours,ram_gb_hours,volume_gb_hours,egress_gb,allocation_method
review_case_id,review_role,active_review_minutes,wait_minutes,exception_reason
funded_escrow,had_dispute,dispute_event_count,dispute_outcome
```

## Reporting Rules

- Label every number as `measured`, `provider-billed`, `allocated`, or `estimated`.
- Include chain, contract version/address, dates, sample size, and source export for every result.
- Keep Amoy/test token results separate from production chain/token results.
- Report averages with median and p90 when samples are skewed; include zero/failed cases where they consume provider resources.
- Do not claim unit economics from a handful of demo transactions. Gather a representative pilot cohort first.
