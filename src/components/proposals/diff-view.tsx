/**
 * Side-by-side / unified diff renderer for section data. Used by AI proposals (P2.10) and
 * version snapshots (P1.6).
 *
 * Compact and print-safe. No syntax highlighting beyond the +/- gutter colour.
 */

"use client";

import { diffLines, diffStats, type DiffLine } from "@/lib/section-diff";

interface DiffViewProps {
  before: unknown;
  after: unknown;
  /** Optional one-line summary to render above the diff. */
  summary?: string;
}

export function DiffView({ before, after, summary }: DiffViewProps) {
  const lines = diffLines(before, after);
  const stats = diffStats(lines);

  return (
    <div className="rounded-[10px] border border-[var(--border-2)] bg-white">
      <div className="flex items-baseline justify-between border-b border-[var(--border-3)] px-3 py-2">
        {summary ? (
          <p className="truncate text-sm font-medium text-[var(--text-1)]">{summary}</p>
        ) : (
          <p className="text-sm font-medium text-[var(--text-3)]">Proposed change</p>
        )}
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em]">
          <span className="text-[var(--success-500)]">+{stats.added}</span>
          <span className="mx-1 text-[var(--text-4)]">·</span>
          <span className="text-[var(--danger-500)]">−{stats.removed}</span>
        </p>
      </div>
      <pre
        className="max-h-[360px] overflow-auto px-3 py-2 text-[12px] leading-[1.5]"
        style={{ fontFamily: "var(--font-mono), monospace" }}
      >
        {lines.map((line, i) => (
          <DiffRow key={i} line={line} />
        ))}
      </pre>
    </div>
  );
}

function DiffRow({ line }: { line: DiffLine }) {
  const bg =
    line.kind === "added"
      ? "bg-[var(--success-50)]"
      : line.kind === "removed"
        ? "bg-[var(--danger-50)]"
        : "";
  const sign =
    line.kind === "added"
      ? "+"
      : line.kind === "removed"
        ? "−"
        : " ";
  const colour =
    line.kind === "added"
      ? "text-[var(--success-500)]"
      : line.kind === "removed"
        ? "text-[var(--danger-500)]"
        : "text-[var(--text-4)]";
  return (
    <div className={`flex items-start gap-2 ${bg}`}>
      <span className={`select-none ${colour}`}>{sign}</span>
      <span className="flex-1 whitespace-pre-wrap text-[var(--text-2)]">{line.text || " "}</span>
    </div>
  );
}
