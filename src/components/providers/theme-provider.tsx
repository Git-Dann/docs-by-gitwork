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
 * ⚠️ Both sign-in pages (`/login`, `/portal/login`) are in this list and MUST stay
 * here. They are hand-painted in fixed hexes to look identical for every visitor,
 * but they also use `bg-white`, and `[data-theme="dark"] .bg-white` remaps that to
 * `--surface-0` (near-black) while the inline `color` stays dark ink. Omitting them
 * shipped a sign-in page in August 2026 whose "Continue with Google" label and
 * Pulse/Study/Docs headings were invisible — dark text on dark cards — for anyone
 * whose stored theme or OS was dark.
 *
 * NOTE: `wiki` is deliberately NOT here — the client wiki supports light/dark via
 * its own ThemeToggle (internal takeover + public share header), matching Foundry.
 */
// Kept in sync with the inline anti-flash script in src/app/layout.tsx. The `(?:\/|$)`
// tail matches both `/demo/…` module pages AND the bare `/demo` hub (no trailing slash).
const FORCE_LIGHT = /^\/(docs|report|sign|timeline|brand|onboarding|preview|embed|demo|apply|vet|login|portal\/login)(?:\/|$)/;

/**
 * Routes that must ALWAYS render dark, regardless of the visitor's OS / stored
 * preference: the Corsair Xeneon Edge exec board (`/edge`) is a fixed dark surface
 * designed for a mounted display. Kept in sync with the inline anti-flash script in
 * src/app/layout.tsx. Takes precedence over FORCE_LIGHT (the paths don't overlap).
 */
const FORCE_DARK = /^\/edge(?:\/|$)/;

/**
 * The Halloween theme (src/components/seasonal/halloween.tsx): dark, with pumpkin orange as the
 * brand colour, fog and ghosts. Only on the app and the demo — never on a client deliverable
 * or a sign-in page. Kept in sync with the anti-flash script in src/app/layout.tsx.
 */
export const HALLOWEEN_PATHS = /^\/(app|demo)(?:\/|$)/;
export const HALLOWEEN_KEY = "foundry.halloween.v1";

/** On by default from 20 October to 2 November, unless someone switched it off. */
export function halloweenSeason(now: Date): boolean {
  const m = now.getMonth();
  const d = now.getDate();
  return (m === 9 && d >= 20) || (m === 10 && d <= 2);
}

function readHalloween(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const v = window.localStorage.getItem(HALLOWEEN_KEY);
    if (v === "on") return true;
    if (v === "off") return false;
  } catch {
    /* storage blocked — fall back to the season */
  }
  return halloweenSeason(new Date());
}

function halloweenOn(path: string | null | undefined, wanted: boolean): boolean {
  return wanted && !!path && HALLOWEEN_PATHS.test(path);
}

type ThemeContextValue = {
  /** The user's chosen mode. */
  mode: ThemeMode;
  /** The actually-applied theme after resolving `system` + forced-light routes. */
  resolved: "light" | "dark";
  /** True when the current route is forced light (toggle should be hidden/disabled). */
  forcedLight: boolean;
  setMode: (mode: ThemeMode) => void;
  /** The Halloween theme is showing on this route. */
  halloween: boolean;
  /** This route can show it (so the pumpkin toggle is offered). */
  halloweenAvailable: boolean;
  setHalloween: (on: boolean) => void;
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

function resolveTheme(mode: ThemeMode, path: string | null | undefined, halloween = false): "light" | "dark" {
  if (isForcedDark(path) || halloweenOn(path, halloween)) return "dark";
  if (isForcedLight(path)) return "light";
  if (mode === "system") return systemPrefersDark() ? "dark" : "light";
  return mode;
}

function applyTheme(resolved: "light" | "dark", halloween = false) {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", resolved);
    document.documentElement.toggleAttribute("data-halloween", halloween);
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // Lazy-init from storage on the client so the first applied value matches the
  // anti-flash script (avoids a system→stored flicker). SSR returns "system".
  const [mode, setModeState] = useState<ThemeMode>(() => readStoredMode());
  const [wantsHalloween, setWantsHalloween] = useState<boolean>(() => readHalloween());
  const [resolved, setResolved] = useState<"light" | "dark">(() =>
    typeof window === "undefined"
      ? "light"
      : resolveTheme(readStoredMode(), window.location.pathname, readHalloween()),
  );
  const halloween = halloweenOn(pathname, wantsHalloween);

  // Re-resolve + apply whenever the mode or the route changes (route matters for
  // the forced-light deliverable pages on client-side navigation).
  useEffect(() => {
    const next = resolveTheme(mode, pathname, wantsHalloween);
    setResolved(next);
    applyTheme(next, halloweenOn(pathname, wantsHalloween));
  }, [mode, pathname, wantsHalloween]);

  // Sync across tabs / components, and follow live OS changes while in `system`.
  useEffect(() => {
    const onModeChanged = () => {
      setModeState(readStoredMode());
      setWantsHalloween(readHalloween());
    };
    window.addEventListener(EVENT, onModeChanged);
    window.addEventListener("storage", onModeChanged);

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChanged = () => {
      if (readStoredMode() === "system") {
        const path = window.location.pathname;
        const next = resolveTheme("system", path, readHalloween());
        setResolved(next);
        applyTheme(next, halloweenOn(path, readHalloween()));
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

  const setHalloween = useCallback((on: boolean) => {
    try {
      window.localStorage.setItem(HALLOWEEN_KEY, on ? "on" : "off");
    } catch {
      /* ignore — still update in-memory + broadcast below */
    }
    setWantsHalloween(on);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        mode,
        resolved,
        // Halloween overrides a forced-light route (the demo), so the theme toggle steps aside.
        forcedLight: isForcedLight(pathname) && !halloween,
        setMode,
        halloween,
        halloweenAvailable: !!pathname && HALLOWEEN_PATHS.test(pathname),
        setHalloween,
      }}
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
