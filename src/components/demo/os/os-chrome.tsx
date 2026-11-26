"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/format";
import type { OsApp, OsWindowProps } from "@/lib/demo/os/window-manager";
import { CASE_STUDIES, FAQ, FOUNDRY_PAGES, LAST_20, PLANS } from "@/lib/demo/os/gitwork-content";
import { SECRETS, SECRET_COUNT, nextHint, type SecretId } from "@/lib/demo/os/secrets";
import { AppIcon, DOCK_APPS, GitworkMark, TRASH, appMeta } from "./os-apps";
import { MedalArt } from "./os-art";

/* Menu bar ────────────────────────────────────────────────────────────────── */

export interface MenuItem {
  label: string;
  shortcut?: string;
  onSelect?: () => void;
  checked?: boolean;
  disabled?: boolean;
}
export type MenuEntry = MenuItem | "sep";
export interface Menu {
  id: string;
  label: ReactNode;
  /** Accessible name when the label is a glyph. */
  name: string;
  bold?: boolean;
  items: MenuEntry[];
  /** Hidden below lg, where there isn't room for a full menu bar. */
  desktopOnly?: boolean;
}

/**
 * The menu bar. Behaves like a Mac's: click a title to open it, then hover across to
 * move between menus; arrow keys walk the items and the menus; Escape closes.
 */
