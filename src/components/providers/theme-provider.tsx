"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

export type ThemeMode = "system" | "light" | "dark";

const STORAGE_KEY = "gitwork.theme.v1";
const EVENT = "gitwork:theme-changed";

/**
 * Routes that must ALWAYS render light, regardless of the visitor's OS / stored
 * preference: guest-facing client deliverables shared by token + the print/PDF
 * render path (which navigates to /docs/[token]?print=1 via headless Chromium).
 * Kept in sync with the inline anti-flash script in src/app/layout.tsx.
 *
 * NOTE: `wiki` is deliberately NOT here — the client wiki supports light/dark via
 * its own ThemeToggle (internal takeover + public share header), matching Foundry.
 */
// Kept in sync with the inline anti-flash script in src/app/layout.tsx. The `(?:\/|$)`
// tail matches both `/demo/…` module pages AND the bare `/demo` hub (no trailing slash).
const FORCE_LIGHT = /^\/(docs|report|sign|timeline|brand|onboarding|preview|embed|demo|apply|vet)(?:\/|$)/;

/**
 * Routes that must ALWAYS render dark, regardless of the visitor's OS / stored
 * preference: the Corsair Xeneon Edge exec board (`/edge`) is a fixed dark surface
 * designed for a mounted display. Kept in sync with the inline anti-flash script in
 * src/app/layout.tsx. Takes precedence over FORCE_LIGHT (the paths don't overlap).
 */
const FORCE_DARK = /^\/edge(?:\/|$)/;

type ThemeContextValue = {
  /** The user's chosen mode. */
  mode: ThemeMode;
  /** The actually-applied theme after resolving `system` + forced-light routes. */
  resolved: "light" | "dark";
  /** True when the current route is forced light (toggle should be hidden/disabled). */
  forcedLight: boolean;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function isForcedLight(path: string | null | undefined): boolean {
  return !!path && FORCE_LIGHT.test(path);
}

function isForcedDark(path: string | null | undefined): boolean {
  return !!path && FORCE_DARK.test(path);
}

function readStoredMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (value === "light" || value === "dark" || value === "system") return value;
  } catch {
    /* localStorage can throw in private mode / when blocked — fall through */
  }
  return "system";
}

function resolveTheme(mode: ThemeMode, path: string | null | undefined): "light" | "dark" {
  if (isForcedDark(path)) return "dark";
  if (isForcedLight(path)) return "light";
  if (mode === "system") return systemPrefersDark() ? "dark" : "light";
  return mode;
}

function applyTheme(resolved: "light" | "dark") {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", resolved);
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // Lazy-init from storage on the client so the first applied value matches the
  // anti-flash script (avoids a system→stored flicker). SSR returns "system".
  const [mode, setModeState] = useState<ThemeMode>(() => readStoredMode());
  const [resolved, setResolved] = useState<"light" | "dark">(() =>
    typeof window === "undefined"
      ? "light"
      : resolveTheme(readStoredMode(), window.location.pathname),
  );

  // Re-resolve + apply whenever the mode or the route changes (route matters for
  // the forced-light deliverable pages on client-side navigation).
  useEffect(() => {
    const next = resolveTheme(mode, pathname);
    setResolved(next);
    applyTheme(next);
  }, [mode, pathname]);

  // Sync across tabs / components, and follow live OS changes while in `system`.
  useEffect(() => {
    const onModeChanged = () => setModeState(readStoredMode());
    window.addEventListener(EVENT, onModeChanged);
    window.addEventListener("storage", onModeChanged);

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChanged = () => {
      if (readStoredMode() === "system") {
        const next = resolveTheme("system", window.location.pathname);
        setResolved(next);
        applyTheme(next);
      }
    };
    mq.addEventListener("change", onSystemChanged);

    return () => {
      window.removeEventListener(EVENT, onModeChanged);
      window.removeEventListener("storage", onModeChanged);
      mq.removeEventListener("change", onSystemChanged);
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore — still update in-memory + broadcast below */
    }
    setModeState(next);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return (
    <ThemeContext.Provider
      value={{ mode, resolved, forcedLight: isForcedLight(pathname), setMode }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
