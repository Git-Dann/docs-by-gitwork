"use client";

import { useState, useMemo } from "react";
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
import { usePulseScans, useDeletePulseScan } from "@/hooks/use-pulse";
import { cn, formatDate } from "@/lib/format";
import type { PulseScanListItem, PulseScanStatus, PulseScanInputType } from "@/types/pulse";
import { PulseScanStatusBadge } from "@/components/pulse/pulse-shared";
import { Button } from "@/components/ui/button";

// ── Types ─────────────────────────────────────────────────────────────────────

type StatusFilter = PulseScanStatus | "ALL";
type HealthFilter = "ALL" | "GREEN" | "AMBER" | "RED";
type InputFilter = PulseScanInputType | "ALL";
type SortKey = "NEWEST" | "OLDEST" | "SCORE_HIGH" | "SCORE_LOW";

// ── Small helpers ──────────────────────────────────────────────────────────────

function healthTier(score: number | null): HealthFilter {
  if (score === null) return "ALL";
  if (score >= 75) return "GREEN";
  if (score >= 50) return "AMBER";
  return "RED";
}

function HealthPill({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-[var(--text-4)]">—</span>;
  const cls =
    score >= 75
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : score >= 50
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-red-50 text-red-700 border-red-200";
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums", cls)}>
      {score}/100
    </span>
  );
}

function InputTypePill({ type }: { type: PulseScanInputType }) {
  const label = type === "URL" ? "URL" : type === "GITHUB_REPO" ? "GitHub" : "Description";
  return (
    <span className="inline-flex items-center rounded-full border border-[var(--border-2)] bg-[var(--surface-1)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-3)]">
      {label}
    </span>
  );
}

// ── Filter/sort toolbar ────────────────────────────────────────────────────────

function FilterChip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition",
        active
          ? "border-[var(--brand-500)] bg-[var(--brand-50)] text-[var(--brand-700)]"
          : "border-[var(--border-2)] bg-white text-[var(--text-3)] hover:bg-[var(--surface-1)]",
      )}
    >
      {children}
    </button>
  );
}

// ── Delete button with inline confirm ─────────────────────────────────────────

function DeleteButton({ scanId, onDeleted }: { scanId: string; onDeleted?: () => void }) {
  const [armed, setArmed] = useState(false);
  const { mutateAsync, isPending } = useDeletePulseScan();

  async function handleDelete() {
    if (!armed) {
      setArmed(true);
      return;
    }
    await mutateAsync(scanId);
    onDeleted?.();
  }

  if (armed) {
    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending}
          className="rounded-[6px] bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {isPending ? "Deleting…" : "Confirm"}
        </button>
        <button
          type="button"
          onClick={() => setArmed(false)}
          className="rounded-[6px] p-1 text-[var(--text-4)] hover:text-[var(--text-2)]"
        >
          <XMarkIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      className="rounded-[6px] p-1.5 text-[var(--text-4)] opacity-0 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-600"
      title="Delete scan"
    >
      <TrashIcon className="h-4 w-4" />
    </button>
  );
}

// ── Scan row ──────────────────────────────────────────────────────────────────

