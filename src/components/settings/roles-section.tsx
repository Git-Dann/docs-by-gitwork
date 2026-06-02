"use client";

// Roles & Permissions matrix editor — Super Admin only (gated by the section page
// and the /api/roles/permissions route). Defines what each configurable role
// (Admin / Staff / Developer) can do across every product. Super Admin is shown as
// a locked, all-on column for clarity; it always has everything. Saving recomputes
// every member's effective permissions server-side.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowPathIcon,
  CheckIcon,
  ChevronRightIcon,
  LockClosedIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/format";
import { getRolePermissions, updateRolePermissions } from "@/lib/api";
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_CATALOG,
  ROLES,
  type ConfigurableRoleId,
  type PermissionCategory,
  type PermissionDef,
  type RoleMatrix,
} from "@/types/auth";

const CATEGORY_LABEL: Record<PermissionCategory, string> = {
  module: "Module",
  field: "Field",
  feature: "Feature",
  settings: "Settings",
  action: "Action",
};

const CATEGORY_CHIP: Record<PermissionCategory, string> = {
  module: "bg-[var(--brand-50)] text-[var(--brand-700)]",
  field: "bg-amber-50 text-amber-700",
  feature: "bg-[var(--surface-2)] text-[var(--text-3)]",
  settings: "bg-violet-50 text-violet-700",
  action: "bg-sky-50 text-sky-700",
};

const CONFIGURABLE: ConfigurableRoleId[] = ["ADMIN", "STAFF", "DEVELOPER"];

// Shared column template: permission label + the four role columns.
const GRID = "grid grid-cols-[minmax(0,1fr)_repeat(4,64px)] items-center gap-x-2";

function sameMatrix(a: RoleMatrix, b: RoleMatrix): boolean {
  return CONFIGURABLE.every(
    (role) => a[role].length === b[role].length && [...a[role]].sort().join() === [...b[role]].sort().join(),
  );
}

