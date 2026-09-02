# STERN Design System: "Port Instrument"

Status: approved direction, not yet implemented.
Owner: design. Supersedes the current `ink` / `brass` theme in `frontend/tailwind.config.js`.

---

## 1. The direction in one paragraph

STERN replaces a Letter of Credit. The design has to argue that before anyone reads a
sentence. So the **app is a document**: one escrow reads as a deed, with numbered articles,
dot-leader term rows, and a conditions-precedent checklist that carries an attestation seal.
The **landing is a photograph**: a dusk container terminal, because the money is for a real
ship leaving a real port, and that is the emotional half of the argument.

This direction is a deliberate hybrid of two explored options:

| Inherited from | What |
|---|---|
| **01 Instrument** | Page layout. Asymmetric left-weighted hero, hairline-separated terms strip, single-document app screen, numbered articles, dot leaders, attestation seal. |
| **03 Port** | Typography and surface feel. Figtree display, Source Serif body, Space Mono data, rounded containers, soft shadows, pill buttons, dusk port imagery. |

The reconciliation rule, whenever the two conflict: **structure comes from 01, texture comes
from 03.** A ruled article block stays a ruled article block, but it lives on a 14px rounded
white panel with a soft shadow instead of a sharp hairline box.

---

## 2. Color

### 2.1 Core palette

| Token | Hex | Role |
|---|---|---|
| `navy` | `#2A415B` | Primary text on light. Primary button fill. Document rules. |
| `teal` | `#3E6C7D` | Accent. Secondary text on light. Links, active states, the marketing colour block. |
| `beige` | `#F5EFEB` | App page ground. Inset panels on white. Text on navy. |
| `sky` | `#C0D0E0` | Borders, dividers, table stripes, dot leaders, unfilled track. **Never text.** |
| `white` | `#FFFFFF` | Card and document surface. |

### 2.2 Dark chrome (landing only)

| Token | Hex | Role |
|---|---|---|
| `onyx` | `#0A0A0A` | Landing page ground. |
| `slate` | `#1C2537` | Elevated bands, the app/landing seam, overlays. |
| `alabaster` | `#E5E4E2` | Primary text on dark. |

On dark, secondary text is `rgba(229,228,226,.64)`, tertiary `rgba(229,228,226,.40)`,
hairlines `rgba(229,228,226,.12)`. Do not introduce new greys.

### 2.3 Semantic tier (added, not in the original palette)

The five escrow states are the most important signal in the product, and navy / teal / sky
sit too close together to encode them. These three are desaturated to sit on beige without
fighting navy.

| Token | Hex | Escrow states |
|---|---|---|
| `attested` | `#0F7C5E` | Verified, Completed |
| `pending` | `#B8802E` | Pending attestation, awaiting checks |
| `disputed` | `#A8443C` | Disputed, failed check, Refunded (muted) |

Semantic colour is **separate from the accent**. Teal is never a status; `attested` green is
never a button.

### 2.4 Contrast rules, non-negotiable

- `sky` on `beige` is about **1.4:1**. It is a border, a stripe, a dot leader or a filled
  chip background. It is never type, never an icon on its own, never a placeholder.
- Body text on `beige` is `navy`. Secondary is `teal` (about 4.7:1). Tertiary is `#7C8FA0`.
  Micro-labels may go to `#93A6B6` at 9 to 10px uppercase mono only.
- Status is never encoded by colour alone. Every state chip carries a text label, and every
  condition row carries a checked or unchecked box.

---

## 3. Typography

Three families, three jobs. Do not let them drift.

| Role | Family | Weights | Used for |
|---|---|---|---|
| Display | **Figtree** | 500, 600 | Headlines, page titles, numbers, buttons, nav, UI labels |
| Voice | **Source Serif 4** | 300, 400 | Lede paragraphs, marketing body, term labels, explanatory captions |
| Data | **Space Mono** | 400, 700 | Addresses, hashes, container refs, amounts, dates, all uppercase micro-labels |

The serif is the product's voice, not decoration. Anything written *to* a human is serif.
Anything the *chain* produced is mono. Everything structural is Figtree.

### 3.1 Scale

