"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRightIcon, FunnelIcon, MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import type { DevSignalAssessmentDTO } from "@/types/devsignal";

/**
 * Dense, searchable, filterable, paginated assessment list — mirrors the Pulse
 * scan list so DevSignal reads as one system and stays manageable at hundreds of
 * candidates (the old card grid didn't scale). Search + filters + sort + a 50-row
 * render window with "Load more".
 */

const PAGE_SIZE = 50;

type StatusFilter = "ALL" | "DRAFT" | "RUNNING" | "PENDING_HUMAN" | "COMPLETED" | "FAILED" | "ARCHIVED";
type DecisionFilter = "ALL" | "NONE" | "APPROVED_FOR_STAGING" | "APPROVED_FOR_CODE" | "REJECTED" | "NEEDS_MORE_INFO";
type ScoredFilter = "ALL" | "SCORED" | "UNSCORED";
type CodeFilter = "ALL" | "IN_CODE" | "NOT";
type SortKey = "NEWEST" | "OLDEST" | "SCORE_HIGH" | "SCORE_LOW";

const STATUS_STYLE: Record<string, string> = {
  DRAFT: "border-[var(--border-2)] bg-[var(--surface-1)] text-[var(--text-3)]",
  RUNNING: "border-sky-200 bg-sky-50 text-sky-700",
  PENDING_HUMAN: "border-amber-200 bg-amber-50 text-amber-700",
  COMPLETED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  FAILED: "border-rose-200 bg-rose-50 text-rose-700",
  ARCHIVED: "border-[var(--border-2)] bg-[var(--surface-1)] text-[var(--text-4)]",
};

const GRID_COLS = "1fr 9rem 7rem 3.5rem 5rem 6rem";

function FilterOption<T extends string>({ value, active, onClick, children }: { value: T; active: boolean; onClick: (v: T) => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-[6px] px-3 py-2 text-left text-sm transition",
        active ? "bg-[var(--surface-brand)] font-medium text-[var(--brand-700)]" : "text-[var(--text-2)] hover:bg-[var(--surface-1)]",
      )}
    >
      <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2", active ? "border-[var(--brand-600)] bg-[var(--brand-600)]" : "border-[var(--border-2)]")}>
        {active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
      </span>
      {children}
    </button>
  );
}

