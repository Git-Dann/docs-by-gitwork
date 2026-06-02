"use client";

// Roles & Permissions matrix editor — Super Admin only (gated by the section page
// and the /api/roles/permissions route). Defines what each configurable role
// (Admin / Staff / Developer) can do across every product. Super Admin is shown as
// a locked, all-on column for clarity; it always has everything. Saving recomputes
// every member's effective permissions server-side.

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowPathIcon, CheckIcon, LockClosedIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/format";
import { getRolePermissions, updateRolePermissions } from "@/lib/api";
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_CATALOG,
  ROLES,
  type ConfigurableRoleId,
  type PermissionCategory,
  type RoleMatrix,
} from "@/types/auth";

const CATEGORY_LABEL: Record<PermissionCategory, string> = {
  module: "Module",
  field: "Field",
  feature: "Feature",
  settings: "Settings",
};

const CATEGORY_CHIP: Record<PermissionCategory, string> = {
  module: "bg-[var(--brand-50)] text-[var(--brand-700)]",
  field: "bg-amber-50 text-amber-700",
  feature: "bg-[var(--surface-2)] text-[var(--text-3)]",
  settings: "bg-violet-50 text-violet-700",
};

const CONFIGURABLE: ConfigurableRoleId[] = ["ADMIN", "STAFF", "DEVELOPER"];

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
          <button
            type="button"
            onClick={resetToDefaults}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
          >
            <ArrowPathIcon className="h-3.5 w-3.5" />
            Reset to defaults
          </button>
        </div>

        {loading || !matrix ? (
          <p className="mt-6 text-sm text-[var(--text-3)]">Loading…</p>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--border-2)]">
                  <th className="py-2 pr-4 text-left align-bottom font-medium text-[var(--text-2)]">
                    Permission
                  </th>
                  {ROLES.map((r) => (
                    <th
                      key={r.id}
                      className="px-2 pb-2 text-center align-bottom font-medium"
                      style={{ width: 96 }}
                    >
                      <span className="block text-[var(--text-1)]">{r.label}</span>
                      {!r.configurable ? (
                        <span className="mt-0.5 block text-[10px] font-normal leading-tight text-[var(--text-4)]">
                          Everything · locked
                        </span>
                      ) : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERMISSION_CATALOG.map((group) => (
                  <ProductRows
                    key={group.product}
                    product={group.product}
                    permissions={group.permissions}
                    matrix={matrix}
                    onToggle={toggle}
                  />
                ))}
              </tbody>
            </table>
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

function ProductRows({
  product,
  permissions,
  matrix,
  onToggle,
}: {
  product: string;
  permissions: readonly { id: string; label: string; description: string; category: PermissionCategory }[];
  matrix: RoleMatrix;
  onToggle: (role: ConfigurableRoleId, id: string) => void;
}) {
  return (
    <>
      <tr>
        <td colSpan={1 + ROLES.length} className="pt-5 pb-1">
          <span className="app-eyebrow">{product}</span>
        </td>
      </tr>
      {permissions.map((perm) => (
        <tr key={perm.id} className="border-t border-[var(--border-3)] align-top">
          <td className="py-2.5 pr-4">
            <div className="flex items-center gap-2">
              <span className="font-medium text-[var(--text-1)]">{perm.label}</span>
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                  CATEGORY_CHIP[perm.category],
                )}
              >
                {CATEGORY_LABEL[perm.category]}
              </span>
            </div>
            <p className="mt-0.5 max-w-md text-[11px] leading-tight text-[var(--text-4)]">
              {perm.description}
            </p>
          </td>
          {ROLES.map((r) => {
            if (!r.configurable) {
              // Super Admin — always on, locked.
              return (
                <td key={r.id} className="px-2 py-2.5 text-center">
                  <CheckIcon className="mx-auto h-4 w-4 text-[var(--text-4)]" aria-label="Always on" />
                </td>
              );
            }
            const role = r.id as ConfigurableRoleId;
            const checked = matrix[role].includes(perm.id);
            return (
              <td key={r.id} className="px-2 py-2.5 text-center">
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer accent-[var(--brand-700)]"
                  checked={checked}
                  onChange={() => onToggle(role, perm.id)}
                  aria-label={`${r.label}: ${perm.label}`}
                />
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
