"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/format";
import {
  focusedId,
  initialOsState,
  osReducer,
  parseSavedState,
  type OsApp,
  type OsWindowProps,
  type Viewport,
} from "@/lib/demo/os/window-manager";
import type { TerminalEffect } from "@/lib/demo/os/terminal";
import { AppIcon, DOCK_APPS, GitworkMark, appMeta } from "./os-apps";
import {
  AboutView,
  CalendarView,
  FinderView,
  FoundryView,
  MailView,
  NotesView,
  ServicesView,
  SettingsView,
  TerminalView,
  TrashView,
  type Appearance,
  type EggName,
  type OsBridge,
} from "./os-app-views";
import { Clock, DesktopIcons, Dock, FileIcon, MenuBar, Notch, Spotlight, StatusIcon, Toasts, type DesktopItem, type Menu, type Toast } from "./os-chrome";
import { BootScreen, Confetti, ForceQuit, LockScreen, MatrixRain, VibeCheck, konamiStep } from "./os-eggs";
import { OsWindowFrame } from "./os-window";
import { Wallpaper, wallpaperById, type WallpaperId } from "./os-wallpaper";

const LAYOUT_KEY = "gitwork.os.layout.v1";
const PREFS_KEY = "gitwork.os.prefs.v1";
/** Below this the desktop becomes a phone/tablet layout: full-screen sheets, no dragging. */
const COMPACT_BELOW = 1024;

/** The `--os-*` palette for a Mac's light and dark appearance. */
const APPEARANCE: Record<Appearance, CSSProperties> = {
  dark: {
    "--os-win": "#1E1E22",
    "--os-titlebar": "#2A2A2F",
    "--os-sidebar": "rgba(255,255,255,0.04)",
    "--os-paper": "#1A1A1E",
    "--os-control": "rgba(255,255,255,0.06)",
    "--os-hover": "rgba(255,255,255,0.08)",
    "--os-select": "rgba(255,255,255,0.12)",
    "--os-border": "rgba(255,255,255,0.08)",
    "--os-border-strong": "rgba(255,255,255,0.16)",
    "--os-text": "#F4F4F5",
    "--os-text-2": "rgba(244,244,245,0.72)",
    "--os-text-3": "rgba(244,244,245,0.5)",
    "--os-light-off": "#4B4B52",
    colorScheme: "dark",
  } as CSSProperties,
  light: {
    "--os-win": "#FFFFFF",
    "--os-titlebar": "#F2F2F4",
    "--os-sidebar": "rgba(0,0,0,0.035)",
    "--os-paper": "#FFFFFF",
    "--os-control": "rgba(0,0,0,0.03)",
    "--os-hover": "rgba(0,0,0,0.05)",
    "--os-select": "rgba(0,0,0,0.08)",
    "--os-border": "rgba(0,0,0,0.08)",
    "--os-border-strong": "rgba(0,0,0,0.14)",
    "--os-text": "#18181B",
    "--os-text-2": "rgba(24,24,27,0.72)",
    "--os-text-3": "rgba(24,24,27,0.52)",
    "--os-light-off": "#D4D4D8",
    colorScheme: "light",
  } as CSSProperties,
};

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private window: in-memory only */
  }
}

function useViewport(): Viewport {
  const [vp, setVp] = useState<Viewport>({ width: 1440, height: 900 });
  useEffect(() => {
    const read = () => setVp({ width: window.innerWidth, height: window.innerHeight });
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);
  return vp;
}

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/**
 * Gitwork OS — `/demo/os`. A Mac in the browser that sells Gitwork: the work, the
 * plans and Foundry (the hero app), with the site's own copy. Everything is local:
 * Foundry's windows show the public `/demo` pages over sample data, so nothing here
 * reaches a real client, a login or the database.
 */
export function GitworkOs() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Dates, localStorage and the viewport only exist in the browser, so the desktop
  // renders after mount rather than risking a server/client mismatch.
  if (!mounted) return <div className="fixed inset-0 bg-black" />;
  return <Desktop />;
}

