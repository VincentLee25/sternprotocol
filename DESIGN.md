---
design_system: STERN Protocol
version: 1.0
product_type: enterprise trade-finance escrow workspace
principles:
  - evidence before assertion
  - restrained operational clarity
  - trust is communicated by traceability not decoration
  - every money-moving action exposes actor state and consequence
tokens:
  color:
    light:
      page: "#F5EFEB"
      surface: "#FFFFFF"
      ink: "#2A415B"
      ink_dim: "#4E5E6D"
      ink_faint: "#5C6E7E"
      border: "#C0D0E0"
      accent: "#3E6C7D"
      accent_solid: "#3E6C7D"
      success: "#3C755F"
      warning: "#8C6123"
      danger: "#A8443C"
    dark:
      page: "#0A0A0A"
      surface: "#1C2537"
      ink: "#E5E4E2"
      ink_dim: "#A8B6C4"
      ink_faint: "#8592A0"
      border: "#404E62"
      accent: "#5B97AE"
      success: "#5EB08A"
      warning: "#D69E4A"
      danger: "#D66E64"
  typography:
    sans: "Figtree, system-ui, sans-serif"
    serif: "Source Serif 4, Georgia, serif"
    display_weight: 700
    body_weight: 400
  spacing: [4, 8, 12, 16, 20, 24, 32, 40, 48, 64]
  radius:
    control: 6
    panel: 10
    document: 14
  shadow:
    card: "0 2px 16px rgba(42,65,91,0.075)"
  motion:
    interaction_ms: 180
    page_enter_ms: 560
    reduced_motion: true
---

# STERN Product and Design System

## Brand Definition

**STERN Protocol** is an evidence-led trade-finance workspace for controlled export-import settlement. It should feel like a disciplined operations product used by companies, verifiers, and arbiters, not a consumer crypto wallet, an exchange, or a marketing landing page.

The brand personality is calm, maritime, precise, and accountable. The visual language takes cues from shipping documents, port operations, and regulated financial systems: clear hierarchy, document-like details, semantic status colors, and readable audit trails. The product communicates that each assertion is backed by an artifact, a party, and a timestamp.

Use the tagline only where it adds context: **Evidence-led escrow for export-import settlement.**

## Visual Direction

Use an enterprise gateway pattern with minimal Swiss-style discipline: deliberate white space, hard-working grids, clean typography, and subtle borders. The STERN tokens above are authoritative; do not replace them with generic blue/purple gradients or a gold crypto aesthetic.

- Light mode is the default working environment: warm paper-like page ground, white work surfaces, maritime navy ink, muted teal action color.
- Dark mode is available for low-light operations and product marketing chrome, not a different brand.
- Show actual ports, containers, bills of lading, evidence documents, or real operational state where imagery is needed. Do not use decorative abstract blockchain graphics.
- Use Lucide icons. Never use emoji as interface icons.
- Preserve status semantics everywhere: green is attested/completed, ochre is waiting/time-sensitive, red is disputed/error, muted gray-blue is inactive/reference data.

## Typography

- **Figtree**: navigation, labels, buttons, forms, tables, numeric UI, compact operations text.
- **Source Serif 4**: operational explanations, document metadata, evidence narrative, empty-state support text, and longer human-readable detail.
- Page title: 28-36px, Figtree 700, normal tracking. Use hero scale only on a true marketing page.
- Section title: 16-20px, Figtree 600-700.
- Body: 14-15px, Figtree or Source Serif 4 depending on data density.
- Label/meta: 10-12px, Figtree, uppercase only for short labels; letter spacing 0.12-0.18em.
- Never use negative letter spacing. Never scale font size based on viewport width.

## Layout Rules

- Desktop application shell: fixed 240-280px sidebar, one scrollable main workspace, max content width 1440px.
- Main content uses 24px gap on desktop and 16px on mobile. Page padding: 24px mobile, 32-40px desktop.
- Do not put page sections inside decorative cards. Cards are for repeated rows, evidence artifacts, modals, and focused operational tools only.
- Panels use 10px radius. Document/artifact previews may use 14px radius. Avoid pills except statuses, avatars, and compact filters.
- Tables have fixed headers when useful, clear row separators, right-aligned numeric columns, and responsive card transformation on narrow screens.
- At 375px, stack all columns, preserve a visible primary action, and avoid horizontal scrolling except in a deliberately scrollable evidence table.

## Interaction Rules

- Every primary action must make its actor and effect explicit: `Lock IDRT`, `Submit proof`, `Open dispute`, `Approve deadline`, `Resolve to refund`.
- Destructive or irreversible actions require a confirmation dialog stating asset, recipient, and irreversible consequence.
- Keep submit buttons disabled while a wallet operation is pending. Show transaction status with hash link, confirmation state, and actionable failure message.
- Tooltips explain icon-only controls. Keyboard focus is a 2px teal outline with 3px offset.
- Use 150-220ms color/opacity transitions only. Respect `prefers-reduced-motion`.
- Do not hide material errors behind toasts alone; show them next to the failed operation and preserve in activity history.

## Information Architecture and Required Pages

### 1. Public Landing

Purpose: explain the business problem and direct companies to sign in or request a pilot.

- Full-bleed verified port/container image with text directly over the image, never in a floating card.
- Brand name, one-sentence promise, primary `Access workspace`, secondary `Request pilot`.
- A short evidence-to-settlement flow, industries served, integration status, and legal/compliance footer.
- Keep the next section visible below the first viewport on desktop and mobile.

