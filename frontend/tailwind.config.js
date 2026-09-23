// Colors resolve through CSS custom properties (defined in src/styles.css for
// :root and .dark) so the whole palette re-themes from one place instead of
// needing dark: variants on every utility class. The `rgb(var(...) / <alpha-value>)`
// shape is what lets Tailwind's opacity modifiers (e.g. bg-navy/10) keep working.
function themedColor(variable) {
  return `rgb(var(${variable}) / <alpha-value>)`;
}

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        // Stitch uses Poppins throughout the product; mono stays limited to
        // CIDs, addresses and transaction references.
        sans: ["Poppins", "system-ui", "sans-serif"],
        serif: ["Poppins", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"]
      },
      colors: {
        // Primary ramp. navy/beige are the light-mode identities of
        // alabaster/onyx (same roles, opposite domains); both pairs resolve
        // through the same variables so marketing and workspace re-theme together.
        navy: themedColor("--rgb-ink"),
        teal: themedColor("--rgb-teal"),
        // Fill-only teal; see the note in styles.css for why it does not re-theme.
        "teal-solid": themedColor("--rgb-teal-solid"),
        beige: themedColor("--rgb-page"),
        sky: themedColor("--rgb-sky"),
        onyx: themedColor("--rgb-page"),
        slate: themedColor("--rgb-surface"),
        alabaster: themedColor("--rgb-ink"),
        // Raised card/panel fill - replaces literal white so cards re-theme too
        surface: themedColor("--rgb-surface"),
        // Recessed fill: inputs, chips, sidebar hover, table zebra
        "surface-soft": themedColor("--rgb-surface-soft"),
        // Supporting accents (DESIGN.md "so the product does not feel
        // monochromatic"). Composition and data only — never status.
        ocean: themedColor("--rgb-ocean"),
        cyan: themedColor("--rgb-cyan"),
        lavender: themedColor("--rgb-lavender"),
        coral: themedColor("--rgb-coral"),
        // Text ramp below navy/teal
        ink: { dim: themedColor("--rgb-ink-dim"), faint: themedColor("--rgb-ink-faint") },
        // Semantic tier - never used as an accent
        state: {
          attested: themedColor("--rgb-state-attested"),
          pending: themedColor("--rgb-state-pending"),
          disputed: themedColor("--rgb-state-disputed")
        }
      },
      fontSize: {
        // DESIGN.md type scale. `2xs` is the compact operational caption; it
        // keeps a little tracking because it is still the carrier for the
        // remaining uppercase micro-labels.
        "2xs": ["0.6875rem", { lineHeight: "0.9375rem", letterSpacing: "0.06em" }],
        label: ["0.75rem", { lineHeight: "1rem", letterSpacing: "0.02em" }],
        data: ["0.75rem", { lineHeight: "1rem", letterSpacing: "0.04em" }]
      },
      borderRadius: {
        // Workspace controls stay compact; operational surfaces use one calm,
        // recognisable STERN radius rather than sharp dashboard boxes.
        panel: "10px",
        doc: "14px",
        document: "18px",
        surface: "14px",
        hero: "20px"
      },
      boxShadow: {
        card: "var(--shadow-card)",
        elevated: "var(--shadow-elevated)",
        plate: "0 40px 90px -34px rgba(0,0,0,.92)"
      },
      letterSpacing: { micro: "0.12em", macro: "0.14em", display: "0" },
      maxWidth: { workspace: "1440px" },
      spacing: { sidebar: "260px" },
      backgroundImage: {
        // Dot leader for document term rows
        leader: "radial-gradient(circle, #A9BCCB 1.1px, transparent 1.2px)",
        // DESIGN.md gradient tokens. Composition and hero use only.
        "gradient-primary": "linear-gradient(135deg, #EAF7F5 0%, #E9F1FB 52%, #F0ECFA 100%)",
        "gradient-ocean": "linear-gradient(135deg, #E8F4F8 0%, #DDECF8 55%, #EDE9F8 100%)",
        "gradient-soft": "linear-gradient(135deg, #F1FAF8 0%, #F4F1FB 100%)"
      },
      backgroundSize: { leader: "6px 4px" }
    }
  },
  plugins: []
};
