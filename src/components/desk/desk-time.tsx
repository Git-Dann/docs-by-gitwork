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
  return (tz.split("/").pop() ?? tz).replace(/_/g, " ");
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

/** UTC instants for a hub's `startH`–`endH` local workday on today's date. */
function hubWorkday(now: Date, tz: string, startH = 9, endH = 17): { start: number; end: number } {
  const off = tzOffsetHours(now, tz);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  // local wall-clock W ⇒ UTC = W − offset (Date.UTC normalises hour over/underflow)
  return {
    start: Date.UTC(y, m, d, startH - off),
    end: Date.UTC(y, m, d, endH - off),
  };
}

/** The daily London↔Karachi 09:00–17:00 overlap, rendered in the viewer's local time. */
export function TeamOverlap() {
  const now = useNow(60_000);
  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const ldn = hubWorkday(now, HQ_TZ);
  const khi = hubWorkday(now, TEAM_TZ);
  const start = Math.max(ldn.start, khi.start);
  const end = Math.min(ldn.end, khi.end);

  const label =
    end - start < 30 * 60_000
      ? "Limited overlap"
      : `Overlap ${fmtTime(new Date(start), localTz)}–${fmtTime(new Date(end), localTz)}`;

  return (
    <span
      className="inline-flex items-center rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] px-2.5 py-1 text-[11px] uppercase tracking-[0.8px] text-[var(--text-3)]"
      style={MONO}
    >
      {label}
    </span>
  );
}
