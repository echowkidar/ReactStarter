import { useCallback, useEffect, useState } from "react";

// Light / dark screen theme. The choice is kept in this browser (localStorage) and
// applied as the "app-dark" class on <html> (not "dark": the theme plugin's own .dark rule is not print-safe). All dark styles are written inside
// `@media screen`, so printouts always come out in the normal light look.

export type Theme = "light" | "dark";
const KEY = "app-theme";
const EVENT = "app-theme-change";

export function getTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("app-dark", theme === "dark");
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* private window: still switch for this page */
  }
  applyTheme(theme);
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function useTheme() {
  const [theme, setState] = useState<Theme>(getTheme);

  useEffect(() => {
    const sync = () => setState(getTheme());
    window.addEventListener(EVENT, sync);
    // Another tab changed the theme
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) {
        applyTheme(getTheme());
        sync();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const toggle = useCallback(() => setTheme(getTheme() === "dark" ? "light" : "dark"), []);
  return { theme, toggle };
}
