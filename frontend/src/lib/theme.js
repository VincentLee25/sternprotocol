import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "stern-theme";

function systemPrefersDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

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

// Mirrors the inline no-flash script in index.html: explicit choice wins,
// otherwise follow the OS preference (and keep following it live).
export function useTheme() {
  const [theme, setTheme] = useState(() => (readStoredTheme() || (systemPrefersDark() ? "dark" : "light")));

  useEffect(() => {
    applyTheme(theme === "dark");
  }, [theme]);

  useEffect(() => {
    if (readStoredTheme()) return undefined;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event) => setTheme(event.matches ? "dark" : "light");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const toggleTheme = useCallback(() => {
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
