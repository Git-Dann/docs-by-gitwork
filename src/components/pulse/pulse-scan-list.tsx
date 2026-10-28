"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { TrashIcon } from "@heroicons/react/24/outline";
import { Pager } from "@/components/ui/pager";
import { usePulseScans, useDeletePulseScan, useMonitors } from "@/hooks/use-pulse";
import { cn, formatRelative } from "@/lib/format";
import { describeScanSubject, detectStoreTarget } from "@/lib/pulse-store-url";
import { targetKey, type SortDir } from "@/lib/pulse-projects";
import {
  DEFAULT_SCAN_FILTERS,
  DEFAULT_SCAN_SORT,
  SCAN_SORT_START,
  filterScans,
  scanChanges,
  scanKind,
  sortScansBy,
  type ScanFilters,
  type ScanSortKey,
} from "@/lib/pulse-scan-list";
import type { PulseScanListItem } from "@/types/pulse";
import { PulseScanStatusBadge, PulseEmptyState, MonitorDot } from "@/components/pulse/pulse-shared";
import { SortHeader } from "@/components/pulse/pulse-projects";
import { githubRepoLabel } from "@/lib/github";

/**
 * Every scan, one row each: the flat history behind the Projects list. Built the same way as
 * Projects (Oct 2026, Dan: "do the same for the all scans view"): inline filters, sortable
 * column headers, newest first, 20 a page, and one card per scan on a phone. The rules are
 * pure, in src/lib/pulse-scan-list.ts.
 */

type MonitorStatus = { active: boolean; alerting: boolean };

/** Rows per page. Dan, Oct 2026: "maybe show 20 at most". */
const PAGE_SIZE = 20;

const KIND_LABEL = { website: "Website", repo: "Repository", store: "Store listing", description: "Description" } as const;

function scoreClass(score: number | null): string {
  if (score === null) return "text-[var(--text-4)]";
  return score >= 75 ? "text-[var(--success-500)]" : score >= 50 ? "text-[var(--warning-500)]" : "text-[var(--danger-500)]";
}

/** What was scanned, as a person would say it. A store link names the store, not a long URL. */
function subjectOf(scan: PulseScanListItem): { label: string; title: string } {
  const store = scan.inputType === "URL" && scan.inputUrl && detectStoreTarget(scan.inputUrl) ? describeScanSubject(scan.inputUrl, null) : null;
  const label = store ?? (scan.inputType === "URL" ? scan.inputUrl ?? "" : scan.inputType === "GITHUB_REPO" ? githubRepoLabel(scan.inputGithubRepo) ?? "" : "Free-text description");
  return { label, title: [store ? scan.inputUrl : label, scan.clientName].filter(Boolean).join(" · ") };
}

function ChangeCell({ by }: { by: number | null | undefined }) {
  if (by === null || by === undefined) return <span className="text-xs text-[var(--text-4)]">—</span>;
  if (by === 0) return <span className="text-xs text-[var(--text-3)]">no change</span>;
  return <span className={cn("whitespace-nowrap text-xs font-medium", by > 0 ? "text-[var(--success-500)]" : "text-[var(--danger-500)]")}>{by > 0 ? "up" : "down"} {Math.abs(by)}</span>;
}

// ── Delete button with floating popover confirm ───────────────────────────────

