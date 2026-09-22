import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "stern-theme";

function readStoredTheme() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function applyTheme(isDark) {
  document.documentElement.classList.toggle("dark", isDark);
}

// Mirrors the inline no-flash script in index.html. DESIGN.md v2.0 specifies a
// light-theme product with dark as an opt-in, so the OS preference no longer
// selects the theme — only a stored choice does. The toggle still works, and a
// visitor who picked dark keeps it across reloads.
export function useTheme() {
  const [theme, setTheme] = useState(() => (readStoredTheme() === "dark" ? "dark" : "light"));

  useEffect(() => {
    applyTheme(theme === "dark");
  }, [theme]);

  // The swap cross-fades every token-coloured surface at once. The class is
  // added around the flip and pulled straight back off, so nothing else in the
  // app pays for it. CSS-only reduced-motion cover does not reach a class we
  // add from JS, so it is checked explicitly.
  const toggleTheme = useCallback(() => {
    const root = document.documentElement;
    const still =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!still) {
      root.classList.add("theme-transition");
      window.clearTimeout(root._themeTimer);
      root._themeTimer = window.setTimeout(
        () => root.classList.remove("theme-transition"),
        260
      );
    }

    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore - theme just won't persist across reloads */
      }
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
