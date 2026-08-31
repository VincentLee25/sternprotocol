export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        // Multi-word / numeric family names MUST stay quoted in the emitted CSS.
        // Unquoted, `Source Serif 4` is an invalid font-family identifier (a CSS
        // identifier cannot be the digit 4), so the browser drops the whole
        // declaration and silently falls back to the sans stack.
        sans: ["Figtree", "system-ui", "sans-serif"],
        serif: ['"Source Serif 4"', "Georgia", "serif"],
        mono: ['"Space Mono"', "ui-monospace", "SFMono-Regular", "monospace"]
      },
      colors: {
        // Light app surfaces
        navy: "#2A415B",
        teal: "#3E6C7D",
        beige: "#F5EFEB",
        sky: "#C0D0E0",
        // Dark chrome (landing + seams)
        onyx: "#0A0A0A",
        slate: "#1C2537",
        alabaster: "#E5E4E2",
        // Text ramp below navy/teal
        ink: { dim: "#7C8FA0", faint: "#93A6B6" },
        // Semantic tier - never used as an accent
        state: {
          attested: "#3F7A63",
          pending: "#B8802E",
          disputed: "#A8443C"
        }
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
