"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/format";
import type { OsApp, OsWindowProps } from "@/lib/demo/os/window-manager";
import { CASE_STUDIES, FAQ, FOUNDRY_PAGES, LAST_20, PLANS } from "@/lib/demo/os/gitwork-content";
import { AppIcon, DOCK_APPS, GitworkMark, TRASH, appMeta } from "./os-apps";

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
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!bar.current?.contains(e.target as Node)) setOpen(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(null);
    }
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

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
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={open === m.id}
              aria-label={m.name}
              onClick={() => {
                if (i === 0) onLogoClick();
                setOpen(open === m.id ? null : m.id);
              }}
              onPointerEnter={() => open && setOpen(m.id)}
              className={cn(
                "flex h-[22px] items-center rounded-[5px] px-2.5 outline-none focus-visible:ring-1 focus-visible:ring-white/60",
                m.bold && "font-bold",
                open === m.id && (dark ? "bg-white/20" : "bg-black/10"),
              )}
            >
              {m.label}
            </button>
            {open === m.id ? <MenuPanel items={m.items} dark={dark} onClose={() => setOpen(null)} /> : null}
          </div>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 hidden justify-center sm:flex">{notch}</div>
      <div className="ml-auto flex items-center gap-0.5">{right}</div>
    </div>
  );
}

function MenuPanel({ items, dark, onClose }: { items: MenuEntry[]; dark: boolean; onClose: () => void }) {
  return (
    <div
      role="menu"
      className={cn(
        "absolute left-0 top-[26px] z-[9100] min-w-[230px] rounded-[8px] p-[5px] shadow-[0_10px_40px_rgba(0,0,0,0.35)] backdrop-blur-2xl",
        dark
          ? "border border-white/10 bg-[rgba(40,40,46,0.94)] text-white"
          : "border border-black/10 bg-[rgba(246,246,248,0.95)] text-black",
      )}
    >
      {items.map((it, i) =>
        it === "sep" ? (
          <div key={`sep-${i}`} className={cn("mx-2 my-[5px] h-px", dark ? "bg-white/12" : "bg-black/10")} />
        ) : (
          <button
            key={it.label}
            type="button"
            role="menuitem"
            disabled={it.disabled}
            onClick={() => {
              onClose();
              it.onSelect?.();
            }}
            className={cn(
              "flex w-full items-center gap-2 rounded-[5px] py-[3px] pl-6 pr-2.5 text-left text-[13px] outline-none disabled:opacity-40",
              "hover:bg-[#4F46E5] hover:text-white focus-visible:bg-[#4F46E5] focus-visible:text-white",
            )}
          >
            <span className="-ml-4 w-3 text-[11px]">{it.checked ? "✓" : ""}</span>
            <span className="flex-1">{it.label}</span>
            {it.shortcut ? <span className="text-[12px] opacity-50">{it.shortcut}</span> : null}
          </button>
        ),
      )}
    </div>
  );
}

/* Notch — a live activity, the "last 20%" card from the website ───────────── */