| Step | Size | Family / weight | Tracking | Use |
|---|---|---|---|---|
| Display XL | `clamp(46px, 6.4vw, 86px)` | Figtree 500 | `-0.034em` | Landing hero |
| Display L | `clamp(32px, 3.8vw, 50px)` | Figtree 500 | `-0.032em` | Section headline |
| Display M | `42px` | Figtree 500 | `-0.035em` | Terms strip numbers |
| Title | `clamp(26px, 2.8vw, 36px)` | Figtree 500 | `-0.034em` | Document title |
| Subtitle | `19px` | Figtree 600 | `-0.012em` | Step and card headings |
| Lede | `19px / 1.62` | Source Serif 300 | normal | Hero paragraph |
| Body serif | `15px / 1.5` | Source Serif 300 or 400 | normal | Marketing body, term labels |
| Body UI | `14.5px` | Figtree 400 | normal | App text, checklist rows |
| Small | `12.5 to 13px` | Figtree 400 | normal | Buttons, secondary UI |
| Data | `11 to 12px` | Space Mono 700 | `0.06em` | Values, addresses, amounts |
| Micro label | `9 to 10px` | Space Mono 400 | `0.18 to 0.22em` uppercase | Eyebrows, article numbers, column heads |

Rules:
- Tracking tightens as size grows. Never set Figtree above 30px at default tracking.
- Headlines get `text-wrap: balance`.
- Every column of numbers gets `font-variant-numeric: tabular-nums`.
- Running text stays near 65 characters. The hero lede is capped at `50ch`.

---

## 4. Surface language

The softened middle between 01 and 03.

| Property | Value |
|---|---|
| Container radius | `14px` (documents, cards, the port plate) |
| Inner panel radius | `10px` (stamp panel, plate caption, inset blocks) |
| Pill radius | `100px` (all buttons, all status chips, sidebar nav items, actor row) |
| Checkbox radius | `7px` |
| Card shadow | `0 2px 16px rgba(42,65,91,.075)` |
| Plate shadow | `0 40px 90px -34px rgba(0,0,0,.92)` |
| Hairline | `1px solid #C0D0E0` |
| Document rule | `2px solid #2A415B` under the document header only |
| Dot leader | `radial-gradient(circle, #A9BCCB 1.1px, transparent 1.2px)`, `background-size: 6px 4px`, repeat-x, bottom |

Notes:
- Borders on light surfaces are `sky`. There are no borders on the dark landing except
  hairlines at 12% alabaster.
- **One shadow depth only.** Do not introduce a hover-lift or a second elevation tier.
- The dot leader replaces the row border. A row with both reads as a form, not a contract.

---

## 5. Components

### 5.1 Buttons
All pills, `100px` radius, `13px` Figtree 500.

| Variant | Fill | Text | Use |
|---|---|---|---|
| Primary (light) | `navy` | `beige` | Submit verification, confirm |
| Primary (dark) | `teal` | white | Landing CTA |
| Light | `alabaster` | `onyx` | Landing nav CTA |
| Outline (light) | transparent, `1px sky` | `navy` | Open dispute, secondary |
| Outline (dark) | transparent, `1px rgba(229,228,226,.26)` | `alabaster` | Landing secondary |

Padding: `11px 24px` primary, `11px 22px` outline, `10px 22px` on the landing nav.

### 5.2 Status chip
Pill, `6px 13px`, mono `9.5px` uppercase at `0.14em`, with a `5px` leading dot in
`currentColor`. Background is the semantic hue at 11% alpha, text at full.

| State | Colour | Label |
|---|---|---|
| Pending | `pending` | Pending attestation |
| Verified | `attested` | Verified |
| Completed | `attested` | Completed |
| Disputed | `disputed` | Disputed |
| Refunded | `#7C8FA0` on `sky` at 40% | Refunded |

### 5.3 Dot-leader term row
Three parts on one baseline: serif label in `teal`, flexible dot-leader fill, mono value in
`navy`. Padding `10px 0`, gap `10px`, no bottom border. Rows sit in a
`repeat(auto-fit, minmax(280px, 1fr))` grid with a `54px` column gap.

### 5.4 Condition row
`20px` rounded checkbox, `14.5px` Figtree label, mono source tag right-aligned in
`#93A6B6`. Checked is a solid `attested` box with a white tick. Unchecked is white with a
`1.5px sky` border. Divider is `1px rgba(192,208,224,.5)`, omitted on the last row.

### 5.5 Attestation seal
`128px` conic-gradient ring: `attested` from `0turn` to `n/5 turn`, `sky` for the remainder.
`104px` beige hole carrying the `n/5` count in Figtree 500 at 33px and the word ATTESTED in
mono at 8.5px `0.18em`. Sits on a beige `10px` panel with a serif caption naming the blocking
article. The same ring at `38px` with a `29px` hole is the compact version used on the port
plate.

This is the single most important object in the product. It should be the last thing
simplified, not the first.

