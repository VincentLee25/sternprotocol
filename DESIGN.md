---
design_system: STERN Protocol
version: 3.0
product_type: enterprise trade-finance escrow workspace
principles:
  - evidence before assertion
  - restrained operational clarity
  - premium human-designed visual system
  - trust is communicated by traceability, not decoration
  - every money-moving action exposes actor state and consequence
  - the public website may be expressive; operational screens remain focused and scannable
tokens:
  color:
    light:
      page: "#F5EFEB"
      surface: "#FFFFFF"
      surface_soft: "#F3EDE9"
      ink: "#2A415B"
      ink_dim: "#4E5E6D"
      ink_faint: "#5C6E7E"
      border: "#C0D0E0"
      accent: "#3E6C7D"
      accent_solid: "#3E6C7D"
      ocean: "#366475"
      cyan: "#B8E7FB"
      lavender: "#D1E4FF"
      coral: "#FFDAD6"
      success: "#3C755F"
      warning: "#8C6123"
      danger: "#A8443C"
      gradient_primary: "linear-gradient(135deg, #EAF7F5 0%, #E9F1FB 52%, #F0ECFA 100%)"
      gradient_ocean: "linear-gradient(135deg, #E8F4F8 0%, #DDECF8 55%, #EDE9F8 100%)"
      gradient_soft: "linear-gradient(135deg, #F1FAF8 0%, #F4F1FB 100%)"
    dark:
      page: "#0A0A0A"
      surface: "#1C2537"
      surface_soft: "#2E394C"
      ink: "#E5E4E2"
      ink_dim: "#A8B6C4"
      ink_faint: "#8592A0"
      border: "#404E62"
      accent: "#5B97AE"
      accent_solid: "#3E6C7D"
      ocean: "#9FCDE1"
      cyan: "#9DD4E8"
      lavender: "#B1C8E8"
      coral: "#D66E64"
      success: "#5EB08A"
      warning: "#D69E4A"
      danger: "#D66E64"
  typography:
    primary: "Poppins, system-ui, sans-serif"
    display: "Poppins, system-ui, sans-serif"
    display_weight: 700
    heading_weight: 700
    body_weight: 400
    medium_weight: 500
    semibold_weight: 600
  spacing: [4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80]
  radius:
    control: 6
    card: 10
    panel: 10
    hero: 14
    document: 14
  shadow:
    card: "0 8px 30px rgba(19,43,69,0.07)"
    elevated: "0 14px 40px rgba(19,43,69,0.10)"
  motion:
    interaction_ms: 180
    page_enter_ms: 450
    reduced_motion: true
---

# STERN Product and Design System

## Brand Definition

**STERN Protocol** is an evidence-led trade-finance workspace for controlled export-import settlement. It should feel like a premium maritime fintech product used by companies, verifiers, and arbiters: trustworthy and operationally serious without looking like a traditional banking portal, crypto wallet, or generic enterprise dashboard.

The brand personality is maritime, precise, accountable, modern, and quietly premium. The visual language combines international trade operations with contemporary fintech and editorial web design. Trust comes from visible evidence, parties, timestamps, lifecycle state, and auditability — not from decorative blockchain imagery.

Use the tagline only where it adds context: **Evidence-led escrow for export-import settlement.**

## Visual Direction

Create a polished LIGHT-THEME product ecosystem. The public website can be visually expressive and colorful; authenticated operational screens should retain the same brand but become denser and more functional.

- Use a warm off-white / paper-like page ground rather than stark white or dark canvas.
- Use clean white surfaces, deep maritime navy typography, and maritime teal as the primary action color.
- Add soft ocean blue, cyan, lavender, coral, and green as supporting accents so the product does not feel monochromatic.
- Use tasteful low-saturation gradients, especially soft ocean blue → teal → lavender. Gradients are for composition and emphasis, not every component.
- Use real maritime and trade imagery when imagery is needed: ports, container ships, cargo inspection, documents, customs, and logistics operations.
- Use Lucide icons. Never use emoji as interface icons.
- Preserve status semantics everywhere: green is attested/completed, ochre is waiting/time-sensitive, coral/red is disputed/error, muted blue-gray is inactive/reference data.
- The design must look intentionally composed by a professional product designer, not like an AI-generated template.
- Avoid dark infinite canvases, dotted backgrounds, floating artboards, excessive glassmorphism, generic AI illustrations, crypto coins, chains, neon, cyberpunk effects, and Web3 visual clichés.

## Color and Gradient Rules

Color should create visual rhythm across a page rather than decorate every box.

Preferred sequence for public pages:

`warm cream → white → soft blue/teal gradient → white → maritime photography → white → soft lavender/blue → warm cream`

Use gradients on:
- hero compositions
- large feature backgrounds
- selected CTA sections
- highlighted evidence/product demonstrations

Do not use gradients on every card, table row, button, or status element. Keep operational data surfaces mostly white.

Do not use saturated rainbow palettes or neon purple/blue crypto gradients.

## Typography

- **Poppins** is the product typeface: controls, tables, navigation, narrative and headings.
- **JetBrains Mono** is reserved for CIDs, addresses, hashes, and transaction references.
- Poppins 700: page and section headings. Poppins 600: navigation and card headings.
- Poppins 500: buttons, tabs, metadata that needs emphasis. Poppins 400: supporting copy.
- Hero heading: 48-72px on desktop depending on composition; never use excessive tracking.
- Page title: 28-36px.
- Section title: 22-32px.
- Body: 14-16px.
- Compact operational metadata: 11-13px.
- Avoid tiny text used merely to fill empty space.
- Avoid excessive uppercase labels. Use sentence case by default.
- Never use negative letter spacing.