export function Notch({ percent, onOpenFoundry }: { percent: number; onOpenFoundry: () => void }) {
  const [open, setOpen] = useState(false);
  const done = Math.round((percent / 100) * LAST_20.length);
  return (
    <div className="pointer-events-auto relative">
      <button
        type="button"
        aria-expanded={open}
        aria-label="Live activity: the last 20%"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center justify-between overflow-hidden bg-black text-white shadow-[0_6px_20px_rgba(0,0,0,0.35)] outline-none transition-all duration-500 [transition-timing-function:cubic-bezier(0.2,0.9,0.2,1.2)]",
          open ? "h-[178px] w-[380px] max-w-[92vw] rounded-b-[28px] px-5" : "h-[30px] w-[230px] rounded-b-[14px] px-3",
        )}
      >
        {open ? (
          <span className="flex h-full w-full flex-col justify-center gap-2 py-3 text-left">
            <span className="flex items-center justify-between">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#A5B4FC]">The last 20%</span>
              <span className="font-[family-name:var(--font-mono)] text-[11px] text-white/60">{percent}% shipped</span>
            </span>
            <span className="block h-1 overflow-hidden rounded-full bg-white/15">
              <span className="block h-full rounded-full bg-[#818CF8] transition-all duration-700" style={{ width: `${percent}%` }} />
            </span>
            <span className="grid grid-cols-2 gap-x-4 gap-y-1">
              {LAST_20.map((item, i) => (
                <span key={item.label} className="flex items-center gap-1.5 text-[11.5px]">
                  <span
                    className={cn(
                      "flex h-3 w-3 items-center justify-center rounded-[3px] text-[8px]",
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
              {percent >= 100 ? "Ready for production. See it in Foundry →" : "Watch it in Foundry →"}
            </span>
          </span>
        ) : (
          <>
            <AppIcon app="foundry" size={18} />
            <span className="flex items-center gap-1.5 font-[family-name:var(--font-mono)] text-[11px]">
              <span className="text-white/70">{percent}%</span>
              <Bars />
            </span>
          </>
        )}
      </button>
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

export function StatusIcon({ label, onClick, children }: { label: string; onClick?: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-[22px] items-center rounded-[5px] px-2 outline-none hover:bg-white/15 focus-visible:ring-1 focus-visible:ring-white/60"
    >
      {children}
    </button>
  );
}

export function Clock({ now, showSeconds }: { now: Date; showSeconds: boolean }) {
  const day = now.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: showSeconds ? "2-digit" : undefined });
  return (
    <span className="whitespace-nowrap">
      <span className="hidden sm:inline">{day}&nbsp;&nbsp;</span>
      {time}
    </span>
  );
}

/* Dock ────────────────────────────────────────────────────────────────────── */

export function Dock({
  running,
  bouncing,
  compact,
  dark,
  onActivate,
}: {
  running: Set<OsApp>;
  bouncing: OsApp | null;
  compact: boolean;
  dark: boolean;
  onActivate: (app: OsApp) => void;
}) {
  const [mouseX, setMouseX] = useState<number | null>(null);
  const refs = useRef(new Map<OsApp, HTMLButtonElement>());
  // Nine icons have to fit a 390px phone without scrolling.
  const base = compact ? 34 : 50;

  function scaleFor(app: OsApp): number {
    if (compact || mouseX === null) return 1;
    const el = refs.current.get(app);
    if (!el) return 1;
    const r = el.getBoundingClientRect();
    const d = Math.abs(mouseX - (r.left + r.width / 2));
    // Gaussian falloff, peak 1.55x, as on macOS with magnification on.
    return 1 + 0.55 * Math.exp(-(d * d) / (2 * 70 * 70));
  }

  const apps = [...DOCK_APPS, TRASH];
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-2 z-[8000] flex justify-center px-2">
      <nav
        aria-label="Dock"
        onPointerMove={(e) => e.pointerType === "mouse" && setMouseX(e.clientX)}
        onPointerLeave={() => setMouseX(null)}
        className={cn(
          "pointer-events-auto flex max-w-full items-end gap-1.5 overflow-x-auto rounded-[22px] border px-2 pb-1.5 pt-1.5 backdrop-blur-2xl backdrop-saturate-150",
          dark ? "border-white/15 bg-white/10" : "border-black/10 bg-white/35",
          "shadow-[0_10px_40px_rgba(0,0,0,0.25)]",
          !compact && "overflow-visible",
        )}
      >
        {apps.map((a) => {
          const s = scaleFor(a.app);
          return (
            <div key={a.app} className="flex items-end">
              {a.app === "trash" ? <span className={cn("mx-1 mb-1 h-10 w-px", dark ? "bg-white/25" : "bg-black/20")} /> : null}
              <button
                ref={(el) => {
                  if (el) refs.current.set(a.app, el);
                }}
                type="button"
                aria-label={a.label}
                onClick={() => onActivate(a.app)}
                className="group relative flex shrink-0 flex-col items-center outline-none"
                style={{ width: base * s, transition: mouseX === null ? "width 0.2s ease-out" : undefined }}
              >
                <span
                  className={cn(
                    "pointer-events-none absolute -top-9 whitespace-nowrap rounded-[6px] px-2.5 py-1 text-[12px] opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100",
                    dark ? "bg-[rgba(40,40,46,0.85)] text-white" : "bg-[rgba(246,246,248,0.9)] text-black",
                    compact && "hidden",
                  )}
                >
                  {a.label}
                </span>
                <span className={cn("block", bouncing === a.app && "os-bounce")}>
                  <AppIcon app={a.app} size={Math.round(base * s)} />
                </span>
                <span
                  aria-hidden
                  className={cn("mt-[3px] h-1 w-1 rounded-full", running.has(a.app) ? (dark ? "bg-white/80" : "bg-black/70") : "bg-transparent")}
                />
              </button>
            </div>
          );
        })}
      </nav>
      <style>{`
        .os-bounce { animation: os-bounce 0.55s cubic-bezier(.3,.7,.4,1) 2; }
        @keyframes os-bounce { 0%,100% { transform: translateY(0); } 40% { transform: translateY(-22px); } }
        @media (prefers-reduced-motion: reduce) { .os-bounce { animation: none; } }
      `}</style>
    </div>
  );
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
            <span className={cn("rounded-[8px] p-1", selected === it.id && "bg-black/25 ring-1 ring-white/25")}>{it.icon}</span>
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
    <svg aria-hidden viewBox="0 0 48 60" width="44" height="55">
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
  action?: { label: string; app: OsApp; props?: OsWindowProps };
}

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
    <div aria-live="polite" className="absolute right-2 top-9 z-[9500] flex w-[min(360px,calc(100vw-16px))] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "os-toast group relative flex items-start gap-3 rounded-[16px] border p-3 shadow-[0_10px_30px_rgba(0,0,0,0.3)] backdrop-blur-2xl",
            dark ? "border-white/10 bg-[rgba(40,40,46,0.72)] text-white" : "border-black/10 bg-[rgba(246,246,248,0.82)] text-black",
          )}
        >
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => onDismiss(t.id)}
            className={cn(
              "absolute -left-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[11px] opacity-0 shadow transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
              dark ? "bg-[#3F3F46] text-white" : "bg-white text-black",
            )}
          >
            ×
          </button>
          <span className="mt-0.5 shrink-0">
            <AppIcon app="foundry" size={34} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold">{t.title}</span>
            <span className={cn("block text-[12.5px] leading-snug", dark ? "text-white/75" : "text-black/70")}>{t.body}</span>
          </span>
          {t.action ? (
            <button
              type="button"
              onClick={() => onAction(t)}
              className={cn(
                "shrink-0 self-center rounded-[8px] px-2.5 py-1 text-[12px] font-medium",
                dark ? "bg-white/15 hover:bg-white/25" : "bg-black/10 hover:bg-black/15",
              )}
            >
              {t.action.label}
            </button>
          ) : null}
        </div>
      ))}
      <style>{`
        .os-toast { animation: os-toast-in 0.45s cubic-bezier(.2,.9,.3,1.15); }
        @keyframes os-toast-in { from { opacity: 0; transform: translateX(40px); } }
        @media (prefers-reduced-motion: reduce) { .os-toast { animation: none; } }
      `}</style>
    </div>
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
    <div className="absolute inset-0 z-[9600] flex justify-center bg-black/10 pt-[18vh]" onPointerDown={onClose}>
      <div
        role="dialog"
        aria-label="Spotlight"
        onPointerDown={(e) => e.stopPropagation()}
        className="h-fit w-[min(640px,calc(100vw-24px))] overflow-hidden rounded-[18px] border border-white/15 bg-[rgba(36,36,42,0.82)] text-white shadow-[0_30px_80px_rgba(0,0,0,0.5)] backdrop-blur-2xl"
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
    </div>
  );
}

export function appTitle(app: OsApp): string {
  return appMeta(app).title;
}

export { GitworkMark };
