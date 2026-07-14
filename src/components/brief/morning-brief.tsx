"use client";

/**
 * The Monday Brief — full-page read.
 *
 * A faithful rebuild of Dia's morning brief (painting hero, "push your work forward"
 * stamp, checkable to-dos with an all-done celebration, numbered updates, and a
 * two-column "your day" schedule), wrapped in Foundry's design language: DM Serif
 * Display hero + section rails, JetBrains Mono readouts, Gitwork Blue (never yellow),
 * cream canvas, hairline borders. Reuses the Desk's EditorialRow + scalloped Stamp so
 * it reads as part of the platform.
 *
 * Rendered as a full-screen overlay above everything (z-[200]); dismiss with the ✕,
 * Esc, or the grab handle. Data comes live from `useBrief`.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { XMarkIcon, SunIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { useBrief } from "@/hooks/use-brief";
import { EditorialRow, Stamp } from "@/components/desk/desk-shared";
import { SourceIcon, sourceKindFromLabel } from "@/components/brief/source-icons";
import type { Brief, BriefEvent, BriefTodo, BriefUpdate } from "@/types/brief";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function MorningBrief({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { brief, isPending, calendarConnected } = useBrief(open);

  // Esc closes; lock the page behind while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] overflow-y-auto bg-[var(--surface-canvas)]"
      role="dialog"
      aria-modal="true"
      aria-label={`The ${brief.weekday} Brief`}
    >
      {/* Close — fixed to the viewport so it's always reachable while scrolling. */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close the brief"
        className="fixed right-4 top-4 z-[210] inline-flex h-9 w-9 items-center justify-center rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)]/85 text-[var(--text-3)] backdrop-blur transition hover:border-[var(--brand-300)] hover:text-[var(--text-1)]"
      >
        <XMarkIcon className="h-5 w-5" />
      </button>

      <div className="mx-auto w-full max-w-[1040px] px-5 pb-24 sm:px-8">
        <BriefHero brief={brief} />

        <div className="mt-2">
          <PushForwardRow brief={brief} />
          <TodosRow todos={brief.todos} dateISO={brief.dateISO} />
          <UpdatesRow updates={brief.updates} />
          <ScheduleRow
            events={brief.events}
            pending={isPending}
            calendarConnected={calendarConnected}
          />
        </div>

        <BriefFooter sources={brief.sources} />
      </div>
    </div>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────