### 5.6 Port plate
`3:4` portrait, `14px` radius, `overflow: hidden`, plate shadow. Composition is a dusk
silhouette: dark sky top, warm sun low behind the gantry cranes, container stacks in
silhouette, water in the bottom quarter. A caption bar sits at `16px` inset from the bottom
on `rgba(10,10,10,.62)` with a `9px` blur, carrying the escrow number and the compact seal.

**The SVG in the mockup is a placeholder.** Replace it with real photography of Belawan or
Tanjung Priok at dusk, duotoned to `navy` shadows and `teal` midtones. Keep the caption bar.

### 5.7 Sidebar
`238px`, white, `1px sky` right border. Wordmark in Figtree 600 at `0.14em` with a mono
subtitle in `teal`. Nav items are `100px` pills, inactive at 66% opacity, active filled
`beige` at full weight 500. Footer carries two mono health rows with `5px` status dots, then
the actor pill.

---

## 6. Page structure

### 6.1 Landing (onyx)
1. **Nav.** Wordmark, four text links, one light pill. `1px` hairline below.
2. **Hero.** Two columns, `minmax(0,1fr)` and `minmax(0,368px)`, `72px` gap, centre-aligned.
   Left: mono eyebrow in teal, display XL headline broken across two lines with the final
   phrase in `#7FA9BC`, serif lede, two pills. Right: the port plate.
3. **Terms strip.** Four columns separated by vertical hairlines, top hairline above.
   Figtree number at 42px, serif caption capped at `23ch`.
4. **Colour block.** Full-bleed `teal`. Headline left, three numbered steps right separated by
   `1px` white at 24%.

### 6.2 App
Sidebar plus a single instrument document, `max-width: 940px`, left-aligned so the beige
margin reads as a document margin rather than dead space.

Document order: header (mono kicker, title, serif route line, status chip, `2px navy` rule),
Article I parties and terms, Article II conditions precedent with the seal panel, footer with
the e-BL CID and two actions on beige.

The escrow **list** view is not specified here. It should reuse the document header treatment
per row rather than becoming a card grid, so the instrument metaphor survives at both levels.

---

## 7. Motion

Minimal by design. Three permitted moments:

1. The seal ring animates its conic sweep from `0turn` to its value on mount, `700ms`,
   `cubic-bezier(.22,.61,.36,1)`.
2. Condition rows fade and rise `6px` in sequence at `40ms` stagger when attestations land.
3. Buttons and nav items transition `background-color` and `color` at `150ms` only.

No parallax, no scroll-jacking, no ambient animation. Everything above is wrapped in
`@media (prefers-reduced-motion: reduce)`.

---

## 8. Accessibility

- Focus ring: `2px solid teal`, `3px` offset, on every interactive element.
- The seal and the compact ring carry `role="img"` and an `aria-label` naming the count.
- Status is never colour-only. See 2.4.
- The port plate carries a real `aria-label`; it is content, not decoration.
- Target size for pills is at least `40px` tall including padding.

---

## 9. Tailwind config

Replace the `theme.extend` block in `frontend/tailwind.config.js` with this.

```js
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Figtree", "system-ui", "sans-serif"],
        serif: ['"Source Serif 4"', "Georgia", "serif"],
        mono: ['"Space Mono"', "ui-monospace", "SFMono-Regular", "monospace"]
      },
      colors: {
        navy: "#2A415B",
        teal: "#3E6C7D",
        beige: "#F5EFEB",
        sky: "#C0D0E0",
        onyx: "#0A0A0A",
        slate: "#1C2537",
        alabaster: "#E5E4E2",
        ink: { dim: "#7C8FA0", faint: "#93A6B6" },
        state: { attested: "#0F7C5E", pending: "#B8802E", disputed: "#A8443C" }
      },
      fontSize: {
        "2xs": ["0.5938rem", { lineHeight: "0.875rem", letterSpacing: "0.18em" }],
        data: ["0.75rem", { lineHeight: "1rem", letterSpacing: "0.06em" }]
      },
      borderRadius: { doc: "14px", panel: "10px" },
      boxShadow: {
        card: "0 2px 16px rgba(42,65,91,.075)",
        plate: "0 40px 90px -34px rgba(0,0,0,.92)"
      },
      letterSpacing: { display: "-0.034em", micro: "0.18em", macro: "0.22em" }
    }
  },
  plugins: []
};
```

**The quotes on `"Source Serif 4"` are load-bearing.** Unquoted, it is an invalid
font-family identifier, because a CSS identifier cannot be the digit `4`. The browser
discards the whole declaration and silently falls back to the sans stack, so every serif
in the app renders as Figtree and nothing errors. This shipped broken once already.

