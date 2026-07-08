"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  ArrowRightIcon,
  DocumentTextIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  SignalIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { usePulseScans, useDeletePulseScan, useMonitors } from "@/hooks/use-pulse";
import { usePermissions } from "@/hooks/use-permissions";
import { cn, formatRelative } from "@/lib/format";
import type { PulseScanListItem, PulseScanStatus, PulseScanInputType } from "@/types/pulse";
import {
  PulseScanStatusBadge,
  PulseEmptyState,
  MiniSparkline,
  TrendDelta,
  HealthScorePill,
  MonitorDot,
} from "@/components/pulse/pulse-shared";
import { Button } from "@/components/ui/button";

// ── Types ─────────────────────────────────────────────────────────────────────

type StatusFilter = PulseScanStatus | "ALL";
type HealthFilter = "ALL" | "GREEN" | "AMBER" | "RED";
type InputFilter = PulseScanInputType | "ALL";
type MonitorFilter = "ALL" | "MONITORED" | "ALERTING";
type MoveFilter = "ALL" | "REGRESSED" | "IMPROVED";
type SortKey = "NEWEST" | "OLDEST" | "SCORE_HIGH" | "SCORE_LOW";

type MonitorStatus = { active: boolean; alerting: boolean };

const PAGE_SIZE = 50;

// ── Small helpers ──────────────────────────────────────────────────────────────

function healthTier(score: number | null): HealthFilter {
  if (score === null) return "ALL";
  if (score >= 75) return "GREEN";
  if (score >= 50) return "AMBER";
  return "RED";
}

function targetKey(s: { inputUrl: string | null; inputGithubRepo: string | null; projectName: string }): string {
  return (s.inputUrl ?? s.inputGithubRepo ?? s.projectName).toLowerCase().trim();
}

function InputTypePill({ type }: { type: PulseScanInputType }) {
  const label = type === "URL" ? "URL" : type === "GITHUB_REPO" ? "GitHub" : "Description";
  return (
    <span className="inline-flex items-center rounded-full border border-[var(--border-2)] bg-[var(--surface-1)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-3)]">
      {label}
    </span>
  );
}

// ── Filters dropdown ──────────────────────────────────────────────────────────

function FilterOption<T extends string>({
  value,
  active,
  onClick,
  children,
}: {
  value: T;
  active: boolean;
  onClick: (v: T) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-[6px] px-3 py-2 text-left text-sm transition",
        active
          ? "bg-[var(--brand-50)] font-medium text-[var(--brand-700)]"
          : "text-[var(--text-2)] hover:bg-[var(--surface-1)]",
      )}
    >
      <span
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition",
          active ? "border-[var(--brand-500)] bg-[var(--brand-500)]" : "border-[var(--border-2)]",
        )}
      >
        {active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
      </span>
      {children}
    </button>
  );
}