function DeleteButton({ scanId, onDeleted }: { scanId: string; onDeleted?: () => void }) {
  const [open, setOpen] = useState(false);
  const { mutateAsync, isPending } = useDeletePulseScan();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, right: 0 });

  const close = useCallback(() => setOpen(false), []);

  function handleToggle() {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({ top: rect.top, right: window.innerWidth - rect.right });
    }
    setOpen((v) => !v);
  }

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (
        popoverRef.current && !popoverRef.current.contains(target) &&
        triggerRef.current && !triggerRef.current.contains(target)
      ) close();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  async function handleDelete() {
    await mutateAsync(scanId);
    onDeleted?.();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        className={cn(
          "rounded-[6px] p-1.5 transition",
          open
            ? "bg-red-100 text-red-600"
            : "text-[var(--text-4)] hover:bg-red-50 hover:text-red-500",
        )}
        title="Delete scan"
      >
        <TrashIcon className="h-4 w-4" />
      </button>

      {open && createPortal(
        <div
          ref={popoverRef}
          style={{
            position: "fixed",
            top: coords.top,
            right: coords.right,
            transform: "translateY(calc(-100% - 8px))",
          }}
          className="z-[9999] w-44 rounded-[10px] border border-[var(--border-2)] bg-white p-3 shadow-xl"
        >
          <div className="absolute -bottom-1.5 right-3 h-3 w-3 rotate-45 border-b border-r border-[var(--border-2)] bg-white" />
          <p className="mb-2.5 text-xs font-medium text-[var(--text-1)]">Delete this scan?</p>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="flex-1 rounded-[6px] bg-red-600 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60 transition"
            >
              {isPending ? "Deleting…" : "Delete"}
            </button>
            <button
              type="button"
              onClick={close}
              className="flex-1 rounded-[6px] border border-[var(--border-2)] py-1.5 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--surface-1)] transition"
            >
              Cancel
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

export function PulseScanListView() {
  const { data, isLoading, error } = usePulseScans();
  const { data: monitorsData } = useMonitors();
  const { mutateAsync: bulkDelete, isPending: bulkDeleting } = useDeletePulseScan();

  const [filters, setFiltersState] = useState<ScanFilters>(DEFAULT_SCAN_FILTERS);
  const [sort, setSortState] = useState(DEFAULT_SCAN_SORT);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);
  const listTop = useRef<HTMLDivElement>(null);

  const allScans = useMemo<PulseScanListItem[]>(() => data?.scans ?? [], [data?.scans]);
  const changes = useMemo(() => scanChanges(allScans), [allScans]);

  // Monitor status by project, matched with the same targetKey rule as everything else.
  const monitorByTarget = useMemo(() => {
    const map = new Map<string, MonitorStatus>();
    for (const m of monitorsData?.monitors ?? []) {
      if (!m.inputUrl && !m.inputGithubRepo) continue;
      const key = targetKey({ inputUrl: m.inputUrl, inputGithubRepo: m.inputGithubRepo, projectName: "" });
      const prev = map.get(key) ?? { active: false, alerting: false };
      prev.active = prev.active || m.isActive;
      prev.alerting = prev.alerting || (m.isActive && m.lastHealthScore !== null && m.lastHealthScore < 50);
      map.set(key, prev);
    }
    return map;
  }, [monitorsData?.monitors]);
  const monitorOf = (s: PulseScanListItem) => monitorByTarget.get(targetKey(s));

  const matching = useMemo(
    () => sortScansBy(filterScans(allScans, filters, { changes, monitorOf: (s) => monitorByTarget.get(targetKey(s)) }), sort.key, sort.dir, changes),
    [allScans, filters, sort, changes, monitorByTarget],
  );
  const pages = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const shown = matching.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const kinds = useMemo(() => new Set(allScans.map(scanKind)), [allScans]);
  const hasMonitors = monitorByTarget.size > 0;
  const filtered = JSON.stringify(filters) !== JSON.stringify(DEFAULT_SCAN_FILTERS);

  // Ticks are for the page you can see. Carried across pages or filters, "Delete selected"
  // would delete scans that are not on screen.
  const resetView = () => { setPage(0); setSelected(new Set()); setConfirmingBulkDelete(false); };
  const setFilters = (patch: Partial<ScanFilters>) => { setFiltersState((f) => ({ ...f, ...patch })); resetView(); };
  const setSort = (key: ScanSortKey) => {
    setSortState((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: SCAN_SORT_START[key] }));
    resetView();
  };
  function goToPage(p: number) {
    setPage(p);
    setSelected(new Set());
    setConfirmingBulkDelete(false);
    listTop.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  function toggleAll() {
    setSelected(selected.size === shown.length ? new Set() : new Set(shown.map((s) => s.id)));
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  async function handleBulkDelete() {
    if (!confirmingBulkDelete) return setConfirmingBulkDelete(true);
    await Promise.all([...selected].map((id) => bulkDelete(id)));
    setSelected(new Set());
    setConfirmingBulkDelete(false);
  }

  if (isLoading) return <p className="text-sm text-[var(--text-3)]">Loading scans…</p>;
  if (error) return <p className="text-sm text-[var(--danger-700)]">Scans could not be loaded. Refresh to try again.</p>;
  if (allScans.length === 0) return <PulseEmptyState />;

  const selectCls = "app-select min-w-0 flex-1 basis-[calc(50%-0.25rem)] text-base sm:w-auto sm:flex-none sm:basis-auto sm:text-sm";

  return (
    <div className="space-y-4">
      <div ref={listTop} className="flex scroll-mt-4 flex-wrap items-center gap-2">
        <input
          type="search"
          value={filters.query}
          onChange={(e) => setFilters({ query: e.target.value })}
          placeholder="Search projects, sites, repos or clients"
          aria-label="Search scans"
          className="app-input min-w-[220px] flex-1 basis-full text-base sm:w-auto sm:basis-auto sm:text-sm"
        />
        <select value={filters.status} onChange={(e) => setFilters({ status: e.target.value as ScanFilters["status"] })} aria-label="Filter by status" className={selectCls}>
          <option value="all">Any status</option>
          <option value="COMPLETED">Complete</option>
          <option value="RUNNING">Running</option>
          <option value="FAILED">Failed</option>
        </select>
        <select value={filters.health} onChange={(e) => setFilters({ health: e.target.value as ScanFilters["health"] })} aria-label="Filter by score" className={selectCls}>
          <option value="all">Any score</option>
          <option value="good">75 and up</option>
          <option value="fair">50 to 74</option>
          <option value="poor">Below 50</option>
        </select>
        {kinds.size > 1 && (
          <select value={filters.kind} onChange={(e) => setFilters({ kind: e.target.value as ScanFilters["kind"] })} aria-label="Filter by type" className={selectCls}>
            <option value="all">Any type</option>
            {kinds.has("website") && <option value="website">Websites</option>}
            {kinds.has("repo") && <option value="repo">Repositories</option>}
            {kinds.has("store") && <option value="store">Store listings</option>}
            {kinds.has("description") && <option value="description">Descriptions</option>}
          </select>
        )}
        <select value={filters.movement} onChange={(e) => setFilters({ movement: e.target.value as ScanFilters["movement"] })} aria-label="Filter by change" className={selectCls}>
          <option value="all">Any change</option>
          <option value="improved">Went up</option>
          <option value="regressed">Went down</option>
        </select>
        {hasMonitors && (
          <select value={filters.monitoring} onChange={(e) => setFilters({ monitoring: e.target.value as ScanFilters["monitoring"] })} aria-label="Filter by monitoring" className={selectCls}>
            <option value="all">Any monitor</option>
            <option value="monitored">Monitored</option>
            <option value="alerting">Monitor alerting</option>
          </select>
        )}
        {/* Phones have no column headers to click, so the sort is a control of its own. */}
        <select
          value={`${sort.key}:${sort.dir}`}
          onChange={(e) => { const [key, dir] = e.target.value.split(":") as [ScanSortKey, SortDir]; setSortState({ key, dir }); resetView(); }}
          aria-label="Sort scans"
          className="app-select min-w-0 flex-1 basis-[calc(50%-0.25rem)] text-base sm:hidden"
        >
          <option value="scanned:desc">Newest first</option>
          <option value="scanned:asc">Oldest first</option>
          <option value="score:asc">Lowest score</option>
          <option value="score:desc">Highest score</option>
          <option value="change:asc">Biggest drop</option>
          <option value="name:asc">Name A to Z</option>
        </select>
        {filtered && (
          <button type="button" onClick={() => { setFiltersState(DEFAULT_SCAN_FILTERS); resetView(); }} className="text-xs font-medium text-[var(--brand-600)] hover:underline">
            Clear filters
          </button>
        )}
      </div>

      {filtered && <p className="text-xs text-[var(--text-3)]">{matching.length} of {allScans.length} scans match.</p>}

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[6px] border border-[var(--brand-600)]/30 bg-[var(--brand-50)] px-3 py-2">
          <p className="text-sm font-medium text-[var(--text-1)]">{selected.size} {selected.size === 1 ? "scan" : "scans"} selected</p>
          <div className="flex items-center gap-3">
            {confirmingBulkDelete && <span className="text-xs text-[var(--danger-700)]">Delete {selected.size} {selected.size === 1 ? "scan" : "scans"}? This cannot be undone.</span>}
            <button
              type="button"
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-xs font-medium disabled:opacity-50",
                confirmingBulkDelete ? "bg-[var(--danger-500)] text-white" : "border border-[var(--danger-500)]/40 text-[var(--danger-700)] hover:bg-[var(--danger-50)]",
              )}
            >
              <TrashIcon className="h-3.5 w-3.5" />
              {bulkDeleting ? "Deleting…" : confirmingBulkDelete ? "Yes, delete" : "Delete selected"}
            </button>
            <button type="button" onClick={() => { setSelected(new Set()); setConfirmingBulkDelete(false); }} className="text-xs text-[var(--text-3)] hover:text-[var(--text-1)]">
              {confirmingBulkDelete ? "Cancel" : "Deselect all"}
            </button>
          </div>
        </div>
      )}

      {matching.length === 0 ? (
        <p className="text-sm text-[var(--text-3)]">No scan matches these filters.</p>
      ) : (
        <>
          {/* Phones: one card per scan, so the score is never off the side of a scrolling table. */}
          <ul className="divide-y divide-[var(--border-2)] sm:hidden">
            {shown.map((scan) => {
              const subject = subjectOf(scan);
              return (
                <li key={scan.id} className="flex items-start gap-3 py-3">
                  <input type="checkbox" checked={selected.has(scan.id)} onChange={() => toggleOne(scan.id)} aria-label={`Select ${scan.projectName}`} className="app-checkbox mt-1 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <Link href={`/app/pulse/${scan.id}`} className="block truncate text-sm font-medium text-[var(--brand-600)] hover:underline" title={scan.projectName}>{scan.projectName}</Link>
                    <span className="block truncate text-[11px] text-[var(--text-4)]" title={subject.title}>{[subject.label, scan.clientName].filter(Boolean).join(" · ")}</span>
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-3)]">
                      <PulseScanStatusBadge status={scan.status} />
                      <ChangeCell by={changes.get(scan.id)} />
                      <span title={scan.createdAt}>{formatRelative(scan.createdAt)}</span>
                    </p>
                  </div>
                  <span className={cn("shrink-0 font-serif text-2xl font-bold leading-none tabular-nums", scoreClass(scan.healthScore))}>{scan.healthScore ?? "—"}</span>
                </li>
              );
            })}
          </ul>
          <div className="hidden overflow-x-auto sm:block">
            <table className="app-table app-table--dense min-w-[760px]">
              <thead>
                <tr>
                  <th className="w-8">
                    <input
                      type="checkbox"
                      aria-label="Select every scan on this page"
                      className="app-checkbox"
                      checked={selected.size === shown.length && shown.length > 0}
                      ref={(el) => { if (el) el.indeterminate = selected.size > 0 && selected.size < shown.length; }}
                      onChange={toggleAll}
                    />
                  </th>
                  <SortHeader label="Project" k="name" sort={sort} onSort={setSort} />
                  <th className="text-left">Type</th>
                  <SortHeader label="Score" k="score" sort={sort} onSort={setSort} align="right" />
                  <SortHeader label="Change" k="change" sort={sort} onSort={setSort} title="Against the previous completed scan of the same project" />
                  <th className="text-left">Status</th>
                  <SortHeader label="Scanned" k="scanned" sort={sort} onSort={setSort} />
                  <th className="w-10"><span className="sr-only">Delete</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((scan) => {
                  const subject = subjectOf(scan);
                  const monitor = monitorOf(scan);
                  return (
                    <tr key={scan.id} className={cn(selected.has(scan.id) && "bg-[var(--brand-50)]")}>
                      <td><input type="checkbox" checked={selected.has(scan.id)} onChange={() => toggleOne(scan.id)} aria-label={`Select ${scan.projectName}`} className="app-checkbox" /></td>
                      <td className="max-w-[320px]">
                        <Link href={`/app/pulse/${scan.id}`} className="block truncate text-sm font-medium text-[var(--brand-600)] hover:underline" title={scan.projectName}>
                          {scan.projectName}
                          {scan.generatedProposalId && <span className="ml-2 font-mono text-[9px] uppercase text-[var(--text-4)]">Proposal</span>}
                        </Link>
                        <span className="block truncate text-[11px] text-[var(--text-4)]" title={subject.title}>{[subject.label, scan.clientName].filter(Boolean).join(" · ")}</span>
                      </td>
                      <td className="whitespace-nowrap text-xs text-[var(--text-3)]">{KIND_LABEL[scanKind(scan)]}</td>
                      <td className={cn("text-right font-serif text-lg font-bold tabular-nums", scoreClass(scan.healthScore))}>{scan.healthScore ?? "—"}</td>
                      <td><ChangeCell by={changes.get(scan.id)} /></td>
                      <td>
                        <span className="inline-flex items-center gap-1.5">
                          <PulseScanStatusBadge status={scan.status} />
                          {monitor?.active && <MonitorDot monitor={monitor} />}
                        </span>
                      </td>
                      <td className="whitespace-nowrap text-xs text-[var(--text-3)]" title={scan.createdAt}>{formatRelative(scan.createdAt)}</td>
                      <td className="text-right"><DeleteButton scanId={scan.id} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pager page={current} pageSize={PAGE_SIZE} total={matching.length} onPage={goToPage} label="Scan pages" />
        </>
      )}
    </div>
  );
}
