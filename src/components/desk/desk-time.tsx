"use client";

/**
 * On Your Desk — timezone helpers. Pure browser `Intl`, no deps, no AI.
 *
 * A UK/Pakistan agency: everyone sees their own local time plus the "other hub"
 * (admins get Islamabad, devs get London). We also compute the daily UK↔PK
 * working-hours overlap and render it in the viewer's local time.
 */

import { useEffect, useState } from "react";

const MONO = { fontFamily: "var(--font-mono)" } as const;

export const HQ_TZ = "Europe/London";
export const TEAM_TZ = "Asia/Karachi"; // Islamabad

/** Friendly hub names — Gitwork HQ is Manchester (Europe/London tz). */
const HUB_LABELS: Record<string, string> = {
  "Europe/London": "Manchester",
  "Asia/Karachi": "Islamabad",
};

/** A ticking clock — re-renders every `ms` so times/overlap stay live. */
export function useNow(ms = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

function fmtTime(date: Date, tz?: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: tz,
  }).format(date);
}

/** Offset (hours east of UTC) of a timezone at a given instant — DST-aware. */
function tzOffsetHours(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUTC - date.getTime()) / 3_600_000);
}

function cityLabel(tz: string): string {
  return HUB_LABELS[tz] ?? (tz.split("/").pop() ?? tz).replace(/_/g, " ");
}

/** Friendly 12-hour label for an hour-of-day (can be negative / >24 — wraps). */
function label12(h: number): string {
  const hh = ((Math.round(h) % 24) + 24) % 24;
  const ap = hh < 12 ? "am" : "pm";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}${ap}`;
}

/** Two inline mono clocks: the viewer's local time + a counterpart hub. */
export function WorldClocks({
  counterpartTz,
  counterpartLabel,
}: {
  counterpartTz: string;
  counterpartLabel: string;
}) {
  const now = useNow(30_000);
  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const clocks = [{ label: cityLabel(localTz), tz: localTz }];
  // Don't show a duplicate if the viewer is already in the counterpart zone.
  if (localTz !== counterpartTz) clocks.push({ label: counterpartLabel, tz: counterpartTz });

  return (
    <div
      className="flex items-center gap-2 text-[11px] uppercase tracking-[1.4px] text-[var(--text-4)]"
      style={MONO}
    >
      {clocks.map((c, i) => (
        <span key={c.label} className="flex items-center gap-2 whitespace-nowrap">
          {i > 0 ? <span className="text-[var(--border-1)]">·</span> : null}
          <span>
            {c.label} <span className="text-[var(--text-2)]">{fmtTime(now, c.tz)}</span>
          </span>
        </span>
      ))}
    </div>
  );
}

/**
 * Visual overlap: two 09:00–17:00 lanes (you + the other hub) on a shared local-time
 * axis, with the overlap column highlighted — so "your 9am = their 1pm" is obvious.
 */
export function TeamOverlap({
  counterpartTz,
  counterpartLabel,
}: {
  counterpartTz: string;
  counterpartLabel: string;
}) {
  const now = useNow(60_000);
  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const youLabel = cityLabel(localTz);

  // How many hours the counterpart is ahead of the viewer (DST-aware).
  const diff = tzOffsetHours(now, counterpartTz) - tzOffsetHours(now, localTz);
  const you = { start: 9, end: 17 };
  const them = { start: 9 - diff, end: 17 - diff }; // their workday expressed in your local hours
  const ovStart = Math.max(you.start, them.start);
  const ovEnd = Math.min(you.end, them.end);
  const hasOverlap = ovEnd - ovStart >= 0.5;

  const domStart = Math.min(you.start, them.start) - 1;
  const domEnd = Math.max(you.end, them.end) + 1;
  const span = domEnd - domStart || 1;
  const pos = (h: number) => ((h - domStart) / span) * 100;

  return (
    <div className="w-full rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-0)] p-3.5">
      <p className="text-sm text-[var(--text-2)]">
        Your <span className="font-semibold text-[var(--text-1)]">9am</span> is{" "}
        <span className="font-semibold text-[var(--brand-700)]">{label12(9 + diff)}</span> in{" "}
        {counterpartLabel}
      </p>

      <div className="relative mt-3 h-10">
        {hasOverlap ? (
          <div
            className="absolute inset-y-0 rounded-[4px] bg-[var(--surface-brand)] ring-1 ring-inset ring-[var(--brand-400)]"
            style={{ left: `${pos(ovStart)}%`, width: `${pos(ovEnd) - pos(ovStart)}%` }}
          />
        ) : null}
        <Lane label={youLabel} start={you.start} end={you.end} pos={pos} top />
        <Lane label={counterpartLabel} start={them.start} end={them.end} pos={pos} />
      </div>

      <p
        className="mt-2.5 text-[11px] uppercase tracking-[0.8px] text-[var(--text-4)]"
        style={MONO}
      >
        {hasOverlap ? `Overlap ${label12(ovStart)}–${label12(ovEnd)} your time` : "Little daily overlap"}
      </p>
    </div>
  );
}

function Lane({
  label,
  start,
  end,
  pos,
  top,
}: {
  label: string;
  start: number;
  end: number;
  pos: (h: number) => number;
  top?: boolean;
}) {
  return (
    <div className={`absolute left-0 right-0 h-4 ${top ? "top-0" : "bottom-0"}`}>
      <div
        className="absolute inset-y-0 flex items-center overflow-hidden rounded-[4px] bg-[var(--surface-1)] ring-1 ring-inset ring-[var(--border-2)]"
        style={{ left: `${pos(start)}%`, width: `${pos(end) - pos(start)}%` }}
      >
        <span
          className="truncate pl-1.5 text-[9px] uppercase tracking-[0.5px] text-[var(--text-4)]"
          style={MONO}
        >
          {label}
        </span>
      </div>
    </div>
  );
}
