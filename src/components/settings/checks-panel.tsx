"use client";

import { useMemo, useState } from "react";
import {
  MagnifyingGlassIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PencilIcon,
  ArrowPathIcon,
  CheckIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useChecks, useSaveCheck, useResetCheck, type CheckConfigRecord } from "@/hooks/use-checks";
import { CHECK_CATEGORIES } from "@/server/checks-registry";
import { cn } from "@/lib/format";

const SEVERITY_LABELS: Record<string, string> = {
  WARN: "Warning",
  FAIL: "Fail",
};

export function ChecksPanel() {
  const { data: checks = [], isLoading } = useChecks();
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<CheckConfigRecord | null>(null);

  // Derived stats
  const totalEnabled = checks.filter((c) => !c.isCustom && c.enabled).length;
  const totalDisabled = checks.filter((c) => !c.isCustom && !c.enabled).length;
  const customCount = checks.filter((c) => c.isCustom).length;

  const filtered = useMemo(() => {
    return checks.filter((c) => {
      if (filterCategory !== "all" && c.category !== filterCategory) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          c.checkKey.toLowerCase().includes(q) ||
          c.label.toLowerCase().includes(q) ||
          (c.labelOverride ?? "").toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [checks, search, filterCategory]);

  // Group filtered checks by category
  const grouped = useMemo(() => {
    const map = new Map<string, CheckConfigRecord[]>();
    for (const c of filtered) {
      if (!map.has(c.category)) map.set(c.category, []);
      map.get(c.category)!.push(c);
    }
    return map;
  }, [filtered]);

  function toggleCategory(cat: string) {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  // Auto-expand when searching
  const displayExpanded = search
    ? new Set(Array.from(grouped.keys()))
    : expandedCategories;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-[var(--text-3)]">
        <ArrowPathIcon className="size-4 animate-spin" />
        Loading checks…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary bar */}
      <div className="flex items-center gap-6 rounded-xl border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-green-500" />
          <span className="text-sm font-semibold text-[var(--text-1)]">{totalEnabled}</span>
          <span className="text-xs text-[var(--text-3)]">active</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-[var(--border-2)]" />
          <span className="text-sm font-semibold text-[var(--text-1)]">{totalDisabled}</span>
          <span className="text-xs text-[var(--text-3)]">disabled</span>
        </div>
        {customCount > 0 && (
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-[var(--brand-500)]" />
            <span className="text-sm font-semibold text-[var(--text-1)]">{customCount}</span>
            <span className="text-xs text-[var(--text-3)]">custom</span>
          </div>
        )}
      </div>

      {/* Search + filter */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-3)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search checks…"
            className="w-full rounded-xl border border-[var(--border-2)] bg-[var(--surface-0)] py-2 pl-9 pr-3 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:border-[var(--brand-400)] focus:outline-none"
          />
        </div>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="rounded-xl border border-[var(--border-2)] bg-[var(--surface-0)] px-3 py-2 text-sm text-[var(--text-1)] focus:border-[var(--brand-400)] focus:outline-none"
        >
          <option value="all">All categories</option>
          {CHECK_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>

      {/* Check list grouped by category */}
      <div className="space-y-2">
        {Array.from(grouped.entries()).map(([category, catChecks]) => {
          const isExpanded = displayExpanded.has(category);
          const enabledCount = catChecks.filter((c) => c.enabled).length;
          const hasOverrides = catChecks.some((c) => c.labelOverride || c.severityOverride || !c.enabled);

          return (
            <div key={category} className="rounded-[14px] border border-[var(--border-2)] overflow-hidden">
              {/* Category header */}
              <button
                type="button"
                onClick={() => toggleCategory(category)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[var(--surface-1)] transition-colors"
              >
                {isExpanded ? (
                  <ChevronDownIcon className="size-4 shrink-0 text-[var(--text-3)]" />
                ) : (
                  <ChevronRightIcon className="size-4 shrink-0 text-[var(--text-3)]" />
                )}
                <span className="flex-1 text-sm font-semibold text-[var(--text-1)]">{category}</span>
                <div className="flex items-center gap-3">
                  {hasOverrides && (
                    <span className="rounded-full bg-[var(--brand-50)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--brand-600)]">
                      customised
                    </span>
                  )}
                  <span className="text-xs text-[var(--text-3)]">
                    {enabledCount}/{catChecks.length} active
                  </span>
                </div>
              </button>

              {/* Check rows */}
              {isExpanded && (
                <div className="divide-y divide-[var(--border-2)] border-t border-[var(--border-2)]">
                  {catChecks.map((check) => (
                    <CheckRow
                      key={check.checkKey}
                      check={check}
                      onEdit={() => setEditing(check)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {grouped.size === 0 && (
          <p className="py-8 text-center text-sm text-[var(--text-3)]">
            No checks match your search.
          </p>
        )}
      </div>

      {editing && (
        <CheckDrawer
          check={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function CheckRow({
  check,
  onEdit,
}: {
  check: CheckConfigRecord;
  onEdit: () => void;
}) {
  const saveCheck = useSaveCheck();
  const hasOverride = check.labelOverride !== null || check.severityOverride !== null;
  const displayLabel = check.labelOverride ?? check.label;

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {/* Toggle */}
      <button
        type="button"
        onClick={() => saveCheck.mutate({ checkKey: check.checkKey, enabled: !check.enabled })}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none",
          check.enabled ? "bg-[var(--brand-600)]" : "bg-[var(--border-2)]",
        )}
        title={check.enabled ? "Disable check" : "Enable check"}
      >
        <span
          className={cn(
            "inline-block size-4 transform rounded-full bg-white shadow transition",
            check.enabled ? "translate-x-4" : "translate-x-0",
          )}
        />
      </button>

      {/* Label */}
      <div className="min-w-0 flex-1">
        <span className={cn(
          "text-sm",
          check.enabled ? "text-[var(--text-1)]" : "text-[var(--text-3)] line-through",
        )}>
          {displayLabel}
        </span>
        {hasOverride && (
          <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--brand-500)]">
            custom
          </span>
        )}
        {check.severityOverride && (
          <span className={cn(
            "ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
            check.severityOverride === "FAIL"
              ? "bg-red-50 text-red-600"
              : "bg-amber-50 text-amber-700",
          )}>
            {SEVERITY_LABELS[check.severityOverride]}
          </span>
        )}
      </div>

      {/* Check key */}
      <span className="hidden font-mono text-[10px] text-[var(--text-3)] lg:block">{check.checkKey}</span>

      {/* Edit */}
      <button
        type="button"
        onClick={onEdit}
        className="shrink-0 rounded-lg p-1.5 text-[var(--text-3)] hover:bg-[var(--surface-2)] hover:text-[var(--text-1)]"
        title="Edit check"
      >
        <PencilIcon className="size-3.5" />
      </button>
    </div>
  );
}

function CheckDrawer({
  check,
  onClose,
}: {
  check: CheckConfigRecord;
  onClose: () => void;
}) {
  const saveCheck = useSaveCheck();
  const resetCheck = useResetCheck();
  const [labelOverride, setLabelOverride] = useState(check.labelOverride ?? "");
  const [severityOverride, setSeverityOverride] = useState(check.severityOverride ?? "");
  const [saving, setSaving] = useState(false);

  const isDirty =
    labelOverride !== (check.labelOverride ?? "") ||
    severityOverride !== (check.severityOverride ?? "");

  async function handleSave() {
    setSaving(true);
    await saveCheck.mutateAsync({
      checkKey: check.checkKey,
      labelOverride: labelOverride.trim() || null,
      severityOverride: (severityOverride as "WARN" | "FAIL") || null,
    });
    setSaving(false);
    onClose();
  }

  async function handleReset() {
    await resetCheck.mutateAsync(check.checkKey);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/30" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-md flex-col bg-[var(--surface-0)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-2)] px-6 py-4">
          <div>
            <p className="app-eyebrow mb-0.5">{check.category}</p>
            <h3 className="text-base font-semibold text-[var(--text-1)]">{check.labelOverride ?? check.label}</h3>
            <p className="mt-0.5 font-mono text-xs text-[var(--text-3)]">{check.checkKey}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-[var(--surface-2)]">
            <XMarkIcon className="size-5 text-[var(--text-3)]" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Label override */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-[var(--text-2)]">
              Label override
            </label>
            <p className="mb-2 text-xs text-[var(--text-3)]">
              Rename this check as it appears in scan results and reports.
            </p>
            <input
              type="text"
              value={labelOverride}
              onChange={(e) => setLabelOverride(e.target.value)}
              placeholder={check.label}
              className="w-full rounded-xl border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:border-[var(--brand-400)] focus:outline-none"
            />
          </div>

          {/* Severity override */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-[var(--text-2)]">
              Severity override
            </label>
            <p className="mb-2 text-xs text-[var(--text-3)]">
              Treat this check&apos;s issues as warnings or failures regardless of the built-in logic.
            </p>
            <select
              value={severityOverride}
              onChange={(e) => setSeverityOverride(e.target.value)}
              className="w-full rounded-xl border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-1)] focus:border-[var(--brand-400)] focus:outline-none"
            >
              <option value="">Use built-in default</option>
              <option value="WARN">Always warn (⚠)</option>
              <option value="FAIL">Always fail (✗)</option>
            </select>
          </div>

          {/* Enable / disable */}
          <div className="flex items-center justify-between rounded-xl border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-[var(--text-1)]">Enable check</p>
              <p className="text-xs text-[var(--text-3)]">Disabled checks are skipped entirely during scans.</p>
            </div>
            <button
              type="button"
              onClick={() => saveCheck.mutate({ checkKey: check.checkKey, enabled: !check.enabled })}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none",
                check.enabled ? "bg-[var(--brand-600)]" : "bg-[var(--border-2)]",
              )}
            >
              <span className={cn(
                "inline-block size-5 transform rounded-full bg-white shadow transition",
                check.enabled ? "translate-x-5" : "translate-x-0",
              )} />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--border-2)] px-6 py-4">
          <button
            type="button"
            onClick={handleReset}
            disabled={resetCheck.isPending}
            className="flex items-center gap-1.5 text-sm text-[var(--text-3)] hover:text-red-600 disabled:opacity-50"
          >
            <ArrowPathIcon className="size-4" />
            Reset to default
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[var(--border-2)] px-4 py-2 text-sm font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !isDirty}
              className="flex items-center gap-1.5 rounded-xl bg-[var(--brand-600)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-700)] disabled:opacity-50"
            >
              {saving ? <ArrowPathIcon className="size-4 animate-spin" /> : <CheckIcon className="size-4" />}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