export function RolesSection() {
  const [matrix, setMatrix] = useState<RoleMatrix | null>(null);
  const [initial, setInitial] = useState<RoleMatrix | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  // Which product groups are expanded. Collapsed by default so the matrix stays compact;
  // each collapsed header still shows a per-role count so you get the overview at a glance.
  const [open, setOpen] = useState<Set<string>>(new Set());
  const allOpen = open.size === PERMISSION_CATALOG.length;
  const toggleOpen = (product: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(product)) next.delete(product);
      else next.add(product);
      return next;
    });
  const toggleAll = () =>
    setOpen(allOpen ? new Set() : new Set(PERMISSION_CATALOG.map((g) => g.product)));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { matrix } = await getRolePermissions();
      setMatrix(matrix);
      setInitial(matrix);
    } catch {
      setError("Couldn't load the role matrix.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(
    () => (matrix && initial ? !sameMatrix(matrix, initial) : false),
    [matrix, initial],
  );

  function toggle(role: ConfigurableRoleId, id: string) {
    setJustSaved(false);
    setMatrix((prev) => {
      if (!prev) return prev;
      const set = new Set(prev[role]);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return { ...prev, [role]: [...set] };
    });
  }

  function resetToDefaults() {
    setJustSaved(false);
    setMatrix({
      ADMIN: [...DEFAULT_ROLE_PERMISSIONS.ADMIN],
      STAFF: [...DEFAULT_ROLE_PERMISSIONS.STAFF],
      DEVELOPER: [...DEFAULT_ROLE_PERMISSIONS.DEVELOPER],
    });
  }

  async function save() {
    if (!matrix) return;
    setSaving(true);
    setError(null);
    try {
      const { matrix: saved } = await updateRolePermissions(matrix);
      setMatrix(saved);
      setInitial(saved);
      setJustSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="proposal-form-theme space-y-6">
      <section className="app-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <LockClosedIcon className="mt-0.5 h-5 w-5 text-[var(--text-3)]" />
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-1)]">Role permission matrix</h2>
              <p className="mt-1 max-w-2xl text-xs text-[var(--text-4)]">
                Define what each role can do. Tick a box to grant that role a permission. Changes
                apply to everyone with the role (plus any per-person overrides set on the Team tab).
                Super Admins always have everything and can&apos;t be limited.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={toggleAll}
              className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
            >
              {allOpen ? "Collapse all" : "Expand all"}
            </button>
            <button
              type="button"
              onClick={resetToDefaults}
              className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
            >
              <ArrowPathIcon className="h-3.5 w-3.5" />
              Reset
            </button>
          </div>
        </div>

        {loading || !matrix ? (
          <p className="mt-6 text-sm text-[var(--text-3)]">Loading…</p>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <div className="min-w-[560px]">
              {/* Sticky role-column header */}
              <div
                className={cn(
                  GRID,
                  "sticky top-0 z-10 border-b border-[var(--border-2)] bg-white px-3 pb-2",
                )}
              >
                <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-4)]">
                  Permission
                </span>
                {ROLES.map((r) => (
                  <span key={r.id} className="text-center">
                    <span className="block text-xs font-semibold text-[var(--text-1)]">{r.label}</span>
                    {!r.configurable ? (
                      <span className="block text-[10px] leading-tight text-[var(--text-4)]">locked</span>
                    ) : null}
                  </span>
                ))}
              </div>

              {/* Collapsible product groups */}
              <div className="mt-2 space-y-2">
                {PERMISSION_CATALOG.map((group) => (
                  <ProductGroup
                    key={group.product}
                    product={group.product}
                    permissions={group.permissions}
                    matrix={matrix}
                    onToggle={toggle}
                    open={open.has(group.product)}
                    onToggleOpen={() => toggleOpen(group.product)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Sticky-ish save bar */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-[var(--text-4)]">
          {error ? (
            <span className="text-[var(--danger-500)]">{error}</span>
          ) : justSaved ? (
            <span className="text-green-600">Saved — every member&apos;s access has been updated.</span>
          ) : dirty ? (
            "Unsaved changes."
          ) : (
            "Module changes show in the sidebar after the member's next sign-in; field and feature changes apply immediately."
          )}
        </p>
        <Button type="button" variant="primary" onClick={save} loading={saving} disabled={!dirty}>
          Save matrix
        </Button>
      </div>
    </div>
  );
}

/** One collapsible product card: a header (name + per-role count summary) and, when
 *  expanded, the permission rows aligned under the role columns. */
function ProductGroup({
  product,
  permissions,
  matrix,
  onToggle,
  open,
  onToggleOpen,
}: {
  product: string;
  permissions: readonly PermissionDef[];
  matrix: RoleMatrix;
  onToggle: (role: ConfigurableRoleId, id: string) => void;
  open: boolean;
  onToggleOpen: () => void;
}) {
  const total = permissions.length;
  const summary = (role: ConfigurableRoleId): string => {
    const n = permissions.filter((p) => matrix[role].includes(p.id)).length;
    return n === 0 ? "—" : n === total ? "all" : String(n);
  };

  return (
    <div className="overflow-hidden rounded-[10px] border border-[var(--border-2)]">
      {/* Header — click to expand. Counts sit under each role column. */}
      <button
        type="button"
        onClick={onToggleOpen}
        className={cn(GRID, "w-full bg-[var(--surface-1)] px-3 py-2.5 text-left transition hover:bg-[var(--surface-2)]")}
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2">
          <ChevronRightIcon
            className={cn("h-4 w-4 shrink-0 text-[var(--text-4)] transition-transform", open && "rotate-90")}
          />
          <span className="truncate text-sm font-semibold text-[var(--text-1)]">{product}</span>
          <span className="shrink-0 text-[11px] text-[var(--text-4)]">{total}</span>
        </span>
        <span className="text-center text-[10px] font-medium uppercase text-[var(--text-4)]">all</span>
        {CONFIGURABLE.map((role) => {
          const label = summary(role);
          return (
            <span
              key={role}
              className={cn(
                "text-center text-xs tabular-nums",
                label === "—" ? "text-[var(--text-4)]" : "font-medium text-[var(--brand-700)]",
              )}
            >
              {label}
            </span>
          );
        })}
      </button>

      {open ? (
        <div className="divide-y divide-[var(--border-3)] border-t border-[var(--border-2)]">
          {permissions.map((perm) => (
            <div key={perm.id} className={cn(GRID, "px-3 py-2.5")}>
              <div className="min-w-0 pr-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-medium text-[var(--text-1)]">{perm.label}</span>
                  <span
                    className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", CATEGORY_CHIP[perm.category])}
                  >
                    {CATEGORY_LABEL[perm.category]}
                  </span>
                  {perm.highRisk ? (
                    <span className="rounded-full bg-[var(--danger-50)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--danger-700)]">
                      High-risk
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-[11px] leading-tight text-[var(--text-4)]">{perm.description}</p>
              </div>
              {/* Super Admin — always on, locked. */}
              <div className="flex items-center justify-center">
                <CheckIcon className="h-4 w-4 text-[var(--text-4)]" aria-label="Always on" />
              </div>
              {CONFIGURABLE.map((role) => (
                <div key={role} className="flex items-center justify-center">
                  <input
                    type="checkbox"
                    className="h-4 w-4 cursor-pointer accent-[var(--brand-700)]"
                    checked={matrix[role].includes(perm.id)}
                    onChange={() => onToggle(role, perm.id)}
                    aria-label={`${role}: ${perm.label}`}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