function FiltersDropdown({
  statusFilter,
  healthFilter,
  inputFilter,
  monitorFilter,
  moveFilter,
  onStatusChange,
  onHealthChange,
  onInputChange,
  onMonitorChange,
  onMoveChange,
  onClear,
}: {
  statusFilter: StatusFilter;
  healthFilter: HealthFilter;
  inputFilter: InputFilter;
  monitorFilter: MonitorFilter;
  moveFilter: MoveFilter;
  onStatusChange: (v: StatusFilter) => void;
  onHealthChange: (v: HealthFilter) => void;
  onInputChange: (v: InputFilter) => void;
  onMonitorChange: (v: MonitorFilter) => void;
  onMoveChange: (v: MoveFilter) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const activeCount = [
    statusFilter !== "ALL",
    healthFilter !== "ALL",
    inputFilter !== "ALL",
    monitorFilter !== "ALL",
    moveFilter !== "ALL",
  ].filter(Boolean).length;

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-2 rounded-[10px] border px-3 py-2 text-sm font-medium transition",
          activeCount > 0
            ? "border-[var(--brand-400)] bg-[var(--brand-50)] text-[var(--brand-700)]"
            : "border-[var(--border-2)] bg-white text-[var(--text-2)] hover:bg-[var(--surface-1)]",
        )}
      >
        <FunnelIcon className="h-4 w-4 shrink-0" />
        <span>Filters</span>
        {activeCount > 0 && (
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--brand-500)] text-[10px] font-bold text-white">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1.5 max-h-[70vh] w-60 overflow-y-auto rounded-[10px] border border-[var(--border-2)] bg-white p-3 shadow-lg">
          <p className="px-3 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-4)]">Status</p>
          <FilterOption value={"ALL" as StatusFilter} active={statusFilter === "ALL"} onClick={onStatusChange}>All statuses</FilterOption>
          <FilterOption value={"COMPLETED" as StatusFilter} active={statusFilter === "COMPLETED"} onClick={onStatusChange}>Completed</FilterOption>
          <FilterOption value={"RUNNING" as StatusFilter} active={statusFilter === "RUNNING"} onClick={onStatusChange}>Running</FilterOption>
          <FilterOption value={"FAILED" as StatusFilter} active={statusFilter === "FAILED"} onClick={onStatusChange}>Failed</FilterOption>

          <div className="my-2 border-t border-[var(--border-2)]" />

          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-4)]">Health score</p>
          <FilterOption value={"ALL" as HealthFilter} active={healthFilter === "ALL"} onClick={onHealthChange}>All scores</FilterOption>
          <FilterOption value={"GREEN" as HealthFilter} active={healthFilter === "GREEN"} onClick={onHealthChange}>Healthy 75+</FilterOption>
          <FilterOption value={"AMBER" as HealthFilter} active={healthFilter === "AMBER"} onClick={onHealthChange}>Moderate 50–74</FilterOption>
          <FilterOption value={"RED" as HealthFilter} active={healthFilter === "RED"} onClick={onHealthChange}>At risk &lt;50</FilterOption>

          <div className="my-2 border-t border-[var(--border-2)]" />

          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-4)]">Movement</p>
          <FilterOption value={"ALL" as MoveFilter} active={moveFilter === "ALL"} onClick={onMoveChange}>Any change</FilterOption>
          <FilterOption value={"REGRESSED" as MoveFilter} active={moveFilter === "REGRESSED"} onClick={onMoveChange}>Regressed ↓</FilterOption>
          <FilterOption value={"IMPROVED" as MoveFilter} active={moveFilter === "IMPROVED"} onClick={onMoveChange}>Improved ↑</FilterOption>

          <div className="my-2 border-t border-[var(--border-2)]" />

          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-4)]">Monitoring</p>
          <FilterOption value={"ALL" as MonitorFilter} active={monitorFilter === "ALL"} onClick={onMonitorChange}>All</FilterOption>
          <FilterOption value={"MONITORED" as MonitorFilter} active={monitorFilter === "MONITORED"} onClick={onMonitorChange}>Monitored</FilterOption>
          <FilterOption value={"ALERTING" as MonitorFilter} active={monitorFilter === "ALERTING"} onClick={onMonitorChange}>Alerting</FilterOption>

          <div className="my-2 border-t border-[var(--border-2)]" />

          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-4)]">Input type</p>
          <FilterOption value={"ALL" as InputFilter} active={inputFilter === "ALL"} onClick={onInputChange}>All types</FilterOption>
          <FilterOption value={"URL" as InputFilter} active={inputFilter === "URL"} onClick={onInputChange}>URL</FilterOption>
          <FilterOption value={"GITHUB_REPO" as InputFilter} active={inputFilter === "GITHUB_REPO"} onClick={onInputChange}>GitHub repo</FilterOption>
          <FilterOption value={"FREE_TEXT" as InputFilter} active={inputFilter === "FREE_TEXT"} onClick={onInputChange}>Description</FilterOption>

          {activeCount > 0 && (
            <>
              <div className="my-2 border-t border-[var(--border-2)]" />
              <button
                type="button"
                onClick={() => { onClear(); setOpen(false); }}
                className="w-full rounded-[6px] px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition"
              >
                Clear all filters
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
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

// Shared grid template — header and every row use the same columns so they align exactly.
const GRID_COLS = "auto 2rem 1fr 4rem 5rem 6rem 6rem 7rem";

// ── Scan row ──────────────────────────────────────────────────────────────────

function ScanRow({
  scan,
  selected,
  onToggle,
  trend,
  monitor,
}: {
  scan: PulseScanListItem;
  selected: boolean;
  onToggle: () => void;
  trend?: { delta: number | null; sparkline: number[] };
  monitor?: MonitorStatus;
}) {
  const inputLabel =
    scan.inputType === "URL"
      ? scan.inputUrl
      : scan.inputType === "GITHUB_REPO"
        ? `github.com/${scan.inputGithubRepo}`
        : "Free-text description";

  return (
    <div
      className={cn("group flex sm:grid items-center gap-3 px-4 py-3.5 transition hover:bg-[var(--surface-1)]", selected && "bg-[var(--brand-50)]")}
      style={{ gridTemplateColumns: GRID_COLS }}
    >
      {/* Col 1 — Checkbox */}
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="app-checkbox shrink-0"
        onClick={(e) => e.stopPropagation()}
      />

      {/* Col 2 — Icon */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)]">
        <SignalIcon className="h-4 w-4 text-[var(--text-4)]" />
      </div>

      {/* Col 3 — Project name + URL + mobile meta */}
      <Link href={`/app/pulse/${scan.id}`} className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 truncate">
          <p className="truncate text-sm font-medium text-[var(--text-1)] group-hover:text-[var(--brand-600)]">
            {scan.projectName}
          </p>
          {scan.generatedProposalId && (
            <DocumentTextIcon className="h-3.5 w-3.5 shrink-0 text-[var(--brand-400)]" title="Proposal generated" />
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-[var(--text-4)]">
          {inputLabel}
          {scan.clientName && <span className="ml-2 text-[var(--text-3)]">· {scan.clientName}</span>}
        </p>
        {trend && (trend.sparkline.length >= 2 || trend.delta !== null) && (
          <div className="mt-1.5 flex items-center gap-2">
            <MiniSparkline scores={trend.sparkline} />
            <TrendDelta delta={trend.delta} />
          </div>
        )}
        <div className="mt-1.5 flex items-center gap-2 sm:hidden">
          <HealthScorePill score={scan.healthScore} />
          <PulseScanStatusBadge status={scan.status} />
        </div>
      </Link>

      {/* Col 4 — Type (desktop only) */}
      <div className="hidden sm:flex sm:items-center">
        <InputTypePill type={scan.inputType} />
      </div>

      {/* Col 5 — Score (desktop only) */}
      <div className="hidden sm:flex sm:items-center">
        <HealthScorePill score={scan.healthScore} />
      </div>

      {/* Col 6 — Status + monitor dot (desktop only) */}
      <div className="hidden sm:flex sm:items-center sm:gap-1.5">
        <PulseScanStatusBadge status={scan.status} />
        {monitor?.active && <MonitorDot monitor={monitor} />}
      </div>

      {/* Col 7 — Date (desktop only) */}
      <span className="hidden sm:block text-right text-xs text-[var(--text-4)]" title={scan.createdAt}>
        {formatRelative(scan.createdAt)}
      </span>

      {/* Col 8 — Actions */}
      <div className="flex items-center justify-end gap-1.5">
        <Link
          href={`/app/pulse/${scan.id}`}
          className="hidden sm:inline-flex items-center gap-1 rounded-full border border-[var(--border-2)] bg-white px-2.5 py-1 text-[11px] font-medium text-[var(--text-3)] transition-all hover:border-[var(--brand-300)] hover:bg-[var(--brand-50)] hover:text-[var(--brand-600)]"
        >
          View <ArrowRightIcon className="h-3 w-3" />
        </Link>
        <DeleteButton scanId={scan.id} />
      </div>
    </div>
  );
}

// ── Scan list ────────────────────────────────────────────────────────────────

export function PulseScanListView() {
  const { data, isLoading, error } = usePulseScans();
  const { data: monitorsData } = useMonitors();
  // Running a scan spends AI tokens → gated to admins by default. Non-generators still
  // view existing scans; the API also enforces this.
  const { canGenerateAi } = usePermissions();
  const { mutateAsync: bulkDelete, isPending: bulkDeleting } = useDeletePulseScan();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [healthFilter, setHealthFilter] = useState<HealthFilter>("ALL");
  const [inputFilter, setInputFilter] = useState<InputFilter>("ALL");
  const [monitorFilter, setMonitorFilter] = useState<MonitorFilter>("ALL");
  const [moveFilter, setMoveFilter] = useState<MoveFilter>("ALL");
  const [sort, setSort] = useState<SortKey>("NEWEST");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);

  const allScans = useMemo<PulseScanListItem[]>(() => data?.scans ?? [], [data?.scans]);

  // Monitor status indexed by target — for the per-row dot + the monitoring filter.
  const monitorByTarget = useMemo<Map<string, MonitorStatus>>(() => {
    const map = new Map<string, MonitorStatus>();
    for (const m of monitorsData?.monitors ?? []) {
      const key = (m.inputUrl ?? m.inputGithubRepo ?? "").toLowerCase().trim();
      if (!key) continue;
      const prev = map.get(key) ?? { active: false, alerting: false };
      prev.active = prev.active || m.isActive;
      prev.alerting = prev.alerting || (m.isActive && m.lastHealthScore !== null && m.lastHealthScore < 50);
      map.set(key, prev);
    }
    return map;
  }, [monitorsData?.monitors]);

  const scanTrends = useMemo<Map<string, { delta: number | null; sparkline: number[] }>>(() => {
    const projectMap = new Map<string, PulseScanListItem[]>();
    for (const s of allScans) {
      const list = projectMap.get(targetKey(s)) ?? [];
      list.push(s);
      projectMap.set(targetKey(s), list);
    }
    const trends = new Map<string, { delta: number | null; sparkline: number[] }>();
    for (const [, scansForProject] of projectMap) {
      const completed = [...scansForProject]
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .filter((s) => s.status === "COMPLETED" && s.healthScore !== null);
      for (let i = 0; i < completed.length; i++) {
        const curr = completed[i];
        const prev = i > 0 ? completed[i - 1] : null;
        const delta =
          prev && curr.healthScore !== null && prev.healthScore !== null
            ? curr.healthScore - prev.healthScore
            : null;
        const sparkline = completed.slice(Math.max(0, i - 4), i + 1).map((s) => s.healthScore as number);
        trends.set(curr.id, { delta, sparkline });
      }
    }
    return trends;
  }, [allScans]);

  const filtered = useMemo(() => {
    let list = allScans;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.projectName.toLowerCase().includes(q) ||
          s.inputUrl?.toLowerCase().includes(q) ||
          s.inputGithubRepo?.toLowerCase().includes(q) ||
          s.clientName?.toLowerCase().includes(q),
      );
    }

    if (statusFilter !== "ALL") list = list.filter((s) => s.status === statusFilter);
    if (healthFilter !== "ALL") list = list.filter((s) => healthTier(s.healthScore) === healthFilter);
    if (inputFilter !== "ALL") list = list.filter((s) => s.inputType === inputFilter);

    if (monitorFilter !== "ALL") {
      list = list.filter((s) => {
        const m = monitorByTarget.get(targetKey(s));
        return monitorFilter === "MONITORED" ? Boolean(m?.active) : Boolean(m?.alerting);
      });
    }

    if (moveFilter !== "ALL") {
      list = list.filter((s) => {
        const d = scanTrends.get(s.id)?.delta ?? null;
        if (d === null) return false;
        return moveFilter === "REGRESSED" ? d < 0 : d > 0;
      });
    }

    list = [...list].sort((a, b) => {
      if (sort === "NEWEST") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sort === "OLDEST") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sort === "SCORE_HIGH") return (b.healthScore ?? -1) - (a.healthScore ?? -1);
      if (sort === "SCORE_LOW") return (a.healthScore ?? 101) - (b.healthScore ?? 101);
      return 0;
    });

    return list;
  }, [allScans, search, statusFilter, healthFilter, inputFilter, monitorFilter, moveFilter, sort, monitorByTarget, scanTrends]);

  // Reset the render window whenever the result set changes.
  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [search, statusFilter, healthFilter, inputFilter, monitorFilter, moveFilter, sort]);

  const shown = filtered.slice(0, visible);

  function toggleAll() {
    if (selected.size === shown.length) setSelected(new Set());
    else setSelected(new Set(shown.map((s) => s.id)));
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
    if (!confirmingBulkDelete) {
      setConfirmingBulkDelete(true);
      return;
    }
    await Promise.all([...selected].map((id) => bulkDelete(id)));
    setSelected(new Set());
    setConfirmingBulkDelete(false);
  }

  function clearFilters() {
    setSearch("");
    setStatusFilter("ALL");
    setHealthFilter("ALL");
    setInputFilter("ALL");
    setMonitorFilter("ALL");
    setMoveFilter("ALL");
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-[10px] bg-[var(--surface-1)]" />
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-red-600">Failed to load scans. Please refresh.</p>;
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-4)]" />
          <input
            className="app-input pl-9 text-sm"
            placeholder="Search by project, URL, repo, or client…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--text-4)] hover:text-[var(--text-1)]"
            >
              <XMarkIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex w-full items-center gap-2 sm:w-auto">
          <FiltersDropdown
            statusFilter={statusFilter}
            healthFilter={healthFilter}
            inputFilter={inputFilter}
            monitorFilter={monitorFilter}
            moveFilter={moveFilter}
            onStatusChange={setStatusFilter}
            onHealthChange={setHealthFilter}
            onInputChange={setInputFilter}
            onMonitorChange={setMonitorFilter}
            onMoveChange={setMoveFilter}
            onClear={clearFilters}
          />

          <select
            className="app-select-compact flex-1 text-sm sm:flex-none sm:w-36"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            <option value="NEWEST">Newest first</option>
            <option value="OLDEST">Oldest first</option>
            <option value="SCORE_HIGH">Score: high → low</option>
            <option value="SCORE_LOW">Score: low → high</option>
          </select>

          {canGenerateAi && (
            <Link href="/app/pulse/new" className="shrink-0">
              <Button variant="primary" size="sm" leadingIcon={<PlusIcon className="h-4 w-4" />} className="whitespace-nowrap">
                New scan
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex flex-col gap-2 rounded-[10px] border border-[var(--brand-200)] bg-[var(--brand-50)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:py-2.5">
          <p className="text-sm font-medium text-[var(--brand-700)]">
            {selected.size} scan{selected.size !== 1 ? "s" : ""} selected
          </p>
          <div className="flex items-center gap-2">
            {confirmingBulkDelete ? (
              <>
                <span className="text-xs text-red-700">Delete {selected.size} scan{selected.size !== 1 ? "s" : ""}?</span>
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  disabled={bulkDeleting}
                  className="rounded-[6px] bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {bulkDeleting ? "Deleting…" : "Yes, delete"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingBulkDelete(false)}
                  className="rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--text-2)]"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  className="inline-flex items-center gap-1.5 rounded-[6px] border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                  Delete selected
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="text-xs text-[var(--text-4)] hover:text-[var(--text-2)]"
                >
                  Deselect all
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Results summary */}
      <p className="text-xs text-[var(--text-4)]">
        {filtered.length === allScans.length
          ? `${allScans.length} scan${allScans.length !== 1 ? "s" : ""}`
          : `${filtered.length} of ${allScans.length} scans`}
      </p>

      {/* List */}
      {allScans.length === 0 ? (
        <PulseEmptyState />
      ) : filtered.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-[var(--border-2)] py-12 text-center">
          <p className="text-sm font-medium text-[var(--text-2)]">No results</p>
          <p className="mt-1 text-sm text-[var(--text-4)]">Try adjusting your search or filters.</p>
          <button type="button" onClick={clearFilters} className="mt-3 text-sm text-[var(--brand-600)] hover:underline">
            Clear all filters
          </button>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-[10px] border border-[var(--border-2)]">
            {/* Table header */}
            <div
              className="flex sm:grid items-center gap-3 border-b border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-2.5"
              style={{ gridTemplateColumns: GRID_COLS }}
            >
              <input
                type="checkbox"
                className="app-checkbox shrink-0"
                checked={selected.size === shown.length && shown.length > 0}
                ref={(el) => {
                  if (el) el.indeterminate = selected.size > 0 && selected.size < shown.length;
                }}
                onChange={toggleAll}
              />
              <div className="hidden sm:block" />
              <span className="flex-1 text-xs font-medium text-[var(--text-4)]">Project</span>
              <span className="hidden sm:block text-xs font-medium text-[var(--text-4)]">Type</span>
              <span className="hidden sm:block text-xs font-medium text-[var(--text-4)]">Score</span>
              <span className="hidden sm:block text-xs font-medium text-[var(--text-4)]">Status</span>
              <span className="hidden sm:block text-right text-xs font-medium text-[var(--text-4)]">Scanned</span>
              <div className="hidden sm:block" />
            </div>

            {/* Rows */}
            <div className="divide-y divide-[var(--border-2)]">
              {shown.map((scan) => (
                <ScanRow
                  key={scan.id}
                  scan={scan}
                  selected={selected.has(scan.id)}
                  onToggle={() => toggleOne(scan.id)}
                  trend={scanTrends.get(scan.id)}
                  monitor={monitorByTarget.get(targetKey(scan))}
                />
              ))}
            </div>
          </div>

          {filtered.length > visible && (
            <div className="flex justify-center">
              <Button variant="secondary" size="sm" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
                Load more · showing {shown.length} of {filtered.length}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