function ScanRow({
  scan,
  selected,
  onToggle,
}: {
  scan: PulseScanListItem;
  selected: boolean;
  onToggle: () => void;
}) {
  const inputLabel =
    scan.inputType === "URL"
      ? scan.inputUrl
      : scan.inputType === "GITHUB_REPO"
        ? `github.com/${scan.inputGithubRepo}`
        : "Free-text description";

  return (
    <div className={cn("group flex items-center gap-3 px-4 py-3.5 transition", selected && "bg-[var(--brand-50)]")}>
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="app-checkbox shrink-0"
        onClick={(e) => e.stopPropagation()}
      />

      {/* Icon */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)]">
        <SignalIcon className="h-4 w-4 text-[var(--text-4)]" />
      </div>

      {/* Name + URL */}
      <Link
        href={`/app/pulse/${scan.id}`}
        className="min-w-0 flex-1"
      >
        <p className="truncate text-sm font-medium text-[var(--text-1)] group-hover:text-[var(--brand-600)]">
          {scan.projectName}
        </p>
        <p className="mt-0.5 truncate text-xs text-[var(--text-4)]">
          {inputLabel}
          {scan.clientName && <span className="ml-2 text-[var(--text-3)]">· {scan.clientName}</span>}
        </p>
      </Link>

      {/* Meta */}
      <div className="hidden items-center gap-3 sm:flex">
        <InputTypePill type={scan.inputType} />
        <HealthPill score={scan.healthScore} />
        <PulseScanStatusBadge status={scan.status} />
        {scan.generatedProposalId && (
          <DocumentTextIcon className="h-4 w-4 text-[var(--brand-400)]" title="Proposal generated" />
        )}
        <span className="w-20 text-right text-xs text-[var(--text-4)]">{formatDate(scan.createdAt)}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        <Link
          href={`/app/pulse/${scan.id}`}
          className="rounded-[6px] p-1.5 text-[var(--text-4)] opacity-0 transition group-hover:opacity-100 hover:text-[var(--text-1)]"
        >
          <ArrowRightIcon className="h-4 w-4" />
        </Link>
        <DeleteButton scanId={scan.id} />
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function PulseScanListView() {
  const { data, isLoading, error } = usePulseScans();
  const { mutateAsync: bulkDelete, isPending: bulkDeleting } = useDeletePulseScan();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [healthFilter, setHealthFilter] = useState<HealthFilter>("ALL");
  const [inputFilter, setInputFilter] = useState<InputFilter>("ALL");
  const [sort, setSort] = useState<SortKey>("NEWEST");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);

  const allScans: PulseScanListItem[] = data?.scans ?? [];

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

    if (statusFilter !== "ALL") {
      list = list.filter((s) => s.status === statusFilter);
    }

    if (healthFilter !== "ALL") {
      list = list.filter((s) => healthTier(s.healthScore) === healthFilter);
    }

    if (inputFilter !== "ALL") {
      list = list.filter((s) => s.inputType === inputFilter);
    }

    list = [...list].sort((a, b) => {
      if (sort === "NEWEST") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sort === "OLDEST") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sort === "SCORE_HIGH") return (b.healthScore ?? -1) - (a.healthScore ?? -1);
      if (sort === "SCORE_LOW") return (a.healthScore ?? 101) - (b.healthScore ?? 101);
      return 0;
    });

    return list;
  }, [allScans, search, statusFilter, healthFilter, inputFilter, sort]);

  const activeFilterCount = [
    statusFilter !== "ALL",
    healthFilter !== "ALL",
    inputFilter !== "ALL",
  ].filter(Boolean).length;

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((s) => s.id)));
    }
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
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-[12px] bg-[var(--surface-1)]" />
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
        {/* Search */}
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

        {/* Sort */}
        <select
          className="app-select w-full text-sm sm:w-auto"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
        >
          <option value="NEWEST">Newest first</option>
          <option value="OLDEST">Oldest first</option>
          <option value="SCORE_HIGH">Score: high → low</option>
          <option value="SCORE_LOW">Score: low → high</option>
        </select>

        {/* New scan */}
        <Link href="/app/pulse/new">
          <Button variant="primary" size="sm" leadingIcon={<PlusIcon className="h-4 w-4" />}>
            New scan
          </Button>
        </Link>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <FunnelIcon className="h-3.5 w-3.5 shrink-0 text-[var(--text-4)]" />

        <FilterChip active={statusFilter === "ALL"} onClick={() => setStatusFilter("ALL")}>All statuses</FilterChip>
        <FilterChip active={statusFilter === "COMPLETED"} onClick={() => setStatusFilter("COMPLETED")}>Completed</FilterChip>
        <FilterChip active={statusFilter === "RUNNING"} onClick={() => setStatusFilter("RUNNING")}>Running</FilterChip>
        <FilterChip active={statusFilter === "FAILED"} onClick={() => setStatusFilter("FAILED")}>Failed</FilterChip>

        <span className="text-[var(--border-2)]">|</span>

        <FilterChip active={healthFilter === "ALL"} onClick={() => setHealthFilter("ALL")}>All scores</FilterChip>
        <FilterChip active={healthFilter === "GREEN"} onClick={() => setHealthFilter("GREEN")}>Healthy 75+</FilterChip>
        <FilterChip active={healthFilter === "AMBER"} onClick={() => setHealthFilter("AMBER")}>Moderate 50–74</FilterChip>
        <FilterChip active={healthFilter === "RED"} onClick={() => setHealthFilter("RED")}>At risk &lt;50</FilterChip>

        <span className="text-[var(--border-2)]">|</span>

        <FilterChip active={inputFilter === "ALL"} onClick={() => setInputFilter("ALL")}>All types</FilterChip>
        <FilterChip active={inputFilter === "URL"} onClick={() => setInputFilter("URL")}>URL</FilterChip>
        <FilterChip active={inputFilter === "GITHUB_REPO"} onClick={() => setInputFilter("GITHUB_REPO")}>GitHub</FilterChip>
        <FilterChip active={inputFilter === "FREE_TEXT"} onClick={() => setInputFilter("FREE_TEXT")}>Description</FilterChip>

        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={clearFilters}
            className="ml-1 text-xs text-[var(--text-4)] hover:text-red-600 underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between rounded-[12px] border border-[var(--brand-200)] bg-[var(--brand-50)] px-4 py-2.5">
          <p className="text-sm font-medium text-[var(--brand-700)]">
            {selected.size} scan{selected.size !== 1 ? "s" : ""} selected
          </p>
          <div className="flex items-center gap-2">
            {confirmingBulkDelete ? (
              <>
                <span className="text-xs text-red-700">Delete {selected.size} scans?</span>
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  disabled={bulkDeleting}
                  className="rounded-[8px] bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {bulkDeleting ? "Deleting…" : "Yes, delete all"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingBulkDelete(false)}
                  className="rounded-[8px] border border-[var(--border-2)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--text-2)]"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  className="inline-flex items-center gap-1.5 rounded-[8px] border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
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
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--text-4)]">
          {filtered.length === allScans.length
            ? `${allScans.length} scan${allScans.length !== 1 ? "s" : ""}`
            : `${filtered.length} of ${allScans.length} scans`}
        </p>
      </div>

      {/* List */}
      {allScans.length === 0 ? (
        <div className="rounded-[16px] border border-dashed border-[var(--border-2)] py-16 text-center">
          <SignalIcon className="mx-auto mb-3 h-8 w-8 text-[var(--text-4)]" />
          <p className="text-sm font-medium text-[var(--text-2)]">No scans yet</p>
          <p className="mt-1 text-sm text-[var(--text-4)]">
            Run your first Pulse scan to validate a client project.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-[16px] border border-dashed border-[var(--border-2)] py-12 text-center">
          <p className="text-sm font-medium text-[var(--text-2)]">No results</p>
          <p className="mt-1 text-sm text-[var(--text-4)]">Try adjusting your search or filters.</p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-3 text-sm text-[var(--brand-600)] hover:underline"
          >
            Clear all filters
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[16px] border border-[var(--border-2)]">
          {/* Table header */}
          <div className="flex items-center gap-3 border-b border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-2.5">
            <input
              type="checkbox"
              className="app-checkbox shrink-0"
              checked={selected.size === filtered.length && filtered.length > 0}
              ref={(el) => {
                if (el) el.indeterminate = selected.size > 0 && selected.size < filtered.length;
              }}
              onChange={toggleAll}
            />
            <span className="flex-1 text-xs font-medium text-[var(--text-4)]">Project</span>
            <div className="hidden items-center gap-12 pr-8 sm:flex">
              <span className="w-20 text-xs font-medium text-[var(--text-4)]">Type</span>
              <span className="w-16 text-xs font-medium text-[var(--text-4)]">Score</span>
              <span className="w-20 text-xs font-medium text-[var(--text-4)]">Status</span>
              <span className="w-20 text-right text-xs font-medium text-[var(--text-4)]">Date</span>
            </div>
          </div>

          {/* Rows */}
          <div className="divide-y divide-[var(--border-2)]">
            {filtered.map((scan) => (
              <ScanRow
                key={scan.id}
                scan={scan}
                selected={selected.has(scan.id)}
                onToggle={() => toggleOne(scan.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
