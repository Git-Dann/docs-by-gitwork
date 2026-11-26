"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/format";
import type { OsApp, OsWindowProps } from "@/lib/demo/os/window-manager";
import { isDemoHref } from "@/lib/demo/os/window-manager";
import {
  BOOK_URL,
  CASE_STUDIES,
  CONTACT_EMAIL,
  EVERY_ENGAGEMENT,
  FAQ,
  FOUNDRY_PAGES,
  GOT_RID_OF,
  LAST_20,
  PLANS,
  STEPS,
  STRAPLINE,
  TAGLINE,
  TESTIMONIALS,
  WORK_URL,
  type CaseStudy,
} from "@/lib/demo/os/gitwork-content";
import { GITWORK } from "@/lib/gitwork";
import { runTerminal, type TerminalLine, type TerminalEffect } from "@/lib/demo/os/terminal";
import { AppIcon, GitworkMark } from "./os-apps";
import { WALLPAPERS, type WallpaperId } from "./os-wallpaper";

export type Appearance = "dark" | "light";
export type EggName = "confetti" | "matrix" | "restart" | "sleep" | "vibe" | "forcequit";

/** What an app view may ask of the desktop. */
export interface OsBridge {
  open: (app: OsApp, props?: OsWindowProps) => void;
  closeSelf: () => void;
  appearance: Appearance;
  setAppearance: (a: Appearance) => void;
  wallpaper: WallpaperId;
  setWallpaper: (id: WallpaperId) => void;
  resetDesktop: () => void;
  egg: (name: EggName) => void;
  notify: (toast: { title: string; body: string; action?: { label: string; app: OsApp } }) => void;
}

/* Shared bits ─────────────────────────────────────────────────────────────── */

function Sidebar({ children, label }: { children: ReactNode; label: string }) {
  return (
    <nav
      aria-label={label}
      className="flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--os-border)] bg-[var(--os-sidebar)] p-2 sm:w-[200px] sm:flex-col sm:overflow-x-visible sm:overflow-y-auto sm:border-b-0 sm:border-r"
    >
      {children}
    </nav>
  );
}

function SideHeading({ children }: { children: ReactNode }) {
  return <p className="hidden px-2 pb-1 pt-3 text-[11px] font-semibold text-[var(--os-text-3)] sm:block">{children}</p>;
}

function SideItem({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center gap-2 rounded-[6px] px-2 py-1 text-left text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-[#818CF8]",
        active ? "bg-[var(--os-select)] text-[var(--os-text)]" : "text-[var(--os-text-2)] hover:bg-[var(--os-hover)]",
      )}
    >
      {children}
    </button>
  );
}

