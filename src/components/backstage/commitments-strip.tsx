"use client";

import { ArrowRightIcon } from "@heroicons/react/24/outline";
import { groupOpenCommitments } from "@/lib/commitments";
import { useCommitments } from "@/hooks/use-commitments";

/** One line on the Backstage landing: what you've promised, and what's waiting to be accepted. */
export function CommitmentsStrip({ onOpen }: { onOpen: () => void }) {
  const { data } = useCommitments();
  const items = data?.commitments ?? [];
  const open = items.filter((c) => c.state === "open").length;
  const overdue = groupOpenCommitments(items, new Date()).find((g) => g.id === "overdue")?.items.length ?? 0;
  const suggested = items.filter((c) => c.state === "suggested").length;
  const parts = data
    ? [`${open} open`, overdue ? `${overdue} overdue` : null, suggested ? `${suggested} to review` : null].filter(Boolean)
    : ["…"];
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex h-11 w-full items-center gap-3 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] px-4 text-left transition hover:border-[var(--brand-300)]"
    >
      <span className="widget-header__label shrink-0">COMMITMENTS</span>
      <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text-2)]" title={parts.join(" · ")}>
        {parts.join(" · ")}
      </span>
      {overdue > 0 && <span className="widget-status-dot widget-status-dot--danger shrink-0" aria-hidden />}
      <ArrowRightIcon className="h-3.5 w-3.5 shrink-0 text-[var(--text-4)] transition group-hover:translate-x-0.5 group-hover:text-[var(--brand-600)]" aria-hidden />
    </button>
  );
}