### 2. Company Access

Purpose: organization onboarding and secure entry.

- Tabs or segmented control: `Sign in` and `Register company`.
- Registration fields: company name, email, username, verified wallet address, password.
- MFA enrollment and six-digit verification states.
- Do not present seed phrases or private key fields to ordinary users.

### 3. Workspace Overview

Purpose: daily operational scan for a company.

- Compact KPI strip: active escrow value, awaiting evidence, disputes, deadlines in next 72 hours.
- Searchable escrow table with state, counterparties, commodity/container, IDRT amount, deadline, owner, and latest event.
- Filters: role, lifecycle state, evidence status, date range.
- Primary action: `Create escrow`.

### 4. Create Escrow

Purpose: create a correct, fundable transaction.

- Step form: counterparties, shipment/document data, amount and deadline, review and sign.
- Validate wallet formats, unique roles, future deadline, IDRT balance/allowance, and required document/evidence CID.
- Final review shows importer, exporter, arbiter, contract value, network, fees, and the contract action being signed.

### 5. Escrow Detail

Purpose: single source of truth for one trade instrument.

- Header: escrow ID, semantic lifecycle status, value, commodity/container, deadline, and primary role action.
- Center column: lifecycle rail, proof/evidence list, document metadata, activity timeline.
- Right rail: contextual actions, dispute status, amendment state, and time remaining.
- Clearly distinguish `on-chain proof`, `current provider result`, and `simulated test result`.

### 6. Evidence and Verification

Purpose: let verifier institutions review source artifacts and sign only a defensible milestone.

- Three milestone tabs: Inspection, Shipment, Customs.
- Provider response summary, raw artifact/CID, signature/integrity status, observed time, source freshness, and submit action.
- Fault simulation is visible only in a clearly marked test environment. Never put it in a production operator view.

### 7. Dispute Case

Purpose: structured, auditable exception handling.

- Case metadata: disputed milestone, raiser, dispute bond, challenge deadline, evidence comparison, and current freeze state.
- Party submits reason and artifacts. Arbiter sees a decision workspace with `Release to exporter` and `Refund importer` as separate, explicit actions.
- Show slash outcome and bond allocation before arbiter confirms.

### 8. Amendment Inbox

Purpose: counterparty approval of a changed deadline.

- List pending proposals with original deadline, proposed deadline, proposer, reason, and expiry.
- Counterparty can approve or reject. The proposer cannot approve their own request.

### 9. Company and Team

Purpose: corporate identity, membership, and access management.

- Company profile and verified wallet binding.
- Team table: user, email, wallet, role, MFA state, last active, status.
- Owner can invite admin/operator; admin can invite operator. Never let a UI role imply automatic contract admin/verifier rights.
- Wallet delegation settings appear only after the delegation architecture is implemented and audited.

### 10. Operations Console

Purpose: restricted verifier/arbiter/admin work.

- Separate route and elevated-session indicator.
- Verifier bond health, assigned milestone, provider health, queued proof submissions, and alert feed.
- Arbiter case queue with no private key entry in normal production UI; use managed signer/hardware wallet integration.

### 11. Settings and Integration Status

Purpose: show environment health without exposing secrets.

- Network and contract addresses, provider status, webhook health, audit export, notification preferences.
- Explicit labels: `Testnet`, `Simulation`, `Live provider`, or `Unavailable`.

## Core Components

| Component | Required behavior |
| --- | --- |
| App sidebar | logo, company switcher, role-aware navigation, wallet/network state, theme toggle, sign out |
| Status pill | fixed color mapping for lifecycle/evidence; text label always accompanies color |
| Data table | filters, empty/loading/error states, row click opens detail, mobile fallback |
| Evidence card | source, artifact CID, signer, observed time, verification result, copy/link controls |
| Timeline | chronological activity with actor and transaction/artifact references |
| Deadline control | local timezone display, UTC detail on hover/expand, warns before time-sensitive action |
| Confirmation dialog | action, signer, recipient, amount, chain, consequence, cancel/confirm |
| Toast plus inline feedback | progress/success/error; no silent blockchain failure |

## Content Voice

Write concise operational English by default. Use Indonesian in an Indonesia-specific deployment only, and translate all related states consistently. Avoid crypto jargon unless the role requires it. Prefer `IDRT escrow` over `token lock`, `evidence` over `proof` when describing a human-facing artifact, and `on-chain record` over `blockchain magic`.

Examples:

- Good: `Customs evidence verified. Challenge window ends 14:20 WIB.`
- Good: `Opening this dispute locks a 3% IDRT bond until the arbiter decides.`
- Avoid: `Your funds are SAFU.`
- Avoid: `AI-powered trust layer.`

## Stitch Prompt Seed

Use this with Stitch after it reads this file:

```text
Create the STERN Escrow Detail page defined in DESIGN.md. Use the exact light-mode tokens, Figtree and Source Serif 4, a restrained trade-finance operations shell, a left sidebar, a centered evidence/lifecycle workspace, and a right action rail. Show real operational components only: escrow status, IDRT value, shipment evidence, challenge deadline, activity timeline, and role-gated actions. Do not use crypto gradients, neon, generic dashboard cards, emoji, or decorative blockchain graphics.
```