export function MenuBar({
  menus,
  onLogoClick,
  right,
  notch,
  dark,
}: {
  menus: Menu[];
  onLogoClick: () => void;
  right: ReactNode;
  notch: ReactNode;
  dark: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [viaKeyboard, setViaKeyboard] = useState(false);
  const bar = useRef<HTMLDivElement>(null);
  const titles = useRef(new Map<string, HTMLButtonElement>());
  const visible = menus.filter((m) => !m.desktopOnly || (typeof window !== "undefined" && window.innerWidth >= 1024));

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!bar.current?.contains(e.target as Node)) setOpen(null);
    }
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  function step(dir: 1 | -1) {
    const i = visible.findIndex((m) => m.id === open);
    const next = visible[(i + dir + visible.length) % visible.length];
    setViaKeyboard(true);
    setOpen(next.id);
    titles.current.get(next.id)?.focus();
  }

  return (
    <div
      ref={bar}
      role="menubar"
      className={cn(
        "absolute inset-x-0 top-0 z-[9000] flex h-7 items-center px-2 text-[13px] backdrop-blur-2xl backdrop-saturate-150",
        dark ? "bg-black/30 text-white" : "bg-white/40 text-black",
      )}
    >
      <div className="flex min-w-0 items-center">
        {menus.map((m, i) => (
          <div key={m.id} className={cn("relative", m.desktopOnly && "hidden lg:block")}>
            <button
              ref={(el) => {
                if (el) titles.current.set(m.id, el);
              }}
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={open === m.id}
              aria-label={m.name}
              onClick={(e) => {
                if (i === 0) onLogoClick();
                setViaKeyboard(e.detail === 0);
                setOpen(open === m.id ? null : m.id);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setViaKeyboard(true);
                  setOpen(m.id);
                }
              }}
              onPointerEnter={() => open && open !== m.id && (setViaKeyboard(false), setOpen(m.id))}
              className={cn(
                "flex h-[22px] items-center rounded-[5px] px-2.5 outline-none transition-colors duration-75 focus-visible:ring-1 focus-visible:ring-white/60",
                m.bold && "font-bold",
                open === m.id && (dark ? "bg-white/20" : "bg-black/10"),
              )}
            >
              {m.label}
            </button>
            {open === m.id ? (
              <MenuPanel
                items={m.items}
                dark={dark}
                autoFocus={viaKeyboard}
                onClose={(refocus) => {
                  setOpen(null);
                  if (refocus) titles.current.get(m.id)?.focus();
                }}
                onStep={step}
              />
            ) : null}
          </div>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 hidden justify-center sm:flex">{notch}</div>
      <div className="ml-auto flex items-center gap-0.5">{right}</div>
    </div>
  );
}

function MenuPanel({
  items,
  dark,
  autoFocus,
  onClose,
  onStep,
}: {
  items: MenuEntry[];
  dark: boolean;
  autoFocus: boolean;
  onClose: (refocus: boolean) => void;
  onStep: (dir: 1 | -1) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const enabled = () => [...(panel.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];

  useEffect(() => {
    if (autoFocus) enabled()[0]?.focus();
  }, [autoFocus]);

  function onKey(e: ReactKeyboardEvent) {
    const list = enabled();
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      list[(i + 1) % list.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      list[(i - 1 + list.length) % list.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      list[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      list[list.length - 1]?.focus();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      onStep(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      onStep(-1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose(true);
    }
  }

  return (
    <div
      ref={panel}
      role="menu"
      onKeyDown={onKey}
      className={cn(
        "os-menu absolute left-0 top-[26px] z-[9100] min-w-[240px] rounded-[9px] p-[5px] shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-2xl",
        dark
          ? "border border-white/12 bg-[rgba(40,40,46,0.94)] text-white"
          : "border border-black/10 bg-[rgba(246,246,248,0.95)] text-black",
      )}
    >
      {items.map((it, i) =>
        it === "sep" ? (
          <div key={`sep-${i}`} role="separator" className={cn("mx-2 my-[5px] h-px", dark ? "bg-white/12" : "bg-black/10")} />
        ) : (
          <button
            key={it.label}
            type="button"
            role="menuitem"
            disabled={it.disabled}
            onClick={() => {
              onClose(false);
              it.onSelect?.();
            }}
            onPointerEnter={(e) => e.currentTarget.focus({ preventScroll: true })}
            className={cn(
              "flex w-full items-center gap-2 rounded-[5px] py-[3px] pl-6 pr-2.5 text-left text-[13px] outline-none disabled:opacity-40",
              "focus:bg-[#4F46E5] focus:text-white",
            )}
          >
            <span className="-ml-4 w-3 text-[11px]">{it.checked ? "✓" : ""}</span>
            <span className="flex-1">{it.label}</span>
            {it.shortcut ? <span className="text-[12px] opacity-50">{it.shortcut}</span> : null}
          </button>
        ),
      )}
      <style>{`
        .os-menu { animation: os-menu .14s ease-out; transform-origin: top left; }
        @keyframes os-menu { from { opacity: 0; transform: translateY(-3px) } }
        @media (prefers-reduced-motion: reduce) { .os-menu { animation: none } }
      `}</style>
    </div>
  );
}

const NOTCH_IDLE_MS = 5000;

/* Notch — a live activity, the "last 20%" card from the website ───────────── */

export function Notch({ percent, onOpenFoundry }: { percent: number; onOpenFoundry: () => void }) {
  const [open, setOpen] = useState(false);
  const shipped = percent >= 100;
  const done = Math.round((percent / 100) * LAST_20.length);
  const ref = useRef<HTMLDivElement>(null);
  const idle = useRef<number | undefined>(undefined);
  // Like a live activity: a click anywhere else, Escape, or a few seconds left alone
  // tucks it back up. Hovering it keeps it open while someone is reading.
  const armIdle = useCallback(() => {
    window.clearTimeout(idle.current);
    idle.current = window.setTimeout(() => setOpen(false), NOTCH_IDLE_MS);
  }, []);
  useEffect(() => {
    if (!open) return;
    armIdle();
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(idle.current);
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, armIdle]);
  return (
    <div
      ref={ref}
      className="pointer-events-auto relative"
      onPointerEnter={() => open && window.clearTimeout(idle.current)}
      onPointerLeave={() => open && armIdle()}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-label={shipped ? "Live activity: shipped" : "Live activity: the last 20%"}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center justify-between overflow-hidden bg-black text-white outline-none transition-all duration-500 [transition-timing-function:cubic-bezier(0.2,0.9,0.2,1.15)]",
          open ? "h-[178px] w-[380px] max-w-[92vw] rounded-b-[28px] px-5" : "h-[30px] w-[230px] rounded-b-[14px] px-3",
          shipped ? "os-notch-shipped" : "shadow-[0_6px_20px_rgba(0,0,0,0.35)]",
        )}
      >
        {open ? (
          <span className="flex h-full w-full flex-col justify-center gap-2 py-3 text-left">
            <span className="flex items-center justify-between">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#A5B4FC]">The last 20%</span>
              <span className="font-[family-name:var(--font-mono)] text-[11px] text-white/60">{percent}% shipped</span>
            </span>
            <span className="block h-1 overflow-hidden rounded-full bg-white/15">
              <span
                className={cn("block h-full rounded-full transition-all duration-700", shipped ? "bg-[#34D399]" : "bg-[#818CF8]")}
                style={{ width: `${percent}%` }}
              />
            </span>
            <span className="grid grid-cols-2 gap-x-4 gap-y-1">
              {LAST_20.map((item, i) => (
                <span key={item.label} className="flex items-center gap-1.5 text-[11.5px]">
                  <span
                    className={cn(
                      "flex h-3 w-3 items-center justify-center rounded-[3px] text-[8px] transition-colors",
                      i < done ? "bg-[#6366F1] text-white" : "border border-white/40",
                    )}
                  >
                    {i < done ? "✓" : ""}
                  </span>
                  <span className={i < done ? "text-white" : "text-white/50"}>{item.label}</span>
                </span>
              ))}
            </span>
            <span
              role="link"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                onOpenFoundry();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.stopPropagation();
                  setOpen(false);
                  onOpenFoundry();
                }
              }}
              className="self-start text-[11.5px] font-medium text-[#A5B4FC] underline-offset-2 hover:underline"
            >
              {shipped ? "Ready for production. See it in Foundry →" : "Watch it in Foundry →"}
            </span>
          </span>
        ) : (
          <>
            <AppIcon app="foundry" size={18} />
            {shipped ? (
              <span className="os-notch-label flex items-center gap-1.5 text-[11.5px] font-semibold text-[#6EE7B7]">
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 8.5l3.2 3L13 4.5" />
                </svg>
                Shipped
              </span>
            ) : (
              <span className="flex items-center gap-1.5 font-[family-name:var(--font-mono)] text-[11px]">
                <span className="text-white/70">{percent}%</span>
                <Bars />
              </span>
            )}
          </>
        )}
      </button>
      <style>{`
        .os-notch-shipped { animation: os-glow 2.4s ease-in-out 3; box-shadow: 0 6px 20px rgba(0,0,0,.35); }
        @keyframes os-glow { 50% { box-shadow: 0 6px 28px rgba(52,211,153,.55), 0 0 0 1px rgba(52,211,153,.5) } }
        .os-notch-label { animation: os-pop-in .5s cubic-bezier(.2,1.4,.4,1) both; }
        @keyframes os-pop-in { from { opacity: 0; transform: scale(.6) } }
        @media (prefers-reduced-motion: reduce) { .os-notch-shipped, .os-notch-label { animation: none } }
      `}</style>
    </div>
  );
}

function Bars() {
  return (
    <span aria-hidden className="flex h-3 items-center gap-[2px]">
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className="os-bar w-[2px] rounded-full bg-[#818CF8]" style={{ animationDelay: `${i * 0.12}s` }} />
      ))}
      <style>{`
        .os-bar { height: 40%; animation: os-bar 0.9s ease-in-out infinite alternate; }
        @keyframes os-bar { to { height: 100%; } }
        @media (prefers-reduced-motion: reduce) { .os-bar { animation: none; height: 70%; } }
      `}</style>
    </span>
  );
}

