# Delegated Account Requirements

## Current Model

Today STERN has company application roles:

```text
Company owner
  -> admin
  -> operator
```

Every user has one linked wallet address. These roles decide who can access company functions in the application. They do not grant one wallet authority to sign a transaction for another wallet, and the `SternEscrow` contract still enforces importer, exporter, verifier, and arbiter addresses directly.

This model is sufficient for the current demo and Amoy pilot. It is not a MetaMask-style delegated account.

## Why Delegation Is a Separate Security System

Wallet delegation can move funds or submit evidence on another party's behalf. It therefore needs explicit, revocable, bounded, on-chain authorization. Never solve it by sharing a private key, storing an employee private key in the backend, or treating a database role as wallet authority.

## Recommended Target Architecture

Use a company Safe smart account as the on-chain principal, with human wallets as owners or policy-bound delegates.

```text
Company Safe smart account
  -> Owner: creates policy and appoints/revokes delegates
  -> Admin: manages users, cannot move escrow funds without policy
  -> Operator delegate: can execute only allowed actions
  -> Verifier signer: can submit only its assigned milestone proof
```

The company Safe should be the importer/exporter address recorded in each new escrow. Do not attempt to modify an already-created escrow party address; create the intended Safe before funding it.

## Required Controls

1. **Wallet binding**: each user proves control of a wallet by signing a nonce. Email alone cannot bind or replace a wallet.
2. **Explicit scope**: a delegation declares permitted contract addresses and function selectors. Example: an operator may call `createEscrow` but not arbitrary ERC-20 transfers.
3. **Value limits**: per transaction, daily, and cumulative IDRT limits. High-value actions require owner co-signature.
4. **Expiry and revocation**: every delegation has an expiry; owner revocation must take effect immediately on-chain.
5. **Role separation**: no same person should both create a dispute and arbitrate it. Verifier delegates remain separated by milestone.
6. **Replay protection**: nonces, chain ID, Safe address, and policy version must bind each signed authorization.
7. **Audit trail**: record who delegated, who executed, action, transaction hash, policy version, timestamp, and revocation state.
8. **Emergency controls**: Safe multisig threshold, pause/lock policy, hardware-wallet owners, key rotation, and incident runbook.
9. **No backend custody**: the backend may prepare unsigned data or relay a sponsored UserOperation, but cannot hold a user/delegate private key.

## Implementation Choices

| Option | Use when | Trade-off |
| --- | --- | --- |
| Safe multisig owners | A few high-trust company signers and high value | Simple, mature, but multiple confirmations slow operations |
| Safe module/guard with policy | Operators need bounded actions from the company Safe | Powerful but must be audited; module bugs affect the Safe |
| ERC-4337 session keys | A short-lived, narrowly scoped operational task is needed | Good UX; policy validation and revocation require careful design |
| EIP-7702 delegation | The target chain, wallet stack, and audit plan explicitly support it | Emerging pattern; do not assume provider/wallet compatibility without validation |

For STERN, start with Safe owners plus a narrowly-scoped, audited policy module or ERC-4337 session-key policy. Do not deploy a custom delegation contract merely to demonstrate roles.

## Work Required Before Building It

1. Decide which company actions operators may perform and their IDRT limits.
2. Specify which action requires owner co-signature, including dispute, amendment, release, and token approvals.
3. Choose Safe module/guard or session-key architecture after confirming Polygon and Particle/Pimlico support.
4. Write threat model, policy schema, revocation flow, recovery flow, and event/audit schema.
5. Build test cases for expired/revoked delegates, selector bypass, token approval abuse, limit exhaustion, replay, and compromised operator wallet.
6. Obtain an independent audit before it controls escrow funds.
