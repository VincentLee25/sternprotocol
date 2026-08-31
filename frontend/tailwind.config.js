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
        // `teal` is the accent on LIGHT grounds (5.8:1 on white). On the dark
        // chrome it only reaches 3.4:1, so dark surfaces use `teal-light`
        // (7.8:1 on onyx) — same hue, legible either way.
        teal: { DEFAULT: "#3E6C7D", light: "#7FA9BC" },
        beige: "#F5EFEB",
        sky: "#C0D0E0",
        // Dark chrome (landing + seams)
        onyx: "#0A0A0A",
        slate: "#1C2537",
        alabaster: "#E5E4E2",
        // Text ramp below navy/teal. Both clear 4.5:1 on white AND on beige;
        // the earlier #7C8FA0 / #93A6B6 pair sat at 2.2-3.3:1 and read as
        // washed out on the app ground.
        ink: { dim: "#4E5E6D", faint: "#5C6E7E" },
        // Semantic tier - never used as an accent.
        // DEFAULT is tuned for the LIGHT app surfaces (>=4.5:1 on white AND
        // beige); `-light` is the same hue re-tuned for the dark chrome
        // (>=5:1 on onyx). Pending in particular had to darken a lot: the old
        // #B8802E sat at 2.99:1 on beige, which is why status pills read as
        // unlabelled smudges.
        state: {
          attested: { DEFAULT: "#3C755F", light: "#4A8F74" },
          pending: { DEFAULT: "#8C6123", light: "#B8802E" },
          disputed: { DEFAULT: "#A8443C", light: "#C5655D" }
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