/* Status items on the right of the menu bar ───────────────────────────────── */

export function StatusIcon({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick?: () => void;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex h-[22px] items-center rounded-[5px] px-2 outline-none hover:bg-white/15 focus-visible:ring-1 focus-visible:ring-white/60",
        active && "bg-white/20",
      )}
    >
      {children}
    </button>
  );
}

export function Clock({ now, showSeconds }: { now: Date; showSeconds: boolean }) {
  const day = now.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: showSeconds ? "2-digit" : undefined });
  return (
    <span className="whitespace-nowrap tabular-nums">
      <span className="hidden sm:inline">{day}&nbsp;&nbsp;</span>
      {time}
    </span>
  );
}

export function SpeakerGlyph({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 20 16" className="h-3.5 w-4" fill="currentColor">
      <path d="M2 5.5h3l4-3.5v12l-4-3.5H2z" />
      {on ? (
        <path d="M12 5a4 4 0 0 1 0 6M14 3a7 7 0 0 1 0 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      ) : (
        <path d="M12.5 5.5l5 5M17.5 5.5l-5 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      )}
    </svg>
  );
}

export function DiscoGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="os-disco h-3.5 w-3.5">
      <line x1="8" y1="0" x2="8" y2="3" stroke="currentColor" />
      <circle cx="8" cy="9.5" r="6" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2.5 9.5h11M8 3.5v12M4 6.5c2.5 1.2 5.5 1.2 8 0M4 12.5c2.5-1.2 5.5-1.2 8 0" fill="none" stroke="currentColor" strokeWidth="0.8" />
      <style>{`.os-disco { animation: os-disco 2s linear infinite; } @keyframes os-disco { 50% { color: #F472B6 } }`}</style>
    </svg>
  );
}

/* Dock ────────────────────────────────────────────────────────────────────── */

/**
 * The dock is a shelf of fixed height. Magnified icons grow UP and out of it, as on a
 * Mac, instead of making the shelf taller around them.
 */
