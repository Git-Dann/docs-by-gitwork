"use client";

import type { PulseScanDiff, ScoreBreakdown } from "@/types/pulse";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn, formatRelative } from "@/lib/format";
import { describeRelevance } from "./scan-helpers";

export function AiUnavailable({ aiError }: { aiError: string | null }) {
  return (
    <div className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-8 text-center">
      <p className="text-sm font-semibold text-[var(--text-2)]">AI analysis not available</p>
      {aiError ? (
        <p className="mt-2 text-sm text-[var(--text-3)]">{aiError}</p>
      ) : (
        <p className="mt-2 text-sm text-[var(--text-3)]">
          Configure an AI provider in <strong>Settings → Integrations</strong> to see this section.
        </p>
      )}
    </div>
  );
}

// Plain-English "Why this score?" — a portal popover so it overlays (never shifts
// the score) and can't be clipped by the widget card's overflow.
export function ScoreExplainer({
  breakdown,
  score,
  previousScore,
  diff,
}: {
  breakdown: ScoreBreakdown;
  score: number;
  previousScore: number | null;
  diff: PulseScanDiff | null;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  function toggle() {
    if (!open && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      const width = 296;
      // Anchor under the trigger, clamped into the viewport.
      const left = Math.min(Math.max(8, r.left + r.width / 2 - width / 2), window.innerWidth - width - 8);
      setCoords({ top: r.bottom + 8, left });
    }
    setOpen((v) => !v);
  }

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (panelRef.current && !panelRef.current.contains(t) && triggerRef.current && !triggerRef.current.contains(t)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const capped = breakdown.capsApplied.length > 0;
  const isV3 = breakdown.scoreVersion === "pulse-score-v3";
  const delta = previousScore !== null ? score - previousScore : null;

  // What moved since the last scan, in plain words.
  const changeParts: string[] = [];
  if (diff) {
    if (diff.fixed.length) changeParts.push(`${diff.fixed.length} fixed`);
    if (diff.regressed.length) changeParts.push(`${diff.regressed.length} regressed`);
    if (diff.newIssues.length) changeParts.push(`${diff.newIssues.length} new ${diff.newIssues.length === 1 ? "issue" : "issues"}`);
    // Stated alongside the fixes, never omitted while a fix count is shown —
    // "4 fixed" beside a silent 7 that stopped being checkable is the reading
    // this whole bucket exists to prevent.
    if (diff.unverified.length) changeParts.push(`${diff.unverified.length} no longer verifiable`);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        className="w-full max-w-[12rem] text-center text-xs font-medium text-[var(--brand-600)] hover:underline"
      >
        Why this score?
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          style={{ position: "fixed", top: coords.top, left: coords.left, width: 296 }}
          className="z-[9999] rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] p-3.5 text-left shadow-xl"
        >
          <p className="text-sm font-semibold text-[var(--text-1)]">How this score works</p>
          {isV3 ? (
            <p className="mt-1.5 text-xs leading-5 text-[var(--text-2)]">
              Score v3 weights each applicable control by impact, evidence strength and confidence. Correlated controls share weight,
              and every category has a fixed contribution so adding weak checks cannot dilute a material failure. The result is{" "}
              <span className="font-semibold tabular-nums text-[var(--text-1)]">{breakdown.rawScore}/100</span> at{" "}
              <span className="font-semibold tabular-nums text-[var(--text-1)]">{breakdown.completeness}% completeness</span>, with a{" "}
              {breakdown.lowerBound}–{breakdown.upperBound} uncertainty interval.
            </p>
          ) : (
            <p className="mt-1.5 text-xs leading-5 text-[var(--text-2)]">
              Legacy scans award full points for a pass, half for a warning and none for a fail. This scan earned{" "}
              <span className="font-semibold tabular-nums text-[var(--text-1)]">{breakdown.earnedWeight}</span> of{" "}
              <span className="font-semibold tabular-nums text-[var(--text-1)]">{breakdown.totalWeight}</span> weighted points.
            </p>
          )}

          {capped && (
            <div className="mt-2 space-y-1 rounded-[6px] bg-red-50 p-2">
              {breakdown.capsApplied.map((c) => (
                <p key={c.cap} className="text-[11px] leading-4 text-red-700">
                  Held at {breakdown.finalScore}: {c.reason}
                </p>
              ))}
            </div>
          )}

          {/* What DIDN'T run. `completeness` is a percentage with no account of
              itself unless the collectors behind it are named — and a collector
              that could not run for a reason the customer controls is the most
              actionable thing on this panel. */}
          {breakdown.collectors && (breakdown.collectors.failed > 0 || breakdown.collectors.unavailable.length > 0) && (
            <div className="mt-2.5 border-t border-[var(--border-2)] pt-2">
              <p className="widget-data-label mb-1.5">What Pulse could not check</p>
              {breakdown.collectors.failed > 0 && (
                <p className="text-[11px] leading-4 text-amber-700">
                  {breakdown.collectors.failed} collector{breakdown.collectors.failed === 1 ? "" : "s"} failed
                  ({breakdown.collectors.failedNames.join(", ")}). Those families are unknown, not passing.
                </p>
              )}
              {/* The three source collectors share one reason — state it once,
                  not once per collector. */}
              {[...new Set(breakdown.collectors.unavailable.map((item) => item.reason))].map((reason) => (
                <p key={reason} className="text-[11px] leading-4 text-[var(--text-3)]">{reason}</p>
              ))}
            </div>
          )}

          {/* What was LEFT OUT, and why — once, in a sentence. The checks themselves are
              never stored: the report shows only what is about this product. */}
          {breakdown.relevance && breakdown.relevance.hidden > 0 && (
            <div className="mt-2.5 border-t border-[var(--border-2)] pt-2">
              <p className="widget-data-label mb-1.5">Scoped to this product</p>
              <p className="text-[11px] leading-4 text-[var(--text-3)]">{describeRelevance(breakdown.relevance)}</p>
            </div>
          )}

          <div className="mt-2.5 border-t border-[var(--border-2)] pt-2">
            <p className="widget-data-label mb-1.5">Where the points came from</p>
            <div className="space-y-1">
              {breakdown.byCategory.slice(0, 8).map((cat) => {
                const total = cat.pass + cat.warn + cat.fail;
                return (
                  <div key={cat.category} className="flex items-baseline justify-between gap-2 text-[11px] leading-4">
                    <span className="truncate text-[var(--text-3)]">
                      {cat.category}
                      {cat.weight === 2 && <span className="text-[var(--text-4)]"> ·2×</span>}
                    </span>
                    <span className="shrink-0 tabular-nums text-[var(--text-2)]">
                      {cat.pass}/{total} passed{cat.unknown ? ` · ${cat.unknown} unknown` : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {delta !== null && delta !== 0 && (
            <div className="mt-2.5 border-t border-[var(--border-2)] pt-2">
              <p className="widget-data-label mb-1">
                Since last scan{diff?.previousCompletedAt ? ` · ${formatRelative(diff.previousCompletedAt)}` : ""}
              </p>
              <p className="text-xs leading-5 text-[var(--text-2)]">
                <span className={cn("font-semibold tabular-nums", delta > 0 ? "text-emerald-600" : "text-red-600")}>
                  {delta > 0 ? "+" : ""}{delta} points
                </span>
                {changeParts.length > 0 ? ` — ${changeParts.join(", ")}.` : "."}
              </p>
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