Font import in `src/styles.css`, replacing the Fira import:

```css
@import url("https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600&family=Source+Serif+4:ital,opsz,wght@0,8..60,300;0,8..60,400;1,8..60,300&family=Space+Mono:wght@400;700&display=swap");
```

Body defaults change from `background:#0b0f14; color:#e8edf2` to `background:#F5EFEB;
color:#2A415B`, and the focus outline from `#f5b84c` to `#3E6C7D`.

---

## 9b. Shared state vocabulary

`src/lib/escrowState.js` is the single source of truth for escrow state. It exists because
`Overview.jsx` and `EscrowDetail.jsx` each carried their own `STATE_LABELS` list and the two
disagreed: contract state `1` read "Verified" in the list and "Inspected" in the detail page,
so the status chip could show a colour the escrow was not in. It exports:

- `CHAIN_STATES` and `stateFromIndex(i)`: the contract enum, in order.
- `STATE_TONE`: state to semantic tone (`pending` / `attested` / `disputed` / `neutral`).
  Only these four; teal is the accent and is never a status.
- `STATE_LABEL`: human labels. A trader reads "Funds locked", not `Created`.
- `lifecycleStep(state)`: which of the three rail steps a state sits on.
- `formatEscrowId(id)`: chain ids are small integers and zero-pad to four; mock ids are
  timestamps and are shown as-is.

`StatusPill`, `Timeline`, `Overview` and `EscrowDetail` all read from this module. Adding a
state means editing one file.

---

## 10. Migration

The current theme is dark. The app becomes light. This is a find-and-replace with judgement,
not a mechanical one, but the mapping is consistent.

| Current | Becomes | Note |
|---|---|---|
| `bg-ink-950` | `bg-beige` | App shell |
| `bg-ink-900` | `bg-white` | Sidebar, cards, document |
| `bg-ink-850`, `bg-ink-800` | `bg-beige` | Hover and active fills |
| `border-ink-700`, `border-ink-600` | `border-sky` | |
| `text-paper` | `text-navy` | |
| `text-paper-dim` | `text-teal` | |
| `text-paper-faint` | `text-ink-faint` | Mono micro-labels only |
| `bg-brass-400` + `text-ink-950` | `bg-navy` + `text-beige` + `rounded-full` | Primary button |
| `text-brass-300`, `text-brass-400` | `text-teal` | IDs, active nav |
| `bg-brass-400/10`, `/15` | `bg-beige` | Active nav pill, avatar tile |
| `text-state-ok` | `text-state-attested` | |
| `text-state-warn` | `text-state-pending` | |
| `text-state-fail` | `text-state-disputed` | |
| `text-state-info` | `text-teal` | Pending is now `pending`, not `info` |
| `rounded` | `rounded-doc` or `rounded-full` | See section 4 |

This migration was applied on branch `keanan` in the order below.

1. `tailwind.config.js` and `styles.css`. Nothing renders correctly until both land.
2. `components/StatusPill.jsx`. Smallest file, defines the semantic tier, unblocks everything else.
3. `components/Sidebar.jsx`. Self-contained, gives immediate visual confirmation.
4. `pages/Overview.jsx`. Table to document-row list. Reuse the header treatment per row.
5. `pages/EscrowDetail.jsx`. The big one at 43k. This is where the Article structure and the
   seal are built. Budget real time here; it is the payoff for the whole system.
6. `pages/NewEscrow.jsx`. Form fields inherit from `components/Field.jsx`, so restyle that first.
7. `components/Timeline.jsx` and `ActivityLog.jsx` last.

The landing page does not exist yet in the repo. It is a separate route or a separate static
page; either is fine, but it needs its own dark token set and should not import the app shell.

---

## 11. Still open

These are unresolved and will change the build if answered late:

1. **Photography.** The port plate needs a real duotoned image. Without it the hero is a
   drawing, and it looks like one at full size.
2. **The 45-day figure.** Used in the hero lede and the terms strip. It needs a citable
   source before it appears in front of anyone.
3. **Escrow list view.** Section 6.2 specifies the detail page but not the list. Decide
   whether rows reuse the document header or become something else.
4. **Copy.** Everything in the mockup is placeholder written to test the type scale. None of
   it is approved messaging, and the serif voice only works if the copy is actually written
   for it.
5. **Refunded state.** It has no natural home in the three-colour semantic tier. Currently
   proposed as neutral grey, which may read as "nothing happened" rather than "money went
   back".