export function Dock({
  running,
  bouncing,
  compact,
  dark,
  party,
  onActivate,
}: {
  running: Set<OsApp>;
  bouncing: OsApp | null;
  compact: boolean;
  dark: boolean;
  party: boolean;
  onActivate: (app: OsApp) => void;
}) {
  const [mouseX, setMouseX] = useState<number | null>(null);
  const refs = useRef(new Map<OsApp, HTMLButtonElement>());
  // Nine icons have to fit a 390px phone without scrolling.
  const base = compact ? 34 : 50;
  const pad = 6;
  const shelf = base + pad * 2 + 6; // + room for the running dot

  function scaleFor(app: OsApp): number {
    if (compact || mouseX === null) return 1;
    const el = refs.current.get(app);
    if (!el) return 1;
    const r = el.getBoundingClientRect();
    const d = Math.abs(mouseX - (r.left + r.width / 2));
    // Gaussian falloff, peak 1.6x, the macOS magnification curve.
    return 1 + 0.6 * Math.exp(-(d * d) / (2 * 72 * 72));
  }

  const apps = [...DOCK_APPS, TRASH];
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-2 z-[8000] flex justify-center px-2">
      <nav
        aria-label="Dock"
        onPointerMove={(e) => e.pointerType === "mouse" && setMouseX(e.clientX)}
        onPointerLeave={() => setMouseX(null)}
        className="pointer-events-auto relative flex max-w-full items-end gap-1.5 px-2"
        style={{ height: shelf, paddingBottom: pad }}
      >
        {/* The shelf itself, drawn behind; icons are free to rise out of it. */}
        <span
          aria-hidden
          className={cn(
            "absolute inset-0 rounded-[22px] border backdrop-blur-2xl backdrop-saturate-150",
            dark ? "border-white/15 bg-white/10" : "border-black/10 bg-white/35",
            "shadow-[0_10px_40px_rgba(0,0,0,0.25)]",
          )}
        />
        {apps.map((a, i) => {
          const s = scaleFor(a.app);
          return (
            <div key={a.app} className="relative flex items-end">
              {a.app === "trash" ? <span className={cn("mx-1 mb-1.5 h-10 w-px", dark ? "bg-white/25" : "bg-black/20")} /> : null}
              <button
                ref={(el) => {
                  if (el) refs.current.set(a.app, el);
                }}
                data-dock-app={a.app}
                type="button"
                aria-label={a.label}
                onClick={() => onActivate(a.app)}
                className="group relative flex shrink-0 flex-col items-center outline-none"
                style={{ width: base * s, transition: mouseX === null ? "width 0.22s cubic-bezier(.2,.8,.2,1)" : "width 0.06s linear" }}
              >
                <span
                  className={cn(
                    "pointer-events-none absolute bottom-full mb-2 whitespace-nowrap rounded-[6px] px-2.5 py-1 text-[12px] opacity-0 shadow-lg transition-opacity duration-100 group-hover:opacity-100 group-focus-visible:opacity-100",
                    dark ? "bg-[rgba(40,40,46,0.88)] text-white" : "bg-[rgba(246,246,248,0.92)] text-black",
                    compact && "hidden",
                  )}
                  style={{ marginBottom: 8 + (base * s - base) * 0.1 }}
                >
                  {a.label}
                </span>
                <span
                  className={cn("block", bouncing === a.app && "os-bounce", party && "os-dance")}
                  style={party ? { animationDelay: `${(i % 4) * 0.121}s` } : undefined}
                >
                  <AppIcon app={a.app} size={Math.round(base * s)} />
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "mt-[3px] h-1 w-1 rounded-full transition-opacity",
                    running.has(a.app) ? (dark ? "bg-white/80" : "bg-black/70") : "opacity-0",
                  )}
                />
              </button>
            </div>
          );
        })}
      </nav>
      <style>{`
        .os-bounce { animation: os-bounce 0.6s cubic-bezier(.3,.7,.4,1) 2; }
        @keyframes os-bounce { 0%,100% { transform: translateY(0); } 40% { transform: translateY(-26px); } }
        .os-dance { animation: os-dance .484s ease-in-out infinite alternate; }
        @keyframes os-dance { from { transform: translateY(0) rotate(-4deg) } to { transform: translateY(-9px) rotate(4deg) } }
        @media (prefers-reduced-motion: reduce) { .os-bounce, .os-dance { animation: none; } }
      `}</style>
    </div>
  );
}

/** Where an app's dock icon is, so a window can minimise into it. */
export function dockIconRect(app: OsApp): DOMRect | null {
  if (typeof document === "undefined") return null;
  const el = document.querySelector<HTMLElement>(`[data-dock-app="${app === "about" ? "settings" : app}"]`);
  return el?.getBoundingClientRect() ?? null;
}