function FiltersDropdown({
  status,
  decision,
  scored,
  code,
  onStatus,
  onDecision,
  onScored,
  onCode,
  onClear,
}: {
  status: StatusFilter;
  decision: DecisionFilter;
  scored: ScoredFilter;
  code: CodeFilter;
  onStatus: (v: StatusFilter) => void;
  onDecision: (v: DecisionFilter) => void;
  onScored: (v: ScoredFilter) => void;
  onCode: (v: CodeFilter) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const activeCount = [status !== "ALL", decision !== "ALL", scored !== "ALL", code !== "ALL"].filter(Boolean).length;

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-2 rounded-[10px] border px-3 py-2 text-sm font-medium transition",
          activeCount > 0 ? "border-[var(--brand-400)] bg-[var(--surface-brand)] text-[var(--brand-700)]" : "border-[var(--border-2)] bg-white text-[var(--text-2)] hover:bg-[var(--surface-1)]",
        )}
      >
        <FunnelIcon className="h-4 w-4 shrink-0" />
        <span>Filters</span>
        {activeCount > 0 && <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--brand-600)] text-[10px] font-bold text-white">{activeCount}</span>}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1.5 max-h-[70vh] w-60 overflow-y-auto rounded-[10px] border border-[var(--border-2)] bg-white p-3 shadow-lg">
          <p className="px-3 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-4)]">Status</p>
          {(["ALL", "DRAFT", "RUNNING", "PENDING_HUMAN", "COMPLETED", "FAILED", "ARCHIVED"] as StatusFilter[]).map((s) => (
            <FilterOption key={s} value={s} active={status === s} onClick={onStatus}>
              {s === "ALL" ? "All statuses" : s.replace("_", " ").toLowerCase()}
            </FilterOption>
          ))}
          <div className="my-2 border-t border-[var(--border-2)]" />
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-4)]">Decision</p>
          {(["ALL", "NONE", "APPROVED_FOR_STAGING", "APPROVED_FOR_CODE", "REJECTED", "NEEDS_MORE_INFO"] as DecisionFilter[]).map((d) => (
            <FilterOption key={d} value={d} active={decision === d} onClick={onDecision}>
              {d === "ALL" ? "Any decision" : d.replace(/_/g, " ").toLowerCase()}
            </FilterOption>
          ))}
          <div className="my-2 border-t border-[var(--border-2)]" />
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-4)]">Score</p>
          <FilterOption value={"ALL" as ScoredFilter} active={scored === "ALL"} onClick={onScored}>Any</FilterOption>
          <FilterOption value={"SCORED" as ScoredFilter} active={scored === "SCORED"} onClick={onScored}>Scored</FilterOption>
          <FilterOption value={"UNSCORED" as ScoredFilter} active={scored === "UNSCORED"} onClick={onScored}>Not scored yet</FilterOption>
          <div className="my-2 border-t border-[var(--border-2)]" />
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-4)]">In Code</p>
          <FilterOption value={"ALL" as CodeFilter} active={code === "ALL"} onClick={onCode}>All</FilterOption>
          <FilterOption value={"IN_CODE" as CodeFilter} active={code === "IN_CODE"} onClick={onCode}>Promoted to Code</FilterOption>
          <FilterOption value={"NOT" as CodeFilter} active={code === "NOT"} onClick={onCode}>Not promoted</FilterOption>
          {activeCount > 0 && (
            <>
              <div className="my-2 border-t border-[var(--border-2)]" />
              <button type="button" onClick={() => { onClear(); setOpen(false); }} className="w-full rounded-[6px] px-3 py-2 text-left text-sm text-rose-600 transition hover:bg-rose-50">
                Clear all filters
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function AssessmentRow({ a }: { a: DevSignalAssessmentDTO }) {
  const href = `/app/codeclear/devsignal/${a.id}`;
  const label = a.bestMatchSummary?.labelDisplay ?? "Not scored yet";
  return (
    <div className="group flex items-center gap-3 px-4 py-3 transition hover:bg-[var(--surface-1)] sm:grid" style={{ gridTemplateColumns: GRID_COLS }}>
      <Link href={href} className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--text-1)] group-hover:text-[var(--brand-700)]">{a.candidateName}</p>
        <p className="mt-0.5 truncate font-mono text-xs text-[var(--text-4)]">{a.candidateGithubHandle ?? "no handle"}</p>
        <div className="mt-1.5 flex items-center gap-2 sm:hidden">
          <StatusBadge status={a.status} />
          {typeof a.finalScore === "number" && <span className="font-mono text-xs text-[var(--text-3)]">{a.finalScore}</span>}
        </div>
      </Link>
      <span className="hidden truncate font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--brand-700)] sm:block">{label}</span>
      <div className="hidden sm:block"><StatusBadge status={a.status} /></div>
      <span className="hidden text-right font-mono text-sm text-[var(--text-2)] sm:block">{typeof a.finalScore === "number" ? a.finalScore : "—"}</span>
      <span className="hidden text-right text-xs text-[var(--text-4)] sm:block">{new Date(a.createdAt).toLocaleDateString()}</span>
      <div className="flex items-center justify-end gap-2">
        {a.promotedToCode && (
          <span className="hidden rounded-[4px] bg-[var(--brand-600)] px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.06em] text-white sm:inline">in Code</span>
        )}
        <Link href={href} className="inline-flex items-center gap-1 rounded-full border border-[var(--border-2)] bg-white px-2.5 py-1 text-[11px] font-medium text-[var(--text-3)] transition hover:border-[var(--brand-300)] hover:bg-[var(--surface-brand)] hover:text-[var(--brand-700)]">
          Review <ArrowRightIcon className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("rounded-[4px] border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em]", STATUS_STYLE[status] ?? "")}>
      {status.replace("_", " ")}
    </span>
  );
}