function BriefHero({ brief }: { brief: Brief }) {
  const [imgOk, setImgOk] = useState(true);
  const date = new Date(brief.dateISO);
  const dateRail = `${String(date.getDate()).padStart(2, "0")} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  const timeRail = date
    .toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    .replace(/\s?([AP]M)/, " $1");

  return (
    <header className="relative pt-16">
      {/* Vertical mono rails — date left, time right, hugging the painting. */}
      <span
        className="pointer-events-none absolute left-0 top-1/2 hidden -translate-y-1/2 text-[13px] tracking-[0.15em] text-[var(--text-3)] sm:block"
        style={{ fontFamily: "var(--font-mono)", writingMode: "vertical-rl", transform: "translateY(-50%) rotate(180deg)" }}
      >
        {dateRail}
      </span>
      <span
        className="pointer-events-none absolute right-0 top-1/2 hidden -translate-y-1/2 text-[13px] tracking-[0.15em] text-[var(--text-3)] sm:block"
        style={{ fontFamily: "var(--font-mono)", writingMode: "vertical-rl" }}
      >
        {timeRail}
      </span>

      {/* Painting frame — real oil painting, gradient fallback if it can't load. */}
      <div className="relative mx-auto aspect-[1160/600] w-full overflow-hidden rounded-[14px] shadow-[0_24px_70px_-28px_rgba(10,13,18,0.5)] ring-1 ring-inset ring-white/10 sm:w-[calc(100%-96px)]">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(160deg, var(--brand-700) 0%, var(--surface-dark, #0F172A) 55%, #060a16 100%)",
          }}
        />
        {imgOk ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brief.painting.src}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            onError={() => setImgOk(false)}
          />
        ) : null}
        {/* Soft legibility scrim — an even darken + centre vignette so white text keeps
            contrast on any painting, light or dark. */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(8,12,24,0.34) 0%, rgba(8,12,24,0.20) 38%, rgba(8,12,24,0.48) 100%), radial-gradient(120% 85% at 50% 46%, rgba(0,0,0,0.16) 0%, rgba(0,0,0,0.46) 100%)",
          }}
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          {/* Brand accent bar — the pop of Gitwork Blue, kept off the type for contrast. */}
          <span aria-hidden className="mb-4 h-[3px] w-10 rounded-full bg-[var(--brand-500)] shadow-[0_1px_8px_rgba(0,0,0,0.4)]" />
          <span
            className="text-[clamp(1.4rem,4cqw,2.6rem)] italic leading-none text-white/85"
            style={{ fontFamily: "var(--font-display)", textShadow: "0 2px 24px rgba(0,0,0,0.55)" }}
          >
            The
          </span>
          <h1
            className="text-[clamp(2.6rem,9vw,5.5rem)] leading-[0.95] tracking-[-0.01em] text-white"
            style={{ fontFamily: "var(--font-display)", textShadow: "0 3px 34px rgba(0,0,0,0.6), 0 1px 3px rgba(0,0,0,0.5)" }}
          >
            {brief.weekday} Brief
          </h1>
        </div>
      </div>

      {/* Blurb + caption row (blurb left, caption right — Dia's arrangement). */}
      <div className="mt-3 flex flex-col gap-1 px-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
        <p
          className="max-w-2xl text-[15px] italic leading-relaxed text-[var(--text-3)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {brief.greeting}
        </p>
        <p
          className="shrink-0 text-[11px] tracking-[0.02em] text-[var(--text-4)]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {brief.painting.caption}
        </p>
      </div>
    </header>
  );
}

// ── Push forward ────────────────────────────────────────────────────────────

function PushForwardRow({ brief }: { brief: Brief }) {
  const pf = brief.pushForward;

  // Clear-runway fallback — so the section always carries something warm, even on a
  // day with nothing overdue or in flight (otherwise the brief reads empty).
  if (!pf) {
    return (
      <EditorialRow
        title="Push your work forward"
        caption="The one thing to move first."
        stamp={<Stamp label="My board" href="/app" />}
      >
        <div className="flex items-start gap-3.5 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-brand)] p-5">
          <SunIcon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--brand-600)]" />
          <div>
            <h4 className="text-[17px] font-semibold leading-snug text-[var(--text-1)]">A clear runway</h4>
            <p className="mt-2 text-[15px] leading-relaxed text-[var(--text-2)]">
              Nothing overdue and nothing mid-flight. Pick the one thing that&apos;ll make today
              count — then protect the time for it.
            </p>
          </div>
        </div>
      </EditorialRow>
    );
  }

  return (
    <EditorialRow
      title="Push your work forward"
      caption="The one thing to move first."
      stamp={pf.href ? <Stamp label={pf.ctaLabel} href={pf.href} /> : undefined}
    >
      <div className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-brand)] p-5">
        <h4 className="text-[17px] font-semibold leading-snug text-[var(--text-1)]">{pf.title}</h4>
        <p className="mt-2 text-[15px] leading-relaxed text-[var(--text-2)]">{pf.body}</p>
      </div>
    </EditorialRow>
  );
}

// ── To-dos (checkable, localStorage, all-done celebration) ────────────────────

function TodosRow({ todos, dateISO }: { todos: BriefTodo[]; dateISO: string }) {
  const dateKey = dateISO.slice(0, 10);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [celebrated, setCelebrated] = useState(false);

  // Hydrate ticks from localStorage (per day, per todo).
  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const t of todos) {
      try {
        next[t.id] = localStorage.getItem(`gitwork.brief.${dateKey}.todo.${t.id}`) === "1";
      } catch {
        /* storage unavailable */
      }
    }
    setChecked(next);
  }, [dateKey, todos]);

  const allDone = todos.length > 0 && todos.every((t) => checked[t.id]);

  useEffect(() => {
    if (allDone) setCelebrated(true);
    else setCelebrated(false);
  }, [allDone]);

  function toggle(id: string) {
    setChecked((prev) => {
      const value = !prev[id];
      try {
        localStorage.setItem(`gitwork.brief.${dateKey}.todo.${id}`, value ? "1" : "0");
      } catch {
        /* ignore */
      }
      return { ...prev, [id]: value };
    });
  }

  if (todos.length === 0) return null;

  return (
    <EditorialRow title="Top to-dos" caption="Your board, distilled to three.">
      <div className="relative">
        <div className={cn("space-y-5 transition", allDone && "pointer-events-none blur-[6px] opacity-30")}>
          {todos.map((t) => (
            <TodoItem key={t.id} todo={t} checked={!!checked[t.id]} onToggle={() => toggle(t.id)} />
          ))}
        </div>
        {allDone ? <AllDone celebrate={celebrated} /> : null}
      </div>
    </EditorialRow>
  );
}

function TodoItem({
  todo,
  checked,
  onToggle,
}: {
  todo: BriefTodo;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <article className="flex items-start gap-3.5">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={`Mark "${todo.title}" done`}
        onClick={onToggle}
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition",
          checked
            ? "border-[var(--brand-600)] bg-[var(--brand-600)] text-white"
            : "border-[var(--border-1)] hover:border-[var(--brand-400)]",
        )}
      >
        {checked ? (
          <svg viewBox="0 0 14 14" className="h-3 w-3" fill="none">
            <path d="M3.5 7.5L6 10L10.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </button>
      <div className={cn("min-w-0 flex-1 transition", checked && "opacity-40")}>
        <div className="flex flex-wrap items-baseline gap-x-2">
          {todo.href ? (
            <Link href={todo.href} className={cn("text-[16px] font-semibold text-[var(--text-1)] hover:underline", checked && "line-through")}>
              {todo.title}
            </Link>
          ) : (
            <span className={cn("text-[16px] font-semibold text-[var(--text-1)]", checked && "line-through")}>{todo.title}</span>
          )}
          {todo.label ? <TagLabel label={todo.label} active={todo.labelStyle === "active"} /> : null}
        </div>
        <p className="mt-0.5 text-[14px] leading-relaxed text-[var(--text-3)]">{todo.body}</p>
      </div>
    </article>
  );
}

function AllDone({ celebrate }: { celebrate: boolean }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="relative w-full max-w-md rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] px-6 py-7 text-center shadow-[var(--shadow-sm)]">
        {celebrate ? <Confetti /> : null}
        <div className="relative z-[1] mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--brand-600)] text-white">
          <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none">
            <path d="M5 10.5L8.25 13.75L15 6.75" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h4 className="relative z-[1] text-[20px] italic text-[var(--text-1)]" style={{ fontFamily: "var(--font-display)" }}>
          You cleared every to-do.
        </h4>
        <p className="relative z-[1] mt-1 text-[14px] text-[var(--text-3)]">Nice work. The day is yours.</p>
      </div>
    </div>
  );
}

/** A small, self-contained confetti burst in the Gitwork blue family. */
function Confetti() {
  const pieces = useMemo(() => {
    // Deterministic-ish spread so it doesn't reshuffle on re-render.
    const colors = ["var(--brand-400)", "var(--brand-500)", "var(--brand-600)", "var(--brand-300)"];
    return Array.from({ length: 26 }, (_, i) => {
      const angle = (Math.PI * 2 * i) / 26 + (i % 3);
      const dist = 60 + (i % 5) * 26;
      return {
        tx: `${Math.cos(angle) * dist}px`,
        ty: `${Math.sin(angle) * dist - 10}px`,
        rot: `${(i * 47) % 360}deg`,
        color: colors[i % colors.length],
        delay: `${(i % 6) * 0.02}s`,
        dot: i % 2 === 0,
      };
    });
  }, []);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-visible motion-reduce:hidden">
      <style>{`@keyframes briefConfetti{0%{opacity:1;transform:translate(-50%,-50%) rotate(0) scale(1)}100%{opacity:0;transform:translate(calc(-50% + var(--tx)),calc(-50% + var(--ty))) rotate(var(--rot)) scale(0.6)}}`}</style>
      {pieces.map((p, i) => (
        <span
          key={i}
          style={
            {
              position: "absolute",
              left: "50%",
              top: "40%",
              width: p.dot ? 7 : 4,
              height: 7,
              background: p.color,
              borderRadius: p.dot ? "9999px" : "1px",
              "--tx": p.tx,
              "--ty": p.ty,
              "--rot": p.rot,
              animation: `briefConfetti 1.6s cubic-bezier(0.22,0.61,0.36,1) ${p.delay} forwards`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

// ── Updates ────────────────────────────────────────────────────────────────

function UpdatesRow({ updates }: { updates: BriefUpdate[] }) {
  if (updates.length === 0) return null;
  return (
    <EditorialRow title="New updates" caption="What moved since you last looked.">
      <div className="space-y-6">
        {updates.map((u, i) => (
          <article key={u.id} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
            <span className="pt-1 text-[12px] text-[var(--text-4)]" style={{ fontFamily: "var(--font-mono)" }}>
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <SourceIcon
                  kind={u.source === "slack" ? "slack" : u.source === "calendar" ? "gcal" : "scribe"}
                  className={cn(
                    "h-[15px] w-[15px] translate-y-[2px]",
                    u.source === "scribe" && "text-[var(--text-4)]",
                  )}
                />
                {u.href ? (
                  <Link href={u.href} className="text-[16px] font-semibold text-[var(--text-1)] hover:underline">
                    {u.title}
                  </Link>
                ) : (
                  <span className="text-[16px] font-semibold text-[var(--text-1)]">{u.title}</span>
                )}
                {u.label ? <TagLabel label={u.label} active={u.labelStyle === "active"} /> : null}
              </div>
              <p className="mt-0.5 text-[14px] leading-relaxed text-[var(--text-3)]">{u.body}</p>
            </div>
          </article>
        ))}
      </div>
    </EditorialRow>
  );
}

// ── Your day (two-column schedule + detail) ──────────────────────────────────

function ScheduleRow({
  events,
  pending,
  calendarConnected,
}: {
  events: BriefEvent[];
  pending: boolean;
  calendarConnected: boolean | undefined;
}) {
  const defaultIdx = useMemo(() => {
    const n = events.findIndex((e) => e.isNext || e.isNow);
    return n >= 0 ? n : 0;
  }, [events]);
  const [active, setActive] = useState(defaultIdx);
  useEffect(() => setActive(defaultIdx), [defaultIdx]);

  let body: React.ReactNode;
  if (pending) {
    body = <div className="h-40 animate-pulse rounded-[10px] bg-[var(--surface-1)]" />;
  } else if (calendarConnected === false) {
    body = (
      <div className="rounded-[10px] border border-dashed border-[var(--border-2)] px-4 py-8 text-center">
        <p className="text-sm text-[var(--text-4)]">Connect Google to see today&apos;s schedule.</p>
        <Link href="/app/settings/account" className="mt-2 inline-block text-sm font-medium text-[var(--brand-700)] hover:underline">
          Connect in Settings →
        </Link>
      </div>
    );
  } else if (events.length === 0) {
    body = (
      <div className="flex flex-col items-center gap-2 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-9 text-center">
        <SunIcon className="h-6 w-6 text-[var(--brand-500)]" />
        <p className="text-sm text-[var(--text-3)]">No meetings today — clear runway.</p>
      </div>
    );
  } else {
    const current = events[active] ?? events[0];
    body = (
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* Left: the time rail. */}
        <div className="flex flex-col">
          {events.map((ev, i) => (
            <button
              key={ev.id}
              type="button"
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
              className={cn(
                "flex items-baseline gap-3 rounded-[6px] px-2 py-1.5 text-left transition",
                i === active ? "bg-[var(--surface-1)]" : "hover:bg-[var(--surface-1)]",
              )}
            >
              <span className="w-16 shrink-0 text-[13px] text-[var(--text-4)]" style={{ fontFamily: "var(--font-mono)" }}>
                {fmtRail(ev.time)}
              </span>
              <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-[var(--text-1)]">{ev.title}</span>
              {ev.isNow ? (
                <span className="shrink-0 text-[10px] uppercase tracking-[1px] text-[var(--brand-700)]" style={{ fontFamily: "var(--font-mono)" }}>
                  Now
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Right: detail of the selected event. */}
        <div className="relative rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] p-5">
          <p className="text-[11px] uppercase tracking-[1px] text-[var(--text-4)]" style={{ fontFamily: "var(--font-mono)" }}>
            {current.time}
            {current.endTime ? ` – ${current.endTime}` : ""}
          </p>
          <h4 className="mt-1 text-[18px] font-semibold leading-snug text-[var(--text-1)]">{current.title}</h4>
          {current.note ? <p className="mt-1.5 text-[14px] text-[var(--text-3)]">{current.note}</p> : null}
          {current.attendees.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {current.attendees.slice(0, 6).map((a) => (
                <span key={a} className="rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2 py-0.5 text-[12px] text-[var(--text-3)]">
                  {a.split("@")[0]}
                </span>
              ))}
              {current.attendees.length > 6 ? (
                <span className="px-1 py-0.5 text-[12px] text-[var(--text-4)]">+{current.attendees.length - 6}</span>
              ) : null}
            </div>
          ) : null}
          {current.joinUrl ? (
            <div className="mt-4">
              <Stamp label="Join" href={current.joinUrl} />
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <EditorialRow title="Your day" caption="Today's agenda, hour by hour.">
      {body}
    </EditorialRow>
  );
}

/** "10:00 AM" → "10:00a" to match the platform's compact time rails. */
function fmtRail(time: string): string {
  return time.replace(/\s?AM/i, "a").replace(/\s?PM/i, "p");
}

// ── Shared bits ───────────────────────────────────────────────────────────────

function TagLabel({ label, active }: { label: string; active?: boolean }) {
  return (
    <span
      className={cn("text-[13px] italic", active ? "text-[var(--brand-700)]" : "text-[var(--text-4)]")}
      style={{ fontFamily: "var(--font-display)" }}
    >
      {label}
    </span>
  );
}

function BriefFooter({ sources }: { sources: string[] }) {
  return (
    <footer className="relative mt-16 overflow-hidden border-t border-[var(--border-2)] pb-10 pt-10 text-center">
      {/* Halftone flourish — a dot field fading up from the base (Dia's finishing touch),
          in currentColor so it reads on cream or navy. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-32 text-[var(--text-4)]"
        style={{
          backgroundImage: "radial-gradient(currentColor 0.6px, transparent 0.6px)",
          backgroundSize: "7px 7px",
          opacity: 0.22,
          maskImage: "radial-gradient(ellipse 65% 100% at 50% 120%, #000 0%, transparent 72%)",
          WebkitMaskImage: "radial-gradient(ellipse 65% 100% at 50% 120%, #000 0%, transparent 72%)",
        }}
      />
      <p className="relative text-[15px] leading-relaxed text-[var(--text-3)]" style={{ fontFamily: "var(--font-display)" }}>
        <span className="text-[var(--text-4)]">Assembled for you by </span>
        <span className="font-medium text-[var(--text-1)]">Foundry</span>
        {sources.length ? <span className="text-[var(--text-4)]"> using your </span> : null}
        {sources.map((s, i) => (
          <span key={s} className="whitespace-nowrap">
            {i === 0 ? null : i === sources.length - 1 ? (
              <span className="text-[var(--text-4)]"> and </span>
            ) : (
              <span className="text-[var(--text-4)]">, </span>
            )}
            <SourceIcon
              kind={sourceKindFromLabel(s)}
              className="mr-1 inline-block h-[15px] w-[15px] align-[-3px] text-[var(--text-3)]"
            />
            <span className="text-[var(--text-2)]">{s}</span>
          </span>
        ))}
        <span className="text-[var(--text-4)]">.</span>
      </p>
      <p className="mt-2 text-[11px] tracking-[0.3px] text-[var(--text-4)]" style={{ fontFamily: "var(--font-mono)" }}>
        With care, from Gitwork
      </p>
    </footer>
  );
}