/* Desktop icons ───────────────────────────────────────────────────────────── */

export interface DesktopItem {
  id: string;
  label: string;
  app: OsApp;
  props?: OsWindowProps;
  icon: ReactNode;
}

export function DesktopIcons({
  items,
  compact,
  onOpen,
}: {
  items: DesktopItem[];
  compact: boolean;
  onOpen: (item: DesktopItem) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <ul
      aria-label="Desktop"
      className={cn(
        "absolute z-[1] grid gap-1",
        compact ? "inset-x-3 top-10 grid-cols-4 sm:grid-cols-6" : "right-3 top-10 grid-flow-row grid-cols-1",
      )}
    >
      {items.map((it) => (
        <li key={it.id}>
          <button
            type="button"
            onClick={() => (compact ? onOpen(it) : setSelected(it.id))}
            onDoubleClick={() => onOpen(it)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onOpen(it);
            }}
            onBlur={() => setSelected((s) => (s === it.id ? null : s))}
            className="flex w-[92px] flex-col items-center gap-1 rounded-[8px] p-1.5 text-center outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <span className={cn("rounded-[8px] p-1 transition-colors", selected === it.id && "bg-black/25 ring-1 ring-white/25")}>{it.icon}</span>
            <span
              className={cn(
                "line-clamp-2 rounded-[4px] px-1 text-[12px] font-medium leading-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]",
                selected === it.id && "bg-[#4F46E5] [text-shadow:none]",
              )}
            >
              {it.label}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function FileIcon({ ext, tint = "#4F46E5" }: { ext: string; tint?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 48 60" width="44" height="55" style={{ filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.35))" }}>
      <path d="M4 4a4 4 0 0 1 4-4h24l12 12v44a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" fill="#FAFAFA" />
      <path d="M32 0v8a4 4 0 0 0 4 4h8z" fill="#D4D4D8" />
      <rect x="4" y="38" width="40" height="13" fill={tint} />
      <text x="24" y="48" textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff" fontFamily="-apple-system,Inter,sans-serif">
        {ext.toUpperCase()}
      </text>
      {[16, 22, 28].map((y) => (
        <rect key={y} x="10" y={y} width={y === 28 ? 18 : 28} height="2" rx="1" fill="#D4D4D8" />
      ))}
    </svg>
  );
}

/* Notifications ───────────────────────────────────────────────────────────── */

export interface Toast {
  id: number;
  title: string;
  body: string;
  /** "achievement" draws a secret-found banner instead of a plain notification. */
  kind?: "notice" | "achievement";
  /** For achievements: which secret this is, e.g. 3 of 11. */
  progress?: { found: number; total: number };
  action?: { label: string; app: OsApp; props?: OsWindowProps };
  /** Set while it animates out; removed a moment later. */
  leaving?: boolean;
  at?: number;
}

const TOAST_MS = 7000;

export function Toasts({
  toasts,
  dark,
  onDismiss,
  onAction,
}: {
  toasts: Toast[];
  dark: boolean;
  onDismiss: (id: number) => void;
  onAction: (t: Toast) => void;
}) {
  return (
    <div aria-live="polite" className="pointer-events-none absolute right-2 top-9 z-[9500] flex w-[min(360px,calc(100vw-16px))] flex-col">
      {/* Newest on top, as on a Mac. Each card sits in a slot that grows open before it
          slides in and closes up after it slides out, so the rest of the stack glides
          into place instead of jumping. */}
      {[...toasts].reverse().map((t) => (
        <div key={t.id} className={cn("os-toast-slot", t.leaving && "is-leaving")}>
          <div className="min-h-0 pb-2">
            <ToastCard toast={t} dark={dark} onDismiss={onDismiss} onAction={onAction} />
          </div>
        </div>
      ))}
      <style>{`
        .os-toast-slot { display: grid; grid-template-rows: 1fr; animation: os-slot-in .32s cubic-bezier(.2,.9,.3,1) both; }
        @keyframes os-slot-in { from { grid-template-rows: 0fr; } }
        .os-toast-slot.is-leaving { animation: os-slot-out .3s cubic-bezier(.4,0,.2,1) .2s both; }
        @keyframes os-slot-out { from { grid-template-rows: 1fr; } to { grid-template-rows: 0fr; } }
        .os-toast { animation: os-toast-in .5s cubic-bezier(.2,1,.3,1.04) .22s both; }
        @keyframes os-toast-in { from { opacity: 0; transform: translateX(calc(100% + 16px)) scale(.96); } }
        .os-toast.is-leaving { animation: os-toast-out .26s cubic-bezier(.5,0,.75,0) both; }
        @keyframes os-toast-out { to { opacity: 0; transform: translateX(calc(100% + 16px)) scale(.96); } }
        @media (prefers-reduced-motion: reduce) { .os-toast-slot { animation: none; } .os-toast-slot.is-leaving { grid-template-rows: 0fr; } }
        .os-shine { background: linear-gradient(110deg, transparent 30%, rgba(255,255,255,.35) 50%, transparent 70%); background-size: 250% 100%; animation: os-shine 1.6s ease-out .3s 2; }
        @keyframes os-shine { from { background-position: 150% 0 } to { background-position: -100% 0 } }
        @media (prefers-reduced-motion: reduce) { .os-toast, .os-toast.is-leaving, .os-shine { animation: none; } }
      `}</style>
    </div>
  );
}

function ToastCard({
  toast: t,
  dark,
  onDismiss,
  onAction,
}: {
  toast: Toast;
  dark: boolean;
  onDismiss: (id: number) => void;
  onAction: (t: Toast) => void;
}) {
  // Auto-dismiss, paused while the pointer is over it — a notification someone is
  // reading must not slide away under them.
  const remaining = useRef(t.kind === "achievement" ? TOAST_MS + 2000 : TOAST_MS);
  const started = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;

  function start() {
    started.current = Date.now();
    timer.current = window.setTimeout(() => dismiss.current(t.id), remaining.current);
  }
  function pause() {
    window.clearTimeout(timer.current);
    remaining.current = Math.max(1200, remaining.current - (Date.now() - started.current));
  }
  useEffect(() => {
    start();
    return () => window.clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const achievement = t.kind === "achievement";
  return (
    <div
      onPointerEnter={pause}
      onPointerLeave={start}
      className={cn(
        "os-toast group pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-[16px] border p-3 shadow-[0_10px_30px_rgba(0,0,0,0.3)] backdrop-blur-2xl",
        t.leaving && "is-leaving",
        achievement
          ? "border-[#FACC15]/40 bg-[linear-gradient(135deg,rgba(67,56,202,0.92),rgba(30,27,75,0.92))] text-white"
          : dark
            ? "border-white/10 bg-[rgba(40,40,46,0.78)] text-white"
            : "border-black/10 bg-[rgba(246,246,248,0.86)] text-black",
      )}
    >
      {achievement ? <span aria-hidden className="os-shine pointer-events-none absolute inset-0" /> : null}
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(t.id)}
        className={cn(
          "absolute left-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full text-[11px] opacity-0 shadow transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
          dark || achievement ? "bg-[#3F3F46] text-white" : "bg-white text-black",
        )}
      >
        ×
      </button>
      <span className="relative mt-0.5 shrink-0">{achievement ? <Medal /> : <AppIcon app="foundry" size={34} />}</span>
      <span className="relative min-w-0 flex-1">
        {achievement ? (
          <span className="block text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#FDE68A]">
            Secret found{t.progress ? ` · ${t.progress.found} of ${t.progress.total}` : ""}
          </span>
        ) : null}
        <span className="block text-[13px] font-semibold">{t.title}</span>
        <span className={cn("block text-[12.5px] leading-snug", achievement ? "text-white/80" : dark ? "text-white/75" : "text-black/70")}>{t.body}</span>
      </span>
      {t.action ? (
        <button
          type="button"
          onClick={() => onAction(t)}
          className={cn(
            "relative shrink-0 self-center rounded-[8px] px-2.5 py-1 text-[12px] font-medium",
            dark || achievement ? "bg-white/15 hover:bg-white/25" : "bg-black/10 hover:bg-black/15",
          )}
        >
          {t.action.label}
        </button>
      ) : null}
    </div>
  );
}

function Medal({ size = 34, dim = false }: { size?: number; dim?: boolean }) {
  return <MedalArt size={size} dim={dim} />;
}

/* Notification Centre — click the clock ─────────────────────────────────── */

export function NotificationCentre({
  open,
  now,
  dark,
  history,
  secrets,
  percent,
  onClose,
  onClear,
  onOpenApp,
}: {
  open: boolean;
  now: Date;
  dark: boolean;
  history: Toast[];
  secrets: SecretId[];
  percent: number;
  onClose: () => void;
  onClear: () => void;
  onOpenApp: (app: OsApp, props?: OsWindowProps) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      const t = e.target as HTMLElement;
      if (!panel.current?.contains(t) && !t.closest("[data-nc-toggle]")) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const widget = cn(
    "rounded-[18px] border p-3.5 backdrop-blur-2xl",
    dark ? "border-white/10 bg-[rgba(40,40,46,0.72)] text-white" : "border-black/10 bg-[rgba(246,246,248,0.82)] text-black",
  );
  const muted = dark ? "text-white/60" : "text-black/55";
  const found = secrets.length;
  const hint = nextHint(secrets);

  return (
    <aside
      ref={panel}
      aria-label="Notification Centre"
      aria-hidden={!open}
      className={cn(
        "absolute bottom-2 right-2 top-9 z-[9400] flex w-[min(360px,calc(100vw-16px))] flex-col gap-2.5 overflow-y-auto pb-24 transition-[transform,opacity] duration-300 [transition-timing-function:cubic-bezier(.2,.9,.3,1)]",
        open ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-[calc(100%+16px)] opacity-0",
      )}
    >
      <div className={widget}>
        <p className={cn("text-[12px] font-medium", muted)}>{now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</p>
        <p className="font-[family-name:var(--font-display)] text-[44px] leading-none tabular-nums">
          {now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>

      <div className={widget}>
        <div className="flex items-center gap-3">
          <ProgressRing value={found / SECRET_COUNT} />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold">Secrets found</p>
            <p className={cn("text-[12px]", muted)}>
              {found} of {SECRET_COUNT}
              {found === SECRET_COUNT ? " · every one. Respect." : ""}
            </p>
          </div>
        </div>
        <ul className="mt-3 grid grid-cols-1 gap-1">
          {SECRETS.map((s) => {
            const got = secrets.includes(s.id);
            return (
              <li key={s.id} className="flex items-center gap-2 text-[12px]">
                <Medal size={18} dim={!got} />
                <span className={got ? "font-medium" : muted}>{got ? s.title : "???"}</span>
                {got ? <span className={cn("ml-auto truncate pl-2 text-[11px]", muted)} title={s.found}>{s.found}</span> : null}
              </li>
            );
          })}
        </ul>
        {hint ? <p className={cn("mt-2.5 border-t pt-2.5 text-[11.5px] italic", dark ? "border-white/10" : "border-black/10", muted)}>Hint: {hint}</p> : null}
      </div>

      <button type="button" onClick={() => onOpenApp("foundry", { href: "/demo/wiki" })} className={cn(widget, "text-left")}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#818CF8]">Live activity</p>
        <p className="mt-1 text-[13px] font-semibold">{percent >= 100 ? "Shipped. Ready for production." : `The last 20% · ${percent}% shipped`}</p>
        <span className={cn("mt-2 block h-1 overflow-hidden rounded-full", dark ? "bg-white/10" : "bg-black/10")}>
          <span className={cn("block h-full rounded-full", percent >= 100 ? "bg-[#34D399]" : "bg-[#818CF8]")} style={{ width: `${percent}%` }} />
        </span>
      </button>

      <button type="button" onClick={() => onOpenApp("calendar")} className={cn(widget, "flex items-center gap-3 text-left")}>
        <AppIcon app="calendar" size={36} />
        <span>
          <span className="block text-[13px] font-semibold">Free 30-minute audit</span>
          <span className={cn("block text-[12px]", muted)}>A real engineer and your codebase.</span>
        </span>
      </button>

      <div className="flex items-center justify-between px-1 pt-1">
        <p className={cn("text-[12px] font-semibold", dark ? "text-white/80" : "text-black/70")}>Notifications</p>
        {history.length ? (
          <button type="button" onClick={onClear} className={cn("text-[12px]", muted)}>
            Clear
          </button>
        ) : null}
      </div>
      {history.length ? (
        history
          .slice()
          .reverse()
          .map((t) => (
            <button
              key={`h${t.id}`}
              type="button"
              onClick={() => t.action && onOpenApp(t.action.app, t.action.props)}
              className={cn(widget, "flex items-start gap-3 py-3 text-left")}
            >
              {t.kind === "achievement" ? <Medal size={28} /> : <AppIcon app="foundry" size={28} />}
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-semibold">{t.title}</span>
                <span className={cn("block text-[12px] leading-snug", muted)}>{t.body}</span>
              </span>
            </button>
          ))
      ) : (
        <p className={cn("px-1 text-[12px]", muted)}>No notifications.</p>
      )}
    </aside>
  );
}

function ProgressRing({ value }: { value: number }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 44 44" width="44" height="44" aria-hidden className="-rotate-90">
      <circle cx="22" cy="22" r={r} fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="5" />
      <circle
        cx="22"
        cy="22"
        r={r}
        fill="none"
        stroke="#FACC15"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - value)}
        style={{ transition: "stroke-dashoffset .8s cubic-bezier(.2,.9,.3,1)" }}
      />
    </svg>
  );
}

/* Spotlight ───────────────────────────────────────────────────────────────── */

interface SpotResult {
  id: string;
  label: string;
  kind: string;
  app: OsApp;
  props?: OsWindowProps;
}

const SPOT_INDEX: SpotResult[] = [
  ...DOCK_APPS.map((a) => ({ id: `app-${a.app}`, label: a.label, kind: "Application", app: a.app })),
  ...FOUNDRY_PAGES.map((p) => ({ id: `fd-${p.id}`, label: `Foundry: ${p.label}`, kind: "Foundry demo", app: "foundry" as OsApp, props: { href: p.href } })),
  ...CASE_STUDIES.map((c) => ({ id: `cs-${c.id}`, label: c.name, kind: c.tagline, app: "finder" as OsApp, props: { item: c.id } })),
  ...PLANS.map((p) => ({ id: `pl-${p.id}`, label: p.name, kind: `From ${p.price}`, app: "services" as OsApp })),
  ...FAQ.map((f, i) => ({ id: `faq-${i}`, label: f.q, kind: "Honest answers", app: "notes" as OsApp, props: { item: "faq" } })),
];

export function Spotlight({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (r: SpotResult) => void }) {
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);
  const field = useRef<HTMLInputElement>(null);
  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return SPOT_INDEX.slice(0, 7);
    return SPOT_INDEX.filter((r) => `${r.label} ${r.kind}`.toLowerCase().includes(needle)).slice(0, 8);
  }, [q]);

  useEffect(() => {
    if (open) {
      setQ("");
      setIndex(0);
      requestAnimationFrame(() => field.current?.focus());
    }
  }, [open]);

  if (!open) return null;
  return (
    <div className="os-spot-scrim absolute inset-0 z-[9600] flex justify-center bg-black/15 pt-[18vh]" onPointerDown={onClose}>
      <div
        role="dialog"
        aria-label="Spotlight"
        onPointerDown={(e) => e.stopPropagation()}
        className="os-spot h-fit w-[min(640px,calc(100vw-24px))] overflow-hidden rounded-[18px] border border-white/15 bg-[rgba(36,36,42,0.84)] text-white shadow-[0_30px_80px_rgba(0,0,0,0.5)] backdrop-blur-2xl"
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <svg viewBox="0 0 20 20" className="h-5 w-5 shrink-0 text-white/60" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="8.5" cy="8.5" r="5.5" />
            <path d="M13 13l4 4" strokeLinecap="round" />
          </svg>
          <input
            ref={field}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(results.length - 1, i + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(0, i - 1));
              } else if (e.key === "Enter" && results[index]) onPick(results[index]);
            }}
            placeholder="Spotlight Search"
            aria-label="Spotlight Search"
            style={{ outline: "none", boxShadow: "none" }}
            className="min-w-0 flex-1 bg-transparent text-[22px] font-light outline-none placeholder:text-white/40"
          />
        </div>
        {results.length ? (
          <ul className="border-t border-white/10 p-1.5">
            {results.map((r, i) => (
              <li key={r.id}>
                <button
                  type="button"
                  onPointerEnter={() => setIndex(i)}
                  onClick={() => onPick(r)}
                  className={cn("flex w-full items-center gap-3 rounded-[8px] px-2.5 py-1.5 text-left", i === index && "bg-[#4F46E5]")}
                >
                  <AppIcon app={r.app} size={26} />
                  <span className="min-w-0 flex-1 truncate text-[14px]" title={r.label}>
                    {r.label}
                  </span>
                  <span className={cn("max-w-[45%] truncate text-[12px]", i === index ? "text-white/80" : "text-white/45")} title={r.kind}>
                    {r.kind}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="border-t border-white/10 px-4 py-3 text-[13px] text-white/60">No results. Try &ldquo;Foundry&rdquo;, &ldquo;Launch Pad&rdquo; or &ldquo;Wedge&rdquo;.</p>
        )}
      </div>
      <style>{`
        .os-spot { animation: os-spot .22s cubic-bezier(.2,.9,.3,1.1); }
        @keyframes os-spot { from { opacity: 0; transform: scale(.96) translateY(-6px) } }
        .os-spot-scrim { animation: os-scrim .2s ease-out; }
        @keyframes os-scrim { from { opacity: 0 } }
        @media (prefers-reduced-motion: reduce) { .os-spot, .os-spot-scrim { animation: none } }
      `}</style>
    </div>
  );
}

export function appTitle(app: OsApp): string {
  return appMeta(app).title;
}

export { GitworkMark };
