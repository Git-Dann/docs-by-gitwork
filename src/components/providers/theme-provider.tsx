"use client";

import { SEASONAL_CHANGED_EVENT, SEASONAL_KEY, type SeasonalThemeSetting } from "@/lib/seasonal-themes";
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
// Kept in sync with the inline anti-flash script in src/app/layout.tsx.
//
// `/demo` is deliberately NOT here (Nov 2026). It mirrors the app, and the app supports dark,
// so the demo honours the same `gitwork.theme.v1` setting. Forcing it light meant dark mode had
// never been looked at on any surface the demo is used to verify. `?theme=dark|light|system` on a
// /demo page sets that mode (see demoThemeParam), so a headless check can choose one. The one
// exception is /demo/pulse-embed: it shows the scanner embedded in Gitwork's own (light) website,
// and the real /embed is forced light too.
const FORCE_LIGHT = /^\/(docs|report|sign|timeline|brand|guidelines|onboarding|preview|embed|apply|vet|login|portal\/login|demo\/pulse-embed)(?:\/|$)/;

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

/** The seasonal theme in force (an id, or null), copied from the workspace setting into storage. */
function readSeasonalTheme(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(SEASONAL_KEY);
    return v && v !== "off" ? v : null;
  } catch {
    return null;
  }
}

function seasonalOn(path: string | null | undefined, seasonal: string | null, id: string): boolean {
  return seasonal === id && !!path && HALLOWEEN_PATHS.test(path);
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
  /** The Christmas theme is showing on this route (snow; keeps the user's light/dark mode). */
  christmas: boolean;
  /** This route can show it (so the pumpkin toggle is offered). */
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

/**
 * `?theme=dark|light|system` on a /demo page sets the mode, exactly as clicking the switch would
 * (it is stored), so a headless check can render either mode without clicking. The anti-flash
 * script in src/app/layout.tsx does the same before first paint. Demo only: on /app a link must
 * never change someone's saved preference.
 */
export const DEMO_THEME_PATHS = /^\/demo(?:\/|$)/;

export function demoThemeParam(path: string, search: string): ThemeMode | null {
  if (!DEMO_THEME_PATHS.test(path)) return null;
  const v = new URLSearchParams(search).get("theme");
  return v === "light" || v === "dark" || v === "system" ? v : null;
}

function applyDemoThemeParam(): void {
  if (typeof window === "undefined") return;
  const m = demoThemeParam(window.location.pathname, window.location.search);
  if (!m) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, m);
  } catch {
    /* storage blocked — the anti-flash script already painted it for this load */
  }
}

function readStoredMode(): ThemeMode {
  applyDemoThemeParam();
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

function applyTheme(resolved: "light" | "dark", halloween = false, christmas = false) {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", resolved);
    document.documentElement.toggleAttribute("data-halloween", halloween);
    document.documentElement.toggleAttribute("data-christmas", christmas);
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // Lazy-init from storage on the client so the first applied value matches the
  // anti-flash script (avoids a system→stored flicker). SSR returns "system".
  const [mode, setModeState] = useState<ThemeMode>(() => readStoredMode());
  const [seasonal, setSeasonal] = useState<string | null>(() => readSeasonalTheme());
  const wantsHalloween = seasonal === "halloween";
  const [resolved, setResolved] = useState<"light" | "dark">(() =>
    typeof window === "undefined"
      ? "light"
      : resolveTheme(readStoredMode(), window.location.pathname, readSeasonalTheme() === "halloween"),
  );
  const halloween = halloweenOn(pathname, wantsHalloween);
  const christmas = seasonalOn(pathname, seasonal, "christmas");

  // Re-resolve + apply whenever the mode or the route changes (route matters for
  // the forced-light deliverable pages on client-side navigation).
  useEffect(() => {
    const next = resolveTheme(mode, pathname, wantsHalloween);
    setResolved(next);
    applyTheme(next, halloweenOn(pathname, wantsHalloween), seasonalOn(pathname, seasonal, "christmas"));
  }, [mode, pathname, wantsHalloween, seasonal]);

  // Sync across tabs / components, and follow live OS changes while in `system`.
  useEffect(() => {
    const onModeChanged = () => {
      setModeState(readStoredMode());
      setSeasonal(readSeasonalTheme());
    };
    window.addEventListener(EVENT, onModeChanged);
    window.addEventListener("storage", onModeChanged);

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChanged = () => {
      if (readStoredMode() === "system") {
        const path = window.location.pathname;
        const st = readSeasonalTheme();
        const next = resolveTheme("system", path, st === "halloween");
        setResolved(next);
        applyTheme(next, halloweenOn(path, st === "halloween"), seasonalOn(path, st, "christmas"));
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

  // The seasonal theme is a WORKSPACE setting (Settings → Appearance). Read it on the app
  // (never on the demo, which has no session) and copy it into storage, so the anti-flash
  // script paints it on the next load before React runs.
  const onApp = !!pathname && /^\/app(?:\/|$)/.test(pathname);
  useEffect(() => {
    if (!onApp) return;
    let cancelled = false;
    const load = () => {
      fetch("/api/settings/seasonal-theme", { credentials: "same-origin" })
        .then((r) => (r.ok ? r.json() : null))
        .then((body: { data?: SeasonalThemeSetting } | SeasonalThemeSetting | null) => {
          if (cancelled || !body) return;
          const setting = ("data" in body ? body.data : body) as SeasonalThemeSetting | undefined;
          if (!setting || typeof setting.enabled !== "boolean") return;
          try {
            window.localStorage.setItem(SEASONAL_KEY, setting.active ?? "off");
          } catch {
            /* storage blocked — still applies for this page */
          }
          setSeasonal(setting.active);
        })
        .catch(() => {
          /* keep what's stored: a failed read must not flip the theme */
        });
    };
    load();
    window.addEventListener(SEASONAL_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(SEASONAL_CHANGED_EVENT, load);
    };
  }, [onApp]);

  return (
    <ThemeContext.Provider
      value={{
        mode,
        resolved,
        // Halloween overrides a forced-light route (the demo), so the theme toggle steps aside.
        forcedLight: isForcedLight(pathname) && !halloween,
        setMode,
        halloween,
        christmas,
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
