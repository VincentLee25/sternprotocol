import { Moon, Sun } from "lucide-react";
import { useTheme } from "../lib/theme.js";
import { useLanguage } from "../lib/language.jsx";

// navy/alabaster (and beige/onyx) resolve through the same CSS variables, so
// these token classes read correctly whether this sits on marketing's dark
// chrome or the workspace's light chrome - no variant prop needed.
export default function ThemeToggle({ className = "" }) {
  const { theme, toggleTheme } = useTheme();
  const { t } = useLanguage();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-pressed={isDark}
      aria-label={t(isDark ? "Switch to light theme" : "Switch to dark theme")}
      title={t(isDark ? "Switch to light theme" : "Switch to dark theme")}
      className={`grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-panel border border-sky text-ink-dim transition-colors duration-150 hover:bg-surface-soft hover:text-navy ${className}`}
    >
      {/* Both icons are mounted so the swap can cross-fade and rotate rather
          than pop. The stack is one grid cell, so nothing shifts. */}
      <span className="grid place-items-center [grid-template-areas:'icon']">
        <Sun
          size={15}
          aria-hidden="true"
          className={`[grid-area:icon] transition-[opacity,transform] duration-200 ${
            isDark ? "rotate-0 opacity-100" : "-rotate-90 opacity-0"
          }`}
        />
        <Moon
          size={15}
          aria-hidden="true"
          className={`[grid-area:icon] transition-[opacity,transform] duration-200 ${
            isDark ? "rotate-90 opacity-0" : "rotate-0 opacity-100"
          }`}
        />
      </span>
    </button>
  );
}