export function DevSignalAssessmentList({ items }: { items: DevSignalAssessmentDTO[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [decision, setDecision] = useState<DecisionFilter>("ALL");
  const [scored, setScored] = useState<ScoredFilter>("ALL");
  const [code, setCode] = useState<CodeFilter>("ALL");
  const [sort, setSort] = useState<SortKey>("NEWEST");
  const [visible, setVisible] = useState(PAGE_SIZE);

  const filtered = useMemo(() => {
    let list = items;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((a) => a.candidateName.toLowerCase().includes(q) || (a.candidateGithubHandle ?? "").toLowerCase().includes(q));
    }
    if (status !== "ALL") list = list.filter((a) => a.status === status);
    if (decision !== "ALL") list = list.filter((a) => a.decision === decision);
    if (scored !== "ALL") list = list.filter((a) => (scored === "SCORED" ? typeof a.finalScore === "number" : typeof a.finalScore !== "number"));
    if (code !== "ALL") list = list.filter((a) => (code === "IN_CODE" ? a.promotedToCode : !a.promotedToCode));

    return [...list].sort((a, b) => {
      if (sort === "NEWEST") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sort === "OLDEST") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sort === "SCORE_HIGH") return (b.finalScore ?? -1) - (a.finalScore ?? -1);
      return (a.finalScore ?? 101) - (b.finalScore ?? 101);
    });
  }, [items, search, status, decision, scored, code, sort]);

  useEffect(() => setVisible(PAGE_SIZE), [search, status, decision, scored, code, sort]);

  const shown = filtered.slice(0, visible);

  function clearFilters() {
    setSearch("");
    setStatus("ALL");
    setDecision("ALL");
    setScored("ALL");
    setCode("ALL");
  }

  if (items.length === 0) {
    return (
      <p className="rounded-[10px] border border-dashed border-[var(--border-2)] px-4 py-8 text-center text-sm text-[var(--text-4)]">
        No assessments yet. Create one to mint a candidate invite link.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-4)]" />
          <input className="app-input pl-9 text-sm" placeholder="Search by name or GitHub handle…" value={search} onChange={(e) => setSearch(e.target.value)} />
          {search && (
            <button type="button" onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--text-4)] hover:text-[var(--text-1)]">
              <XMarkIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <FiltersDropdown status={status} decision={decision} scored={scored} code={code} onStatus={setStatus} onDecision={setDecision} onScored={setScored} onCode={setCode} onClear={clearFilters} />
          <select className="app-select-compact flex-1 text-sm sm:w-40 sm:flex-none" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="NEWEST">Newest first</option>
            <option value="OLDEST">Oldest first</option>
            <option value="SCORE_HIGH">Score: high → low</option>
            <option value="SCORE_LOW">Score: low → high</option>
          </select>
        </div>
      </div>

      <p className="text-xs text-[var(--text-4)]">
        {filtered.length === items.length ? `${items.length} assessment${items.length !== 1 ? "s" : ""}` : `${filtered.length} of ${items.length} assessments`}
      </p>

      {filtered.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-[var(--border-2)] py-12 text-center">
          <p className="text-sm font-medium text-[var(--text-2)]">No results</p>
          <button type="button" onClick={clearFilters} className="mt-2 text-sm text-[var(--brand-700)] hover:underline">Clear all filters</button>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-[10px] border border-[var(--border-2)]">
            <div className="hidden items-center gap-3 border-b border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-2.5 sm:grid" style={{ gridTemplateColumns: GRID_COLS }}>
              <span className="text-xs font-medium text-[var(--text-4)]">Candidate</span>
              <span className="text-xs font-medium text-[var(--text-4)]">Best match</span>
              <span className="text-xs font-medium text-[var(--text-4)]">Status</span>
              <span className="text-right text-xs font-medium text-[var(--text-4)]">Score</span>
              <span className="text-right text-xs font-medium text-[var(--text-4)]">Created</span>
              <span />
            </div>
            <div className="divide-y divide-[var(--border-2)]">
              {shown.map((a) => (
                <AssessmentRow key={a.id} a={a} />
              ))}
            </div>
          </div>
          {filtered.length > visible && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setVisible((v) => v + PAGE_SIZE)}
                className="rounded-[8px] border border-[var(--border-2)] bg-white px-4 py-2 text-sm font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
              >
                Load more · showing {shown.length} of {filtered.length}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