function Desktop() {
  const vp = useViewport();
  const now = useNow();
  const compact = vp.width < COMPACT_BELOW;

  const [state, dispatch] = useReducer(osReducer, initialOsState, () =>
    parseSavedState(typeof window === "undefined" ? null : window.localStorage.getItem(LAYOUT_KEY), {
      width: window.innerWidth,
      height: window.innerHeight,
    }),
  );
  const prefs = useMemo(() => readJson<{ appearance?: Appearance; wallpaper?: WallpaperId }>(PREFS_KEY) ?? {}, []);
  const [appearance, setAppearance] = useState<Appearance>(prefs.appearance === "light" ? "light" : "dark");
  const [wallpaper, setWallpaper] = useState<WallpaperId>(prefs.wallpaper ?? "indigo");
  const [dragging, setDragging] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [bouncing, setBouncing] = useState<OsApp | null>(null);
  const [spotlight, setSpotlight] = useState(false);
  const [egg, setEgg] = useState<EggName | null>(null);
  const [confetti, setConfetti] = useState(0);
  const [party, setParty] = useState(false);
  const [showSeconds, setShowSeconds] = useState(false);
  const [percent, setPercent] = useState(67);
  const logoClicks = useRef<number[]>([]);
  const toastId = useRef(0);
  const konami = useRef(0);

  // Persist the layout and preferences.
  useEffect(() => writeJson(LAYOUT_KEY, { windows: state.windows }), [state.windows]);
  useEffect(() => writeJson(PREFS_KEY, { appearance, wallpaper }), [appearance, wallpaper]);
  // Keep every title bar reachable when the browser window shrinks.
  useEffect(() => dispatch({ type: "fit", viewport: vp }), [vp]);

  const notify = useCallback((t: Omit<Toast, "id">) => {
    const id = ++toastId.current;
    setToasts((list) => [...list.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), 9000);
  }, []);

  const open = useCallback(
    (app: OsApp, props?: OsWindowProps) => {
      const already = state.windows.some((w) => w.app === app);
      if (!already) {
        setBouncing(app);
        setTimeout(() => setBouncing((b) => (b === app ? null : b)), 1100);
      }
      dispatch({ type: "open", app, title: appMeta(app).title, props, viewport: vp });
    },
    [state.windows, vp],
  );

  const fireConfetti = useCallback(() => {
    setConfetti(Date.now());
    setTimeout(() => setConfetti(0), 3400);
  }, []);

  const runEgg = useCallback(
    (name: EggName) => {
      if (name === "confetti") fireConfetti();
      else setEgg(name);
    },
    [fireConfetti],
  );

  // First-run notifications, the way vorssaint.com greets you.
  useEffect(() => {
    const a = setTimeout(
      () =>
        notify({
          title: "Gitwork is running",
          body: "This Mac is a live demo. Open Foundry to see how we run your project, start to finish.",
          action: { label: "Open Foundry", app: "foundry" },
        }),
      900,
    );
    const b = setTimeout(
      () =>
        notify({
          title: "Got something half-built?",
          body: "A free 30-minute audit with a real engineer. No slide deck, no sales pitch.",
          action: { label: "Book", app: "calendar" },
        }),
      14000,
    );
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [notify]);

  // The live activity ticks from 67% (the site's figure) to shipped.
  useEffect(() => {
    if (percent >= 100) return;
    const t = setTimeout(() => setPercent((p) => Math.min(100, p + (p < 83 ? 16 : 17))), 22000);
    return () => clearTimeout(t);
  }, [percent]);
  useEffect(() => {
    if (percent === 100) {
      fireConfetti();
      notify({ title: "Shipped", body: "The last 20% is done. Ready for production.", action: { label: "See it", app: "foundry" } });
    }
  }, [percent, fireConfetti, notify]);

  // Keyboard: ⌘K / Ctrl+K for Spotlight, the Konami code for the Matrix.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSpotlight((s) => !s);
        return;
      }
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, [contenteditable]")) return;
      konami.current = konamiStep(konami.current, e.key);
      if (konami.current === 10) {
        konami.current = 0;
        setEgg("matrix");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const focused = focusedId(state);
  const focusedWin = state.windows.find((w) => w.id === focused) ?? null;
  const activeApp: OsApp | null = focusedWin?.app ?? null;
  const activeLabel = activeApp ? appMeta(activeApp).label : "Finder";

  function onLogoClick() {
    // Five quick clicks on the mark: party mode.
    const t = Date.now();
    logoClicks.current = [...logoClicks.current.filter((x) => t - x < 1600), t];
    if (logoClicks.current.length >= 5) {
      logoClicks.current = [];
      setParty(true);
      fireConfetti();
      notify({ title: "You found party mode", body: "Shipping is worth celebrating. It wears off in ten seconds." });
      setTimeout(() => setParty(false), 10000);
    }
  }

  function closeFocused() {
    if (focused) dispatch({ type: "close", id: focused });
  }

  const menus: Menu[] = [
    {
      id: "logo",
      name: "Gitwork menu",
      label: <GitworkMark size={16} />,
      items: [
        { label: "About This Mac", onSelect: () => open("about") },
        "sep",
        { label: "System Settings…", onSelect: () => open("settings") },
        { label: "Spotlight Search", shortcut: "⌘K", onSelect: () => setSpotlight(true) },
        "sep",
        { label: "Run a Vibe Check…", onSelect: () => setEgg("vibe") },
        { label: "Ship It", onSelect: () => fireConfetti() },
        { label: "Force Quit…", shortcut: "⌥⌘⎋", onSelect: () => setEgg("forcequit") },
        "sep",
        { label: "Sleep", onSelect: () => setEgg("sleep") },
        { label: "Restart…", onSelect: () => setEgg("restart") },
        {
          label: "Shut Down…",
          onSelect: () =>
            notify({ title: "Not before launch", body: "Nobody shuts down with payments half-built. Book an audit instead.", action: { label: "Book", app: "calendar" } }),
        },
        "sep",
        { label: "Lock Screen", shortcut: "⌃⌘Q", onSelect: () => setEgg("sleep") },
        { label: "Log Out of the Demo…", onSelect: () => (window.location.href = "/demo") },
      ],
    },
    {
      id: "app",
      name: `${activeLabel} menu`,
      label: activeLabel,
      bold: true,
      items: [
        { label: `About ${activeLabel}`, onSelect: () => open(activeApp === "foundry" ? "foundry" : "about") },
        "sep",
        { label: `Hide ${activeLabel}`, shortcut: "⌘H", disabled: !focused, onSelect: () => focused && dispatch({ type: "minimise", id: focused }) },
        { label: `Quit ${activeLabel}`, shortcut: "⌘Q", disabled: !focused, onSelect: closeFocused },
      ],
    },
    {
      id: "file",
      name: "File menu",
      label: "File",
      desktopOnly: true,
      items: [
        { label: "New Message", shortcut: "⌘N", onSelect: () => open("mail") },
        { label: "Book a Free Audit", onSelect: () => open("calendar") },
        "sep",
        { label: "Close Window", shortcut: "⌘W", disabled: !focused, onSelect: closeFocused },
      ],
    },
    {
      id: "view",
      name: "View menu",
      label: "View",
      desktopOnly: true,
      items: [
        { label: "Enter Full Screen", shortcut: "⌃⌘F", disabled: !focused, onSelect: () => focused && dispatch({ type: "toggleMaximise", id: focused }) },
        "sep",
        { label: "Dark Appearance", checked: appearance === "dark", onSelect: () => setAppearance("dark") },
        { label: "Light Appearance", checked: appearance === "light", onSelect: () => setAppearance("light") },
        { label: "Show Seconds in Clock", checked: showSeconds, onSelect: () => setShowSeconds((s) => !s) },
      ],
    },
    {
      id: "go",
      name: "Go menu",
      label: "Go",
      desktopOnly: true,
      items: [
        { label: "Work", shortcut: "⇧⌘W", onSelect: () => open("finder") },
        { label: "Plans & Pricing", onSelect: () => open("services") },
        { label: "Foundry", shortcut: "⇧⌘F", onSelect: () => open("foundry") },
        "sep",
        { label: "How We Work", onSelect: () => open("notes", { item: "process" }) },
        { label: "Honest Answers", onSelect: () => open("notes", { item: "faq" }) },
        { label: "What Clients Say", onSelect: () => open("notes", { item: "clients" }) },
        "sep",
        { label: "gitwork.co.uk ↗", onSelect: () => window.open("https://gitwork.co.uk", "_blank", "noopener") },
      ],
    },
    {
      id: "window",
      name: "Window menu",
      label: "Window",
      desktopOnly: true,
      items: [
        { label: "Minimise", shortcut: "⌘M", disabled: !focused, onSelect: () => focused && dispatch({ type: "minimise", id: focused }) },
        { label: "Zoom", disabled: !focused, onSelect: () => focused && dispatch({ type: "toggleMaximise", id: focused }) },
        "sep",
        ...(state.windows.length
          ? state.windows.map((w) => ({ label: w.title, checked: w.id === focused, onSelect: () => dispatch({ type: "focus", id: w.id }) }))
          : [{ label: "No windows", disabled: true }]),
        "sep",
        { label: "Close All", disabled: !state.windows.length, onSelect: () => dispatch({ type: "closeAll" }) },
      ],
    },
    {
      id: "help",
      name: "Help menu",
      label: "Help",
      desktopOnly: true,
      items: [
        { label: "Gitwork OS Help", onSelect: () => open("notes", { item: "welcome" }) },
        { label: "Honest Answers", onSelect: () => open("notes", { item: "faq" }) },
        { label: "Talk to a Human", onSelect: () => open("mail") },
      ],
    },
  ];

  const desktopItems: DesktopItem[] = [
    { id: "foundry", label: "Foundry", app: "foundry", icon: <AppIcon app="foundry" size={56} /> },
    { id: "audit", label: "Book a free audit", app: "calendar", icon: <AppIcon app="calendar" size={56} /> },
    { id: "work", label: "Case studies", app: "finder", icon: <AppIcon app="finder" size={56} /> },
    { id: "plans", label: "Plans.pdf", app: "services", icon: <FileIcon ext="pdf" tint="#DC2626" /> },
    { id: "readme", label: "README.md", app: "notes", props: { item: "welcome" }, icon: <FileIcon ext="md" /> },
  ];

  const bridgeFor = (id: string): OsBridge => ({
    open,
    closeSelf: () => dispatch({ type: "close", id }),
    appearance,
    setAppearance,
    wallpaper,
    setWallpaper,
    resetDesktop: () => dispatch({ type: "closeAll" }),
    egg: runEgg,
    notify: (t) => notify({ title: t.title, body: t.body, action: t.action }),
  });

  function onTerminalEffect(id: string, e: TerminalEffect) {
    if (e.type === "open") open(e.app, e.href ? { href: e.href } : undefined);
    else if (e.type === "exit") dispatch({ type: "close", id });
    else runEgg(e.name);
  }

  function renderApp(id: string, app: OsApp, props: OsWindowProps): ReactNode {
    const bridge = bridgeFor(id);
    switch (app) {
      case "finder":
        return <FinderView props={props} bridge={bridge} />;
      case "foundry":
        return <FoundryView props={props} bridge={bridge} />;
      case "services":
        return <ServicesView bridge={bridge} />;
      case "notes":
        return <NotesView key={props.item ?? "welcome"} bridge={bridge} initial={props.item} />;
      case "terminal":
        return <TerminalView onEffect={(e) => onTerminalEffect(id, e)} />;
      case "mail":
        return <MailView bridge={bridge} />;
      case "calendar":
        return <CalendarView />;
      case "settings":
        return <SettingsView bridge={bridge} />;
      case "trash":
        return <TrashView bridge={bridge} />;
      case "about":
        return <AboutView bridge={bridge} />;
    }
  }

  const running = new Set(state.windows.map((w) => w.app));
  const wp = wallpaperById(wallpaper);
  // On a phone only the front window is drawn; the others stay mounted but hidden,
  // so an iframe keeps its place when you switch back.
  const visibleIds = compact ? new Set(focused ? [focused] : []) : new Set(state.windows.filter((w) => !w.minimised).map((w) => w.id));

  return (
    <div
      className={cn("fixed inset-0 select-none overflow-hidden", dragging && "[&_iframe]:pointer-events-none")}
      style={{
        ...APPEARANCE[appearance],
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter Variable", Inter, system-ui, sans-serif',
        WebkitFontSmoothing: "antialiased",
      }}
    >
      <Wallpaper id={wallpaper} party={party} />

      <DesktopIcons items={desktopItems} compact={compact} onOpen={(it) => open(it.app, it.props)} />

      <div className="absolute inset-0 z-[2] [&>*]:select-text" style={{ pointerEvents: "none" }}>
        {state.windows.map((w) => (
          <div key={w.id} hidden={!visibleIds.has(w.id)} style={{ pointerEvents: "auto" }}>
            <OsWindowFrame
              win={w}
              focused={w.id === focused}
              compact={compact}
              onFocus={() => dispatch({ type: "focus", id: w.id })}
              onClose={() => dispatch({ type: "close", id: w.id })}
              onMinimise={() => dispatch({ type: "minimise", id: w.id })}
              onToggleMaximise={() => dispatch({ type: "toggleMaximise", id: w.id })}
              onMove={(x, y) => dispatch({ type: "move", id: w.id, x, y, viewport: vp })}
              onResize={(width, height) => dispatch({ type: "resize", id: w.id, w: width, h: height, viewport: vp })}
              onDragState={setDragging}
            >
              {renderApp(w.id, w.app, w.props)}
            </OsWindowFrame>
          </div>
        ))}
      </div>

      <MenuBar
        dark={wp.dark}
        menus={menus}
        onLogoClick={onLogoClick}
        notch={<Notch percent={percent} onOpenFoundry={() => open("foundry", { href: "/demo/wiki" })} />}
        right={
          <>
            <span className="hidden lg:contents">
              <StatusIcon label="Foundry" onClick={() => open("foundry")}>
                <span className="font-[family-name:var(--font-display)] text-[15px] leading-none">F</span>
              </StatusIcon>
              <StatusIcon label="Wi-Fi: Gitwork-5G">
                <svg viewBox="0 0 20 16" className="h-3.5 w-4" fill="currentColor">
                  <path d="M10 13.5a1.6 1.6 0 1 0 0 .01zM4.7 9.3a7.5 7.5 0 0 1 10.6 0l-1.4 1.4a5.5 5.5 0 0 0-7.8 0zM1.6 6.2a12 12 0 0 1 16.8 0L17 7.6a10 10 0 0 0-14 0z" />
                </svg>
              </StatusIcon>
              <StatusIcon label="Battery: 100%, shipping">
                <svg viewBox="0 0 28 14" className="h-3.5 w-6" fill="none" stroke="currentColor">
                  <rect x="1" y="1" width="23" height="12" rx="3" opacity="0.5" />
                  <rect x="3" y="3" width="19" height="8" rx="1.5" fill="currentColor" stroke="none" />
                  <path d="M26 5v4" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
                </svg>
              </StatusIcon>
            </span>
            <StatusIcon label="Spotlight Search" onClick={() => setSpotlight(true)}>
              <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="8.5" cy="8.5" r="5.5" />
                <path d="M13 13l4 4" strokeLinecap="round" />
              </svg>
            </StatusIcon>
            <StatusIcon label="Date and time (click for seconds)" onClick={() => setShowSeconds((s) => !s)}>
              <Clock now={now} showSeconds={showSeconds} />
            </StatusIcon>
          </>
        }
      />

      <Dock
        dark={wp.dark}
        compact={compact}
        running={running}
        bouncing={bouncing}
        onActivate={(app) => {
          if (!state.windows.some((w) => w.app === app)) {
            setBouncing(app);
            setTimeout(() => setBouncing((b) => (b === app ? null : b)), 1100);
          }
          dispatch({ type: "dock", app, title: appMeta(app).title, viewport: vp });
        }}
      />

      <Toasts
        toasts={toasts}
        dark={wp.dark}
        onDismiss={(id) => setToasts((l) => l.filter((t) => t.id !== id))}
        onAction={(t) => {
          setToasts((l) => l.filter((x) => x.id !== t.id));
          if (t.action) open(t.action.app, t.action.props);
        }}
      />

      <Spotlight
        open={spotlight}
        onClose={() => setSpotlight(false)}
        onPick={(r) => {
          setSpotlight(false);
          open(r.app, r.props);
        }}
      />

      {confetti ? <Confetti seed={confetti} /> : null}
      {egg === "vibe" ? (
        <VibeCheck
          onClose={() => setEgg(null)}
          onShipped={() => {
            fireConfetti();
            setPercent(100);
          }}
        />
      ) : null}
      {egg === "forcequit" ? (
        <ForceQuit
          onClose={() => setEgg(null)}
          onQuit={(name) => notify({ title: "Force quit", body: `${name} quit unexpectedly. It won't be back.` })}
        />
      ) : null}
      {egg === "matrix" ? <MatrixRain onDone={() => setEgg(null)} /> : null}
      {egg === "sleep" ? <LockScreen now={now} wallpaper={wp.css} onWake={() => setEgg(null)} /> : null}
      {egg === "restart" ? (
        <BootScreen
          onDone={() => {
            setEgg(null);
            notify({ title: "Welcome back", body: "Restarted. Your windows are where you left them." });
          }}
        />
      ) : null}

      {/* Dock shortcut list for screen readers and keyboard users. */}
      <p className="sr-only">
        Gitwork OS demo. Apps: {DOCK_APPS.map((a) => a.label).join(", ")}. Press Command K to search.
      </p>
    </div>
  );
}
