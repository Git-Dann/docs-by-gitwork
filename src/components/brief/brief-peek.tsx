"use client";

/**
 * The Monday Brief — peek.
 *
 * A small framed card that "peeks" from the top of On Your Desk (the TODAY tab):
 * a painting thumbnail, the day's masthead, and a one-line readout. Clicking it
 * opens the full-page brief. Dismissable with the ✕ (hidden for the rest of today
 * via localStorage; it returns tomorrow). The full page is dismissable in its own
 * right (✕ / Esc), so the brief can be closed from either level.
 */

import { useEffect, useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { useTaskAttention } from "@/hooks/use-tasks";
import { useBrief } from "@/hooks/use-brief";
import { MorningBrief } from "./morning-brief";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function BriefPeek() {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(true); // default hidden until we read storage
  const [imgOk, setImgOk] = useState(true);

  // The peek reads only light data (painting is date-derived; brief build here stays
  // cheap because we don't enable the Google/Slack queries — that happens on open).
  const { brief } = useBrief(false);
  const attention = useTaskAttention({ mine: true });

  const dateKey = brief.dateISO.slice(0, 10);
  const storageKey = `gitwork.brief.peek-dismissed.${dateKey}`;

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(storageKey) === "1");
    } catch {
      setDismissed(false);
    }
  }, [storageKey]);

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      /* ignore */
    }
  }

  const date = new Date(brief.dateISO);
  const eyebrow = `${brief.weekday.slice(0, 3).toUpperCase()} ${date.getDate()} ${MONTHS[date.getMonth()].toUpperCase()} // THE BRIEF`;

  const overdue = attention.data?.overdueCount ?? 0;
  const doing = attention.data?.doingCount ?? 0;
  const dueSoon = attention.data?.dueSoonCount ?? 0;
  const summaryParts: string[] = [];
  if (overdue > 0) summaryParts.push(`${overdue} overdue`);
  if (doing > 0) summaryParts.push(`${doing} in flight`);
  if (dueSoon > 0) summaryParts.push(`${dueSoon} due soon`);
  const summary = summaryParts.length ? summaryParts.join(" · ") : "A clear day ahead";

  return (
    <>
      {!dismissed ? (
        <div className="relative mb-5">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="group flex w-full items-center gap-4 overflow-hidden rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] p-2.5 pr-14 text-left transition hover:border-[var(--brand-300)] hover:shadow-[var(--shadow-xs)]"
          >
            {/* Painting thumbnail (gradient fallback). */}
            <span className="relative block h-14 w-20 shrink-0 overflow-hidden rounded-[6px]">
              <span
                aria-hidden
                className="absolute inset-0"
                style={{ background: "linear-gradient(160deg, var(--brand-700) 0%, var(--surface-dark, #0F172A) 100%)" }}
              />
              {imgOk ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={brief.painting.src}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover"
                  onError={() => setImgOk(false)}
                />
              ) : null}
            </span>

            <span className="min-w-0 flex-1">
              <span
                className="block text-[10px] uppercase tracking-[1.4px] text-[var(--text-4)]"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {eyebrow}
              </span>
              <span
                className="mt-0.5 block truncate text-[19px] leading-tight text-[var(--text-1)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                The <span className="italic text-[var(--brand-700)]">{brief.weekday}</span> Brief
              </span>
              <span className="mt-0.5 block truncate text-[12px] text-[var(--text-3)]">{summary}</span>
            </span>

            <span
              className={cn(
                "shrink-0 self-center text-[11px] uppercase tracking-[1px] text-[var(--text-4)] transition group-hover:text-[var(--brand-700)]",
              )}
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Read →
            </span>
          </button>

          {/* Dismiss (hide for today) — separate from opening the brief. */}
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss today's brief"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-[var(--text-4)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      <MorningBrief open={open} onClose={() => setOpen(false)} />
    </>
  );
}