function PrimaryButton({ children, onClick, href }: { children: ReactNode; onClick?: () => void; href?: string }) {
  const cls =
    "inline-flex items-center justify-center gap-1.5 rounded-[7px] bg-[#4F46E5] px-3.5 py-1.5 text-[13px] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] outline-none hover:bg-[#4338CA] focus-visible:ring-2 focus-visible:ring-[#A5B4FC]";
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener" className={cls}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

function SecondaryButton({ children, onClick, href }: { children: ReactNode; onClick?: () => void; href?: string }) {
  const cls =
    "inline-flex items-center justify-center gap-1.5 rounded-[7px] border border-[var(--os-border-strong)] bg-[var(--os-control)] px-3.5 py-1.5 text-[13px] font-medium text-[var(--os-text)] outline-none hover:bg-[var(--os-hover)] focus-visible:ring-2 focus-visible:ring-[#A5B4FC]";
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener" className={cls}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

/* Work (Finder) ───────────────────────────────────────────────────────────── */

const ENGAGEMENTS = ["All", "Greenfield Build", "MVP Sprint", "Launch Pad"] as const;

const FOLDER_TINT: Record<CaseStudy["engagement"], string> = {
  "Greenfield Build": "#38BDF8",
  "MVP Sprint": "#A78BFA",
  "Launch Pad": "#34D399",
};

export function FinderView({ props, bridge }: { props: OsWindowProps; bridge: OsBridge }) {
  const [filter, setFilter] = useState<(typeof ENGAGEMENTS)[number]>("All");
  const [selected, setSelected] = useState<string | null>(props.item ?? CASE_STUDIES[0].id);
  const items = CASE_STUDIES.filter((c) => filter === "All" || c.engagement === filter);
  const current = CASE_STUDIES.find((c) => c.id === selected) ?? null;

  return (
    <div className="flex h-full flex-col sm:flex-row">
      <Sidebar label="Work">
        <SideHeading>Favourites</SideHeading>
        {ENGAGEMENTS.map((e) => (
          <SideItem key={e} active={filter === e} onClick={() => setFilter(e)}>
            <FolderGlyph tint={e === "All" ? "#60A5FA" : FOLDER_TINT[e]} />
            {e === "All" ? "All work" : e}
          </SideItem>
        ))}
        <SideHeading>Gitwork</SideHeading>
        <SideItem active={false} onClick={() => bridge.open("foundry")}>
          <AppIcon app="foundry" size={16} />
          Foundry
        </SideItem>
        <SideItem active={false} onClick={() => bridge.open("services")}>
          <FolderGlyph tint="#818CF8" />
          Plans
        </SideItem>
      </Sidebar>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row">
        <ul className="grid min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(112px,1fr))] content-start gap-1 overflow-auto p-4">
          {items.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setSelected(c.id)}
                onDoubleClick={() => window.open(WORK_URL, "_blank", "noopener")}
                className="group flex w-full flex-col items-center gap-1.5 rounded-[8px] p-2 text-center outline-none"
              >
                <span className={cn("rounded-[8px] p-1.5", selected === c.id && "bg-[var(--os-select)]")}>
                  <FolderGlyph tint={FOLDER_TINT[c.engagement]} size={56} />
                </span>
                <span
                  className={cn(
                    "line-clamp-2 rounded-[4px] px-1.5 text-[12px] leading-tight",
                    selected === c.id ? "bg-[#4F46E5] text-white" : "text-[var(--os-text)]",
                  )}
                  title={c.name}
                >
                  {c.name}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {current ? (
          <aside className="shrink-0 border-t border-[var(--os-border)] bg-[var(--os-sidebar)] p-5 lg:w-[290px] lg:border-l lg:border-t-0">
            <FolderGlyph tint={FOLDER_TINT[current.engagement]} size={64} />
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#818CF8]">{current.engagement}</p>
            <h3 className="mt-1 text-[19px] font-semibold leading-tight">{current.name}</h3>
            <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--os-text-2)]">{current.tagline}</p>
            {current.stats.length ? (
              <dl className="mt-4 grid grid-cols-2 gap-3">
                {current.stats.map((s) => (
                  <div key={s.label}>
                    <dt className="text-[11px] text-[var(--os-text-3)]">{s.label}</dt>
                    <dd className="font-[family-name:var(--font-display)] text-[26px] leading-none">{s.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-1">
              {current.tags.map((t) => (
                <span key={t} className="rounded-[4px] border border-[var(--os-border-strong)] px-1.5 py-0.5 text-[11px] text-[var(--os-text-2)]">
                  {t}
                </span>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <PrimaryButton href={WORK_URL}>View case study ↗</PrimaryButton>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function FolderGlyph({ tint, size = 16 }: { tint: string; size?: number }) {
  return (
    <svg aria-hidden viewBox="0 0 64 52" width={size} height={size * 0.8125} className="shrink-0">
      <path d="M2 8a6 6 0 0 1 6-6h16l6 6h26a6 6 0 0 1 6 6v4H2z" fill={tint} style={{ filter: "brightness(0.82)" }} />
      <path d="M2 16a4 4 0 0 1 4-4h52a4 4 0 0 1 4 4v30a6 6 0 0 1-6 6H8a6 6 0 0 1-6-6z" fill={tint} />
      <path d="M2 16a4 4 0 0 1 4-4h52a4 4 0 0 1 4 4v2H2z" fill="rgba(255,255,255,0.35)" />
    </svg>
  );
}

/* Foundry — the hero app ─────────────────────────────────────────────────── */

export function FoundryView({ props, bridge }: { props: OsWindowProps; bridge: OsBridge }) {
  const href = props.href && isDemoHref(props.href) ? props.href : null;
  const page = FOUNDRY_PAGES.find((p) => p.href === href) ?? null;
  const frame = useRef<HTMLIFrameElement>(null);

  return (
    <div className="flex h-full flex-col sm:flex-row">
      <Sidebar label="Foundry">
        <SideItem active={!href} onClick={() => bridge.open("foundry", { href: undefined })}>
          <span className="w-4 text-center text-[#818CF8]">◆</span>
          Welcome
        </SideItem>
        <SideHeading>Live demos</SideHeading>
        {FOUNDRY_PAGES.map((p) => (
          <SideItem key={p.id} active={href === p.href} onClick={() => bridge.open("foundry", { href: p.href })}>
            <span className="w-4 text-center text-[var(--os-text-3)]">›</span>
            {p.label}
          </SideItem>
        ))}
      </Sidebar>

      {href ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-2 border-b border-[var(--os-border)] px-3 py-1.5">
            <button
              type="button"
              aria-label="Reload"
              title="Reload"
              onClick={() => frame.current?.contentWindow?.location.reload()}
              className="rounded-[6px] px-1.5 py-0.5 text-[15px] text-[var(--os-text-2)] hover:bg-[var(--os-hover)]"
            >
              ↻
            </button>
            <span
              className="min-w-0 flex-1 truncate rounded-[6px] bg-[var(--os-control)] px-3 py-1 text-center text-[12px] text-[var(--os-text-2)]"
              title={`foundry.gitwork.co.uk${href}`}
            >
              foundry.gitwork.co.uk{href.replace(/^\/demo/, "") || "/"} · demo data
            </span>
          </div>
          {/* Same-origin demo pages only (isDemoHref): mock data, no login, no database. */}
          <iframe ref={frame} key={href} src={href} title={page?.label ?? "Foundry"} className="min-h-0 w-full flex-1 border-0 bg-white" />
        </div>
      ) : (
        <FoundryWelcome bridge={bridge} />
      )}
    </div>
  );
}

function FoundryWelcome({ bridge }: { bridge: OsBridge }) {
  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-auto">
      <div className="mx-auto max-w-[760px] px-6 py-8 sm:px-10">
        <div className="flex items-center gap-4">
          <AppIcon app="foundry" size={64} />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#818CF8]">Foundry by Gitwork</p>
            <h2 className="font-[family-name:var(--font-display)] text-[34px] leading-[1.05]">Your project, always in view.</h2>
          </div>
        </div>
        <p className="mt-4 max-w-[60ch] text-[14.5px] leading-relaxed text-[var(--os-text-2)]">
          Foundry is the platform Gitwork runs every engagement on. Every client gets a login to their own portal:
          live timelines, your team, and updates from UK product management, all in one place.
        </p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {FOUNDRY_PAGES.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => bridge.open("foundry", { href: p.href })}
                className="group flex h-full w-full flex-col rounded-[10px] border border-[var(--os-border-strong)] bg-[var(--os-control)] p-4 text-left outline-none transition hover:-translate-y-0.5 hover:border-[#818CF8] focus-visible:ring-2 focus-visible:ring-[#818CF8]"
              >
                <span className="text-[14px] font-semibold">{p.label}</span>
                <span className="mt-1 text-[12.5px] leading-relaxed text-[var(--os-text-2)]">{p.blurb}</span>
                <span className="mt-auto pt-3 text-[12px] font-medium text-[#818CF8] opacity-70 group-hover:opacity-100">Open the demo →</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-[12px] text-[var(--os-text-3)]">
          Every page here runs on sample data. Nothing you click reaches a real client.
        </p>
      </div>
    </div>
  );
}

/* Plans ───────────────────────────────────────────────────────────────────── */

export function ServicesView({ bridge }: { bridge: OsBridge }) {
  return (
    <div className="px-5 py-6 sm:px-8">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#818CF8]">What we do</p>
      <h2 className="mt-1 font-[family-name:var(--font-display)] text-[32px] leading-[1.05]">Three ways to ship with Gitwork.</h2>
      <p className="mt-2 max-w-[62ch] text-[14px] leading-relaxed text-[var(--os-text-2)]">
        Pick the engagement that fits your stage. Fixed scope, fixed price, UK quality control. No body-shop billing.
      </p>
      <ul className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {PLANS.map((p) => (
          <li key={p.id} className="flex flex-col rounded-[12px] border border-[var(--os-border-strong)] bg-[var(--os-control)] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#818CF8]">{p.name}</p>
            <h3 className="mt-1 text-[15px] font-semibold leading-snug">{p.headline}</h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--os-text-2)]">{p.summary}</p>
            <p className="mt-3 text-[11px] text-[var(--os-text-3)]">FROM</p>
            <p className="font-[family-name:var(--font-display)] text-[30px] leading-none">{p.price}</p>
            <p className="mt-1 text-[12px] text-[var(--os-text-3)]">{p.terms}</p>
            <ul className="mt-3 space-y-1.5 text-[12.5px] text-[var(--os-text-2)]">
              {p.includes.map((i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="text-[#34D399]">✓</span>
                  {i}
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-4">
              <SecondaryButton href={p.url}>See {p.name} ↗</SecondaryButton>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-5 rounded-[12px] border border-[var(--os-border)] bg-[var(--os-sidebar)] p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--os-text-3)]">Every engagement</p>
        <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--os-text-2)]">{EVERY_ENGAGEMENT}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <PrimaryButton onClick={() => bridge.open("calendar")}>Book a free 30-min audit</PrimaryButton>
          <SecondaryButton onClick={() => bridge.open("foundry")}>See how we run it in Foundry</SecondaryButton>
        </div>
      </div>
    </div>
  );
}

/* Notes ───────────────────────────────────────────────────────────────────── */

const SCRATCH_KEY = "gitwork.os.scratchpad.v1";
type NoteId = "welcome" | "process" | "faq" | "clients" | "scratch";

const NOTES: { id: NoteId; title: string; preview: string }[] = [
  { id: "welcome", title: "Read me first", preview: TAGLINE },
  { id: "process", title: "How we work", preview: "Four steps. No fluff." },
  { id: "faq", title: "Honest answers", preview: "Will you work with my AI-built code?" },
  { id: "clients", title: "What our clients say", preview: "The half-built becomes the launched." },
  { id: "scratch", title: "Your notes", preview: "Saved in this browser" },
];

export function NotesView({ bridge, initial }: { bridge: OsBridge; initial?: string }) {
  const [note, setNote] = useState<NoteId>(() =>
    NOTES.some((n) => n.id === initial) ? (initial as NoteId) : "welcome",
  );
  const [scratch, setScratch] = useState("");
  useEffect(() => {
    try {
      setScratch(window.localStorage.getItem(SCRATCH_KEY) ?? "");
    } catch {
      /* private window: start empty */
    }
  }, []);
  function save(value: string) {
    setScratch(value);
    try {
      window.localStorage.setItem(SCRATCH_KEY, value);
    } catch {
      /* in-memory only */
    }
  }

  return (
    <div className="flex h-full flex-col sm:flex-row">
      <nav aria-label="Notes" className="flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--os-border)] bg-[var(--os-sidebar)] p-2 sm:w-[230px] sm:flex-col sm:overflow-y-auto sm:border-b-0 sm:border-r">
        {NOTES.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => setNote(n.id)}
            className={cn(
              "shrink-0 rounded-[8px] px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-[#FACC15]",
              note === n.id ? "bg-[#FACC15] text-[#1C1917]" : "hover:bg-[var(--os-hover)]",
            )}
          >
            <span className="block text-[13px] font-semibold">{n.title}</span>
            <span className={cn("hidden truncate text-[12px] sm:block", note === n.id ? "text-[#44403C]" : "text-[var(--os-text-3)]")}>
              {n.preview}
            </span>
          </button>
        ))}
      </nav>
      <article className="min-h-0 min-w-0 flex-1 overflow-auto bg-[var(--os-paper)] px-6 py-5 text-[14px] leading-relaxed sm:px-8">
        {note === "welcome" ? (
          <>
            <p className="text-center text-[11px] text-[var(--os-text-3)]">Pinned</p>
            <h2 className="mt-2 text-[24px] font-bold">{TAGLINE}</h2>
            <p className="mt-3 text-[var(--os-text-2)]">
              AI gets you to a prototype fast. The last 20% nobody&apos;s vibe-coded yet is auth, payments, infra,
              security, and scale. That&apos;s what Gitwork finishes, with UK quality control on every release.
            </p>
            <ul className="mt-4 space-y-1.5">
              {LAST_20.map((i) => (
                <li key={i.label} className="flex items-center gap-2">
                  <span
                    className={cn(
                      "flex h-4 w-4 items-center justify-center rounded-full border text-[10px]",
                      i.done ? "border-[#F59E0B] bg-[#F59E0B] text-white" : "border-[var(--os-border-strong)]",
                    )}
                  >
                    {i.done ? "✓" : ""}
                  </span>
                  <span className={i.done ? "text-[var(--os-text-3)] line-through" : ""}>{i.label}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[var(--os-text-2)]">
              Look around: the dock has our <b>work</b>, our <b>plans</b>, and <b>Foundry</b>, the platform every
              client gets a login to. And there&apos;s more behind the <GitworkMark size={14} /> in the top left.
            </p>
          </>
        ) : null}
        {note === "process" ? (
          <>
            <h2 className="text-[22px] font-bold">How we work</h2>
            <p className="mt-1 text-[var(--os-text-2)]">From the first call to &ldquo;you own the code.&rdquo; No retainer treadmills, no surprise invoices, no jargon.</p>
            <ol className="mt-4 space-y-4">
              {STEPS.map((s) => (
                <li key={s.title}>
                  <p className="font-semibold">
                    <span className="font-[family-name:var(--font-display)] text-[#818CF8]">{s.n}</span> {s.title}{" "}
                    <span className="ml-1 text-[12px] font-normal text-[var(--os-text-3)]">{s.when}</span>
                  </p>
                  <p className="text-[var(--os-text-2)]">{s.body}</p>
                </li>
              ))}
            </ol>
          </>
        ) : null}
        {note === "faq" ? (
          <>
            <h2 className="text-[22px] font-bold">Honest answers</h2>
            <dl className="mt-4 space-y-4">
              {FAQ.map((f) => (
                <div key={f.q}>
                  <dt className="font-semibold">{f.q}</dt>
                  <dd className="mt-1 text-[var(--os-text-2)]">{f.a}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : null}
        {note === "clients" ? (
          <>
            <h2 className="text-[22px] font-bold">What our clients say</h2>
            <div className="mt-4 space-y-5">
              {TESTIMONIALS.map((t) => (
                <figure key={t.name}>
                  <blockquote className="font-[family-name:var(--font-display)] text-[18px] leading-snug">&ldquo;{t.quote}&rdquo;</blockquote>
                  <figcaption className="mt-1.5 text-[12.5px] text-[var(--os-text-3)]">
                    {t.name}, {t.role}
                  </figcaption>
                </figure>
              ))}
            </div>
          </>
        ) : null}
        {note === "scratch" ? (
          <div className="flex h-full flex-col">
            <label htmlFor="os-scratch" className="text-[12px] text-[var(--os-text-3)]">
              What are you building? Jot it down, then <button type="button" className="underline" onClick={() => bridge.open("mail")}>send it to us</button>.
            </label>
            <textarea
              id="os-scratch"
              value={scratch}
              onChange={(e) => save(e.target.value)}
              placeholder="My app is 80% done, but payments…"
              className="mt-2 min-h-[220px] flex-1 resize-none rounded-[8px] border border-[var(--os-border-strong)] bg-transparent px-3 py-2.5 text-[16px] leading-relaxed outline-none focus:border-[#FACC15] sm:text-[14px]"
            />
          </div>
        ) : null}
      </article>
    </div>
  );
}

/* Calendar — book the audit ──────────────────────────────────────────────── */

export function CalendarView() {
  const today = new Date();
  const days = Array.from({ length: 5 }).map((_, i) => {
    const d = new Date(today);
    let added = 0;
    while (added <= i) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() !== 0 && d.getDay() !== 6) added++;
    }
    return new Date(d);
  });
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--os-border)] px-5 py-3">
        <div>
          <p className="text-[20px] font-bold">{today.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</p>
          <p className="text-[12.5px] text-[var(--os-text-3)]">Free 30-minute audit · a real engineer and your codebase</p>
        </div>
        <PrimaryButton href={BOOK_URL}>Book a call ↗</PrimaryButton>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-5 overflow-auto">
        {days.map((d, i) => (
          <div key={d.toISOString()} className="border-r border-[var(--os-border)] last:border-r-0">
            <p className="sticky top-0 border-b border-[var(--os-border)] bg-[var(--os-win)] px-2 py-1.5 text-center text-[12px]">
              <span className="text-[var(--os-text-3)]">{d.toLocaleDateString("en-GB", { weekday: "short" })}</span>{" "}
              <span className="font-semibold">{d.getDate()}</span>
            </p>
            <div className="space-y-1.5 p-1.5">
              {[10, 13, 15].map((h, j) =>
                (i + j) % 3 === 2 ? null : (
                  <a
                    key={h}
                    href={BOOK_URL}
                    target="_blank"
                    rel="noopener"
                    className="block rounded-[6px] border-l-[3px] border-[#4F46E5] bg-[rgba(79,70,229,0.16)] px-2 py-1.5 text-[11.5px] leading-tight outline-none hover:bg-[rgba(79,70,229,0.28)] focus-visible:ring-2 focus-visible:ring-[#818CF8]"
                  >
                    <span className="font-semibold">{h}:00</span>
                    <span className="block text-[var(--os-text-2)]">Free audit</span>
                  </a>
                ),
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="shrink-0 border-t border-[var(--os-border)] px-5 py-2 text-[11.5px] text-[var(--os-text-3)]">
        Slots are illustrative. Booking opens gitwork.co.uk, where the real calendar lives.
      </p>
    </div>
  );
}

/* Mail ────────────────────────────────────────────────────────────────────── */

export function MailView({ bridge }: { bridge: OsBridge }) {
  const [subject, setSubject] = useState("Our app is nearly there");
  const [body, setBody] = useState("");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SCRATCH_KEY);
      if (saved) setBody(saved);
    } catch {
      /* nothing to prefill */
    }
  }, []);
  function send() {
    const href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = href;
    bridge.notify({ title: "Mail", body: "Handed to your email app. We reply within a working day." });
  }
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--os-border)] px-4 py-2">
        <PrimaryButton onClick={send}>Send</PrimaryButton>
        <span className="text-[12px] text-[var(--os-text-3)]">Opens your own email app. Nothing is sent from here.</span>
      </div>
      <div className="divide-y divide-[var(--os-border)] border-b border-[var(--os-border)] text-[13px]">
        <p className="flex gap-2 px-4 py-2">
          <span className="w-16 text-[var(--os-text-3)]">To:</span>
          <span className="rounded-[4px] bg-[rgba(79,70,229,0.2)] px-1.5">Gitwork &lt;{CONTACT_EMAIL}&gt;</span>
        </p>
        <label className="flex items-center gap-2 px-4 py-1.5">
          <span className="w-16 text-[var(--os-text-3)]">Subject:</span>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="min-w-0 flex-1 border-0 bg-transparent py-0.5 text-[16px] shadow-none outline-none focus:shadow-none focus:ring-0 sm:text-[13px]"
          />
        </label>
      </div>
      <textarea
        aria-label="Message"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Tell us what you've built, what it runs on, and what's stopping it going live."
        className="min-h-[160px] flex-1 resize-none bg-[var(--os-paper)] px-4 py-3 text-[16px] leading-relaxed outline-none sm:text-[14px]"
      />
    </div>
  );
}

/* Terminal ────────────────────────────────────────────────────────────────── */

export function TerminalView({ onEffect }: { onEffect: (e: TerminalEffect) => void }) {
  const [lines, setLines] = useState<TerminalLine[]>([
    { kind: "out", text: `Last login: ${new Date().toLocaleString("en-GB")} on ttys001` },
    { kind: "accent", text: "Welcome to Gitwork OS. Type `help`." },
  ]);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [lines]);

  function submit() {
    const cmd = input.trim();
    setInput("");
    setCursor(null);
    if (!cmd) {
      setLines((l) => [...l, { kind: "in", text: "" }]);
      return;
    }
    setHistory((h) => [...h, cmd]);
    if (cmd === "clear") {
      setLines([]);
      return;
    }
    const res = runTerminal(cmd, { userName: "you", now: new Date() });
    setLines((l) => [...l, { kind: "in", text: cmd }, ...res.lines]);
    if (res.effect) onEffect(res.effect);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "ArrowUp" && history.length) {
      e.preventDefault();
      const next = cursor === null ? history.length - 1 : Math.max(0, cursor - 1);
      setCursor(next);
      setInput(history[next]);
    } else if (e.key === "ArrowDown" && cursor !== null) {
      e.preventDefault();
      const next = cursor + 1;
      if (next >= history.length) {
        setCursor(null);
        setInput("");
      } else {
        setCursor(next);
        setInput(history[next]);
      }
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      setLines([]);
    }
  }

  return (
    <div
      className="min-h-full bg-[#1E1E1E] px-3 py-2 font-[family-name:var(--font-mono)] text-[12.5px] leading-[1.55] text-[#D4D4D4]"
      onClick={() => field.current?.focus()}
    >
      {lines.map((l, i) => (
        <div
          key={i}
          className={cn(
            "whitespace-pre-wrap break-words",
            l.kind === "err" && "text-[#F87171]",
            l.kind === "accent" && "text-[#A5B4FC]",
          )}
        >
          {l.kind === "in" ? <Prompt /> : null}
          {l.text}
        </div>
      ))}
      <div className="flex items-center">
        <Prompt />
        <input
          ref={field}
          aria-label="Terminal command"
          value={input}
          autoFocus
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          // Inline, because the app's global focus treatment otherwise draws a box round
          // the prompt; a terminal's focus is its caret.
          style={{ outline: "none", boxShadow: "none" }}
          // 16px below sm so iOS Safari doesn't zoom the page on focus.
          className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[16px] text-white caret-[#A5B4FC] shadow-none outline-none ring-0 focus:shadow-none focus:outline-none focus:ring-0 sm:text-[12.5px]"
        />
      </div>
      <div ref={end} />
    </div>
  );
}

function Prompt() {
  return (
    <span className="mr-1.5">
      <span className="text-[#4ADE80]">you@gitwork</span> <span className="text-[#60A5FA]">~/half-built-app</span>{" "}
      <span className="text-[#A5B4FC]">%</span>
    </span>
  );
}

/* System Settings ─────────────────────────────────────────────────────────── */

export function SettingsView({ bridge }: { bridge: OsBridge }) {
  return (
    <div className="space-y-6 px-6 py-5">
      <section>
        <h2 className="text-[13px] font-semibold">Appearance</h2>
        <div className="mt-2 flex gap-3">
          {(["light", "dark"] as const).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => bridge.setAppearance(a)}
              aria-pressed={bridge.appearance === a}
              className="flex flex-col items-center gap-1.5 text-[12px] outline-none"
            >
              <span
                className={cn(
                  "block h-14 w-20 rounded-[8px] border-2",
                  bridge.appearance === a ? "border-[#4F46E5]" : "border-transparent",
                )}
                style={{ background: a === "dark" ? "linear-gradient(135deg,#1F1F23,#3F3F46)" : "linear-gradient(135deg,#FFFFFF,#E4E4E7)" }}
              />
              {a === "dark" ? "Dark" : "Light"}
            </button>
          ))}
        </div>
      </section>
      <section>
        <h2 className="text-[13px] font-semibold">Wallpaper</h2>
        <div className="mt-2 grid grid-cols-3 gap-3">
          {WALLPAPERS.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => bridge.setWallpaper(w.id)}
              aria-pressed={bridge.wallpaper === w.id}
              className="flex flex-col items-center gap-1.5 text-[12px] outline-none"
            >
              <span
                className={cn("block aspect-[16/10] w-full rounded-[8px] border-2", bridge.wallpaper === w.id ? "border-[#4F46E5]" : "border-transparent")}
                style={{ background: w.css }}
              />
              {w.label}
            </button>
          ))}
        </div>
      </section>
      <section className="rounded-[10px] border border-[var(--os-border)] bg-[var(--os-sidebar)] p-4">
        <h2 className="text-[13px] font-semibold">Reset this demo</h2>
        <p className="mt-1 text-[12.5px] text-[var(--os-text-2)]">Closes every window and forgets where you put them. Your notes stay.</p>
        <div className="mt-3">
          <SecondaryButton onClick={bridge.resetDesktop}>Reset desktop</SecondaryButton>
        </div>
      </section>
    </div>
  );
}

/* Trash ───────────────────────────────────────────────────────────────────── */

export function TrashView({ bridge }: { bridge: OsBridge }) {
  const [emptied, setEmptied] = useState(false);
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--os-border)] px-4 py-2">
        <span className="text-[12px] text-[var(--os-text-3)]">{emptied ? "Trash is empty" : `${GOT_RID_OF.length} items Gitwork threw out`}</span>
        <SecondaryButton
          onClick={() => {
            setEmptied(true);
            bridge.egg("confetti");
          }}
        >
          Empty
        </SecondaryButton>
      </div>
      {emptied ? (
        <p className="m-auto p-6 text-center text-[13px] text-[var(--os-text-2)]">
          Gone for good. What&apos;s left: fixed scope, fixed price, and you own the code.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--os-border)] overflow-auto">
          {GOT_RID_OF.map((g) => (
            <li key={g.name} className="flex items-center gap-3 px-4 py-2.5">
              <span className="text-[18px]" aria-hidden>
                🗑
              </span>
              <span>
                <span className="block text-[13px] font-medium">{g.name}</span>
                <span className="block text-[12px] text-[var(--os-text-3)]">{g.note}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* About This Mac ──────────────────────────────────────────────────────────── */

export function AboutView({ bridge }: { bridge: OsBridge }) {
  const rows: [string, string][] = [
    ["Chip", "Claude Code, reviewed by humans"],
    ["Memory", "Every decision, in Foundry"],
    ["Startup disk", "Your repo. You own it."],
    ["Warranty", "30 days post-launch support"],
    ["Quality gate", "UK, every release"],
    ["Serial number", GITWORK.companyNumber],
  ];
  return (
    <div className="flex flex-col items-center px-6 py-6 text-center">
      <span className="flex h-20 w-20 items-center justify-center rounded-[18px] bg-[linear-gradient(160deg,#6366F1,#1E1B4B)] text-white shadow-lg">
        <GitworkMark size={44} colour="#fff" />
      </span>
      <h2 className="mt-4 text-[22px] font-bold">Gitwork OS</h2>
      <p className="text-[12px] text-[var(--os-text-3)]">Version 2026 · {TAGLINE}</p>
      <dl className="mt-4 w-full space-y-1 text-left text-[12px]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt className="text-[var(--os-text-3)]">{k}</dt>
            <dd className="text-right">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-5">
        <SecondaryButton onClick={() => bridge.egg("vibe")}>Run a vibe check…</SecondaryButton>
      </div>
      <p className="mt-4 text-[10.5px] leading-relaxed text-[var(--os-text-3)]">
        {STRAPLINE}
        <br />
        {GITWORK.legalName} · Registered in {GITWORK.jurisdiction}
      </p>
    </div>
  );
}
