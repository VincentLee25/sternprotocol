# Cost and Operations Measurement Plan

This plan records the real measurements needed to estimate the cost and operating effort of one STERN escrow. Do not fill actual values from estimates or mock runs. The current repository does not contain production Polygon receipts, Pimlico invoices, Railway usage exports, provider storage bills, or pilot time-study data.

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
