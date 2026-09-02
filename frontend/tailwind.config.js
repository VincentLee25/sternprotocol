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
        // Multi-word / numeric family names MUST stay quoted in the emitted CSS.
        // Unquoted, `Source Serif 4` is an invalid font-family identifier (a CSS
        // identifier cannot be the digit 4), so the browser drops the whole
        // declaration and silently falls back to the sans stack.
        sans: ["Figtree", "system-ui", "sans-serif"],
        serif: ['"Source Serif 4"', "Georgia", "serif"]
      },
      colors: {
        // Light app surfaces. navy/beige swap with alabaster/onyx in dark mode
        // (they're the same "primary text" / "page background" roles, just
        // named per the domain that used them first).
        navy: themedColor("--rgb-ink"),
        teal: themedColor("--rgb-teal"),
        // Fill-only teal; see the note in styles.css for why it does not re-theme.
        "teal-solid": themedColor("--rgb-teal-solid"),
        beige: themedColor("--rgb-page"),
        sky: themedColor("--rgb-sky"),
        // Dark chrome (landing + seams)
        onyx: themedColor("--rgb-page"),
        slate: themedColor("--rgb-surface"),
        alabaster: themedColor("--rgb-ink"),
        // Raised card/panel fill - replaces literal white so cards re-theme too
        surface: themedColor("--rgb-surface"),
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
        "2xs": ["0.5938rem", { lineHeight: "0.875rem", letterSpacing: "0.18em" }],
        data: ["0.75rem", { lineHeight: "1rem", letterSpacing: "0.06em" }]
      },
      borderRadius: { doc: "14px", panel: "10px" },
      boxShadow: {
        card: "0 2px 16px rgb(var(--rgb-ink) / 0.075)",
        plate: "0 40px 90px -34px rgba(0,0,0,.92)"
      },
      letterSpacing: { display: "-0.034em", micro: "0.18em", macro: "0.22em" },
      backgroundImage: {
        // Dot leader for document term rows
        leader: "radial-gradient(circle, #A9BCCB 1.1px, transparent 1.2px)"
      },
      backgroundSize: { leader: "6px 4px" }
    }
  },
  plugins: []
};
