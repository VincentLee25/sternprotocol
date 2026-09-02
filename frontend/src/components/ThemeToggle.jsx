import { Moon, Sun } from "lucide-react";
import { useTheme } from "../lib/theme.js";

// navy/alabaster (and beige/onyx) resolve through the same CSS variables, so
// these token classes read correctly whether this sits on marketing's dark
// chrome or the workspace's light chrome - no variant prop needed.
export default function ThemeToggle({ className = "" }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-pressed={isDark}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className={`grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full border border-navy/15 text-navy transition-colors duration-150 hover:bg-navy/8 ${className}`}
    >
      {isDark ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
    </button>
  );
}
