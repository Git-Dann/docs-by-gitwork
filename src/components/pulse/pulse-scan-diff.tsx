import Link from "next/link";
import { cn, formatDate } from "@/lib/format";
import type { PulseScanDiff } from "@/types/pulse";

/**
 * What changed between two scans, in plain words first and check names second. Shared by
 * the scan page ("since last scan") and the compare page (any two scans), so both say the
 * same thing the same way.
 */

const GROUPS = [
  { key: "regressed", label: "Got worse", hint: "Was passing, now a problem.", tone: "text-[var(--danger-500)]", sign: "▼" },
  { key: "newIssues", label: "New problems", hint: "Not seen on the earlier scan.", tone: "text-[var(--warning-500)]", sign: "+" },
  { key: "fixed", label: "Fixed", hint: "Was a problem, now passing, with proof.", tone: "text-[var(--success-500)]", sign: "✓" },
] as const;

export function ScoreChange({ diff }: { diff: PulseScanDiff }) {
  const by = diff.scoreChange;
  return (
    <span className="tabular-nums">
      {diff.previousScore ?? "?"} → {diff.currentScore ?? "?"}{" "}
      <span className={cn(by > 0 ? "text-[var(--success-500)]" : by < 0 ? "text-[var(--danger-500)]" : "text-[var(--text-4)]")}>
        ({by > 0 ? "+" : ""}{by})
      </span>
    </span>
  );
}

export function ScanDiffBody({ diff, previousHref, showDate = true }: { diff: PulseScanDiff; previousHref?: string; showDate?: boolean }) {
  const changed = diff.fixed.length + diff.regressed.length + diff.newIssues.length + diff.unverified.length;
  return (
    <div className="space-y-3">
      <p className="text-sm leading-6 text-[var(--text-1)]">
        {changed === 0 ? "Nothing changed in what Pulse checked." : diff.summary}
        {showDate && diff.previousCompletedAt && (
          <span className="text-[var(--text-3)]">
            {" "}Compared with the scan of {formatDate(diff.previousCompletedAt)}
            {previousHref && (
              <>
                {" "}(<Link href={previousHref} className="text-[var(--brand-600)] hover:underline">open it</Link>)
              </>
            )}
            .
          </span>
        )}
      </p>

      {GROUPS.map((g) => {
        const items = diff[g.key];
        if (items.length === 0) return null;
        return (
          <div key={g.key}>
            <p className={cn("widget-data-label", g.tone)}>{g.sign} {g.label} ({items.length})</p>
            <p className="text-[11px] text-[var(--text-4)]">{g.hint}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {items.slice(0, 12).map((it) => (
                <span key={it.checkKey} className="rounded-[6px] border border-[var(--border-2)] px-2 py-0.5 text-xs text-[var(--text-2)]" title={it.category}>
                  {it.label}
                </span>
              ))}
              {items.length > 12 && <span className="text-xs text-[var(--text-4)]">+{items.length - 12} more</span>}
            </div>
          </div>
        );
      })}

      {/* Its own block, with the reason, because "we stopped being able to check this" reads as
          "sorted" the moment it is reduced to a label. Neutral colour: not a finding about the product. */}
      {diff.unverified.length > 0 && (
        <div className="border-t border-[var(--border-2)] pt-3">
          <p className="widget-data-label text-[var(--text-3)]">? Couldn&apos;t check this time ({diff.unverified.length})</p>
          <p className="mt-1 text-xs leading-5 text-[var(--text-3)]">
            These were problems on the earlier scan. This one could not confirm or clear them, so they are still outstanding, not fixed.
          </p>
          <ul className="mt-2 space-y-1.5">
            {diff.unverified.slice(0, 6).map((it) => (
              <li key={it.checkKey} className="text-xs leading-5">
                <span className="text-[var(--text-1)]">{it.label}</span>
                <span className="text-[var(--text-3)]">: {it.detail}</span>
              </li>
            ))}
          </ul>
          {diff.unverified.length > 6 && <p className="mt-1 text-xs text-[var(--text-4)]">+{diff.unverified.length - 6} more</p>}
        </div>
      )}
    </div>
  );
}