## Layout Rules

- Public website: generous whitespace, asymmetric compositions, varied section layouts, strong visual hierarchy, and occasional full-width visual sections.
- Application shell: fixed 240-280px sidebar, one scrollable main workspace, max content width around 1440px.
- Desktop page padding: 32-40px. Mobile: 20-24px.
- Use 20-32px spacing between major sections and 16-24px inside grouped UI.
- Do not put every page section inside a decorative card.
- Cards are for repeated records, evidence artifacts, focused operational tools, and highlighted content.
- Prefer one strong composition over many identical cards.
- Use asymmetric grids where appropriate instead of repetitive three-column layouts.
- Operational panels use 10px radius; evidence previews and hero containers use 14px. Controls use 6px.
- Buttons are rounded but not capsule-shaped unless used for a compact status/filter.
- Tables use clear row separators, comfortable row height, fixed headers when useful, right-aligned numeric columns, and mobile card transformation.
- At 375px, stack columns, preserve the primary action, and avoid horizontal scrolling except for intentionally scrollable evidence tables.

## Public Website Rules

- The landing page is a real marketing/product website, not a design-system presentation.
- Use a clean top navbar with brand, concise navigation, Sign in, and Access Workspace.
- Hero imagery should be integrated into the composition rather than appearing as a generic stock-photo rectangle with arbitrary floating badges.
- Marketing sections should vary composition: editorial split, process flow, large evidence showcase, image-led section, and CTA.
- Avoid endless rows of identical cards.
- Use product UI previews when they communicate the product better than illustrations.
- Keep copy concise and credible.

## Application Rules

- Authenticated pages share the public brand but prioritize operational clarity.
- Light theme remains the default.
- Use mostly white operational surfaces with subtle gradient highlights only where they improve hierarchy.
- The sidebar should be light or softly tinted, not a heavy dark dashboard sidebar.
- Primary actions use maritime teal or a restrained teal/ocean treatment.
- Financial values and lifecycle states should have strong hierarchy.
- Dense information is acceptable, but remove unnecessary micro-copy and decorative metadata.
- Avoid making every KPI or row into a separate colorful card.

## Interaction Rules

- Every primary action must make its actor and effect explicit: `Lock IDRT`, `Submit evidence`, `Open dispute`, `Approve deadline`, `Resolve to refund`.
- Destructive or irreversible actions require a confirmation dialog stating asset, recipient, and irreversible consequence.
- Keep submit buttons disabled while a wallet operation is pending. Show transaction status with hash link, confirmation state, and actionable failure message.
- Tooltips explain icon-only controls. Keyboard focus is a 2px teal outline with 3px offset.
- Use 150-220ms color/opacity transitions only. Respect `prefers-reduced-motion`.
- Do not hide material errors behind toasts alone; show them next to the failed operation and preserve them in activity history.

## Information Architecture and Required Pages

### 1. Public Landing

Purpose: explain the business problem and direct companies to sign in or request a pilot.

- Premium maritime hero with headline, supporting copy, primary `Access Workspace`, and secondary `Request Pilot`.
- Evidence-to-settlement process visual.
- Evidence-first product demonstration.
- Trade operations / industries section.
- Integration and trust signals.
- Final CTA and legal/compliance footer.
- Use varied editorial layouts rather than repeated card grids.

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
- Primary action: `Create Escrow`.
- Use a real operational table as the main information structure, not a grid of generic dashboard cards.

### 4. Create Escrow

Purpose: create a correct, fundable transaction.

- Step form: counterparties, shipment/document data, amount and deadline, review and sign.
- Validate wallet formats, unique roles, future deadline, IDRT balance/allowance, and required document/evidence CID.
- Final review shows importer, exporter, arbiter, contract value, network, fees, and the contract action being signed.

### 5. Escrow Detail

Purpose: single source of truth for one trade instrument.

- Header: escrow ID, semantic lifecycle status, value, commodity/container, deadline, and primary role action.
- Center column: lifecycle rail, evidence list, document metadata, activity timeline.
- Right rail: contextual actions, dispute status, amendment state, and time remaining.
- Clearly distinguish `on-chain proof`, `current provider result`, and `simulated test result`.
- Keep the page visually consistent with the light premium brand; do not revert to an old compact banking-portal aesthetic.

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
- Verifier bond health, assigned milestone, provider health, queued evidence submissions, and alert feed.
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

Always treat this DESIGN.md as the primary design and product source of truth. Generate one page at a time while preserving the same STERN visual language across every page.

```text
Read DESIGN.md before generating the page. Follow its product requirements and visual system exactly. Generate ONLY the requested STERN Protocol page, not the entire website. Maintain the premium light-theme maritime fintech identity: warm off-white background, white surfaces, deep navy Poppins typography, restrained maritime teal, crisp borders, 6–14px rounding, subdued shadows, and realistic maritime/trade imagery where appropriate. Do not revert to the old compact banking-portal style, dark canvas, dotted background, generic dashboard cards, crypto/Web3 visuals, neon gradients, or AI-template layouts.
```
