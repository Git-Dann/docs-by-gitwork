"use client";

// Workspace team management — invite-link based, paired with the Google OAuth sign-in flow.
//
// This is the canonical Team UI. It supersedes the older email/password member modals that
// used to live inside `settings-panel.tsx::TeamTab` (kept around there for compatibility but
// no longer surfaced in the IA). The same data also powers `/app/team` which exists as a
// thin redirect into this section.

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  CheckIcon,
  ClipboardDocumentIcon,
  PencilIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { SettingsCard } from "@/components/settings/settings-card";
import { cn } from "@/lib/format";
import { useClientList } from "@/hooks/use-proposals";
import { getRolePermissions, listMemberClients, setMemberClients } from "@/lib/api";
import {
  ALL_PERMISSION_IDS,
  PERMISSION_CATALOG,
  PERMISSION_PRESETS,
  ROLES,
  canManageRole,
  isAtLeast,
  isSuperAdmin,
  roleLabel,
  type ConfigurableRoleId,
  type PermissionCategory,
  type PermissionPresetId,
  type RoleId,
  type RoleMatrix,
} from "@/types/auth";

interface Invite {
  id: string;
  token: string;
  label: string | null;
  status: string;
  createdAt: string;
  invitedBy: { name: string | null; email: string };
  acceptedBy: { name: string | null; email: string } | null;
}

interface Member {
  id: string;
  role: string;
  permissions: string[];
  createdAt: string;
  /** True once the member has actually signed in (Google OAuth captured); false = provisioned/invited only. */
  hasSignedIn: boolean;
  user: { id: string; name: string | null; email: string };
}

export function TeamSection() {
  const { data: session } = useSession();
  const sessionRole = session?.user?.role ?? "";
  const isAdmin = isAtLeast(sessionRole, "ADMIN");
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [accessMember, setAccessMember] = useState<Member | null>(null);

  const load = useCallback(async () => {
    const [membersRes, invitesRes] = await Promise.all([
      fetch("/api/team/members"),
      fetch("/api/team/invites"),
    ]);
    if (membersRes.ok) setMembers(await membersRes.json().then((r) => r.data ?? r));
    if (invitesRes.ok) setInvites(await invitesRes.json().then((r) => r.data ?? r));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createInvite() {
    setCreating(true);
    const res = await fetch("/api/team/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: label.trim() || undefined }),
    });
    if (res.ok) {
      setLabel("");
      await load();
    }
    setCreating(false);
  }

  async function revokeInvite(id: string) {
    await fetch(`/api/team/invites/${id}`, { method: "DELETE" });
    await load();
  }

  // Member removal lives inside the Edit modal (Danger zone, two-click confirm) — see
  // MemberAccessModal at the bottom of this file.

  function copyLink(token: string, id: string) {
    navigator.clipboard.writeText(`${baseUrl}/invite/${token}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function startEditLabel(invite: Invite) {
    setEditingId(invite.id);
    setEditingLabel(invite.label ?? "");
  }

  async function saveLabel(id: string) {
    await fetch(`/api/team/invites/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: editingLabel.trim() || null }),
    });
    setEditingId(null);
    await load();
  }

  const pendingInvites = invites.filter((i) => i.status === "PENDING");
  const pastInvites = invites.filter((i) => i.status !== "PENDING");

  // Sort: Super Admin → Admin → Staff → Developer, then A-Z within each group.
  const ROLE_ORDER: Record<string, number> = {
    SUPER_ADMIN: 0,
    ADMIN: 1,
    STAFF: 2,
    DEVELOPER: 3,
  };
  const sortedMembers = [...members].sort((a, b) => {
    const ra = ROLE_ORDER[a.role] ?? 99;
    const rb = ROLE_ORDER[b.role] ?? 99;
    if (ra !== rb) return ra - rb;
    const na = (a.user.name ?? a.user.email).toLowerCase();
    const nb = (b.user.name ?? b.user.email).toLowerCase();
    return na.localeCompare(nb);
  });

  return (
    <div className="proposal-form-theme space-y-6">
      {/* Create invite */}
      {isAdmin ? (
        <SettingsCard number="01" title="Create invite">
          <div className="flex flex-wrap gap-3">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder='Label (e.g. "For Sarah") — optional'
              className="app-input flex-1 min-w-[200px]"
              onKeyDown={(e) => e.key === "Enter" && createInvite()}
            />
            <button
              onClick={createInvite}
              disabled={creating}
              className="shrink-0 rounded-[8px] bg-[var(--brand-700)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--brand-800)] disabled:opacity-60"
            >
              {creating ? "Creating…" : "Generate link"}
            </button>
          </div>
          <p className="mt-2 text-xs text-[var(--text-4)]">
            Anyone with the link can join using their @gitwork.co.uk Google account.
          </p>
        </SettingsCard>
      ) : null}

      {/* Pending invites */}
      {pendingInvites.length > 0 ? (
        <SettingsCard number="02" title="Pending invites">
          <div className="divide-y divide-[var(--border-2)]">
            {pendingInvites.map((inv) => (
              <div key={inv.id} className="flex items-center gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  {editingId === inv.id ? (
                    <input
                      autoFocus
                      value={editingLabel}
                      onChange={(e) => setEditingLabel(e.target.value)}
                      onBlur={() => saveLabel(inv.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveLabel(inv.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="app-input mb-0.5 w-full px-2 py-1 text-sm font-medium"
                      placeholder="Add a label…"
                    />
                  ) : (
                    <button
                      onClick={() => isAdmin && startEditLabel(inv)}
                      className={`group flex max-w-full items-center gap-1.5 truncate text-left text-sm font-medium text-[var(--text-1)] ${isAdmin ? "hover:text-[var(--brand-700)]" : "cursor-default"}`}
                      title={isAdmin ? "Click to edit label" : undefined}
                    >
                      <span className="truncate">{inv.label ?? "Invite link"}</span>
                      {isAdmin ? (
                        <PencilIcon className="h-3.5 w-3.5 shrink-0 text-[var(--text-4)] opacity-0 transition-opacity group-hover:opacity-100" />
                      ) : null}
                    </button>
                  )}
                  <p className="mt-0.5 truncate text-xs text-[var(--text-4)]">
                    {`${baseUrl}/invite/${inv.token}`}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--text-4)]">
                    Created by {inv.invitedBy.name ?? inv.invitedBy.email} ·{" "}
                    {new Date(inv.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => copyLink(inv.token, inv.id)}
                  className="flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
                >
                  {copiedId === inv.id ? (
                    <>
                      <CheckIcon className="h-3.5 w-3.5 text-green-500" /> Copied
                    </>
                  ) : (
                    <>
                      <ClipboardDocumentIcon className="h-3.5 w-3.5" /> Copy link
                    </>
                  )}
                </button>
                {isAdmin ? (
                  <button
                    onClick={() => revokeInvite(inv.id)}
                    className="rounded-[6px] p-1.5 text-[var(--text-4)] transition hover:bg-[var(--danger-50)] hover:text-[var(--danger-500)]"
                    title="Revoke invite"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </SettingsCard>
      ) : null}

      {/* Members */}
      <SettingsCard
        number="03"
        title="Members"
        right={<span className="text-xs text-[var(--text-4)]">{members.length} people</span>}
        bodyClassName="p-0"
      >
        {loading ? (
          <p className="px-6 py-5 text-sm text-[var(--text-3)]">Loading…</p>
        ) : (
          <div>
            {/* Header row — edge-to-edge, no extra inset */}
            <div className="hidden items-center gap-3 border-b border-[var(--border-2)] bg-[var(--surface-1)] px-6 py-2.5 sm:grid sm:grid-cols-[minmax(0,1fr)_110px_minmax(0,220px)_80px]">
              <span className="app-eyebrow">Member</span>
              <span className="app-eyebrow">Role</span>
              <span className="app-eyebrow">Access</span>
              <span />
            </div>
            <div className="divide-y divide-[var(--border-2)]">
              {sortedMembers.map((m) => (
                <div
                  key={m.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-6 py-3.5 sm:grid-cols-[minmax(0,1fr)_110px_minmax(0,220px)_80px]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand-100)] text-xs font-semibold text-[var(--brand-700)]">
                      {(m.user.name ?? m.user.email)[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-[var(--text-1)]">
                          {m.user.name ?? m.user.email}
                        </p>
                        <MemberStatus active={m.hasSignedIn} />
                      </div>
                      <p className="truncate text-xs text-[var(--text-4)]">{m.user.email}</p>
                    </div>
                  </div>
                  <span
                    className={cn(
                      "hidden w-fit rounded-full px-2 py-0.5 text-xs font-medium sm:inline-block",
                      isAtLeast(m.role, "ADMIN")
                        ? "bg-[var(--brand-50)] text-[var(--brand-700)]"
                        : "bg-[var(--surface-2)] text-[var(--text-3)]",
                    )}
                  >
                    {roleLabel(m.role)}
                  </span>
                  <span className="hidden truncate text-xs text-[var(--text-4)] sm:block">
                    {accessSummary(m.role, m.permissions)}
                  </span>
                  {canManageRole(sessionRole, m.role) ? (
                    <button
                      onClick={() => setAccessMember(m)}
                      className="flex items-center gap-1.5 justify-self-end rounded-[6px] border border-[var(--border-2)] px-2.5 py-1 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
                      title="Edit access"
                    >
                      <PencilIcon className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Edit</span>
                    </button>
                  ) : (
                    <span className="hidden sm:block" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </SettingsCard>

      {/* Past invites */}
      {pastInvites.length > 0 ? (
        <SettingsCard number="04" title="Past invites">
          <div className="divide-y divide-[var(--border-2)]">
            {pastInvites.map((inv) => (
              <div key={inv.id} className="flex items-center gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--text-1)]">
                    {inv.label ?? "Invite link"}
                  </p>
                  {inv.acceptedBy ? (
                    <p className="mt-0.5 text-xs text-[var(--text-4)]">
                      Accepted by {inv.acceptedBy.name ?? inv.acceptedBy.email}
                    </p>
                  ) : null}
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    inv.status === "ACCEPTED"
                      ? "bg-green-50 text-green-700"
                      : "bg-[var(--surface-2)] text-[var(--text-4)]"
                  }`}
                >
                  {inv.status.charAt(0) + inv.status.slice(1).toLowerCase()}
                </span>
                {isAdmin ? (
                  <button
                    onClick={() => revokeInvite(inv.id)}
                    className="rounded-[6px] p-1.5 text-[var(--text-4)] transition hover:bg-[var(--danger-50)] hover:text-[var(--danger-500)]"
                    title="Remove from list"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </SettingsCard>
      ) : null}

      {accessMember ? (
        <MemberAccessModal
          member={accessMember}
          actorRole={sessionRole}
          onClose={() => setAccessMember(null)}
          onSaved={async () => {
            setAccessMember(null);
            await load();
          }}
        />
      ) : null}

      {/* Merge accounts — Super Admin only */}
      {isSuperAdmin(sessionRole) ? <MergeAccountsCard onMerged={load} /> : null}
    </div>
  );
}

// ── Member edit modal ────────────────────────────────────────────────────────
// Pick a role (gated so you can't assign at/above your own), then optionally tweak
// individual permissions as per-person overrides on top of that role. The role
// matrix (fetched here) provides each role's defaults so we can show what's
// inherited vs overridden and compute the override delta on save. Save → PATCH
// /api/team/members/[id]; delete → DELETE.

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

const ALL_MODULE_IDS = PERMISSION_CATALOG.flatMap((g) => g.permissions)
  .filter((p) => p.category === "module")
  .map((p) => p.id);

/** One-line summary of a member's effective access for the members table. */
function accessSummary(role: string, permissions: string[]): string {
  if (isAtLeast(role, "ADMIN")) return "Full access";
  const moduleCount = ALL_MODULE_IDS.filter((id) => permissions.includes(id)).length;
  const parts = [`${moduleCount} module${moduleCount === 1 ? "" : "s"}`];
  parts.push(permissions.includes("seeAllClients") ? "all clients" : "scoped");
  if (!permissions.includes("code.viewRates")) parts.push("no rates");
  return parts.join(" · ");
}

/**
 * Activity marker for the members table — a sanctioned 6px status dot + mono micro-label.
 * Solid green = the member has signed in (active on the platform); hollow steel ring =
 * provisioned/invited but not yet signed in. Label hides below `sm` (the dot still shows).
 */
function MemberStatus({ active }: { active: boolean }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5"
      title={active ? "Active — has signed in" : "Invited — hasn't signed in yet"}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          active ? "bg-[var(--success-500)]" : "border-[1.5px] border-[var(--text-4)] bg-transparent",
        )}
      />
      <span
        className="hidden text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-4)] sm:inline"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {active ? "Active" : "Invited"}
      </span>
    </span>
  );
}

function MemberAccessModal({
  member,
  actorRole,
  onClose,
  onSaved,
}: {
  member: Member;
  actorRole: string;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const { data: session } = useSession();
  const isSelf = member.user.email === session?.user?.email;

  const [role, setRole] = useState<RoleId>((member.role as RoleId) ?? "STAFF");
  // The member's effective (resolved) permission set — what they can actually do.
  const [effective, setEffective] = useState<Set<string>>(new Set(member.permissions ?? []));
  const [matrix, setMatrix] = useState<RoleMatrix | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSuper = isSuperAdmin(role);
  // Roles this actor may assign (never at or above their own).
  const assignableRoles = ROLES.filter((r) => canManageRole(actorRole, r.id));

  // Fetch the role matrix so we can show inheritance and compute the override delta.
  useEffect(() => {
    let cancelled = false;
    getRolePermissions()
      .then(({ matrix }) => {
        if (!cancelled) setMatrix(matrix);
      })
      .catch(() => {
        /* leave null — UI shows a loading note and disables save */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** The permissions a role grants by default (Super Admin = everything). */
  const roleDefault = useCallback(
    (r: RoleId): Set<string> =>
      r === "SUPER_ADMIN"
        ? new Set(ALL_PERMISSION_IDS)
        : new Set(matrix ? matrix[r as ConfigurableRoleId] : []),
    [matrix],
  );

  // Client assignments — only relevant when "See all clients" is off.
  const clientsQuery = useClientList();
  const workspaceClients = clientsQuery.data?.clients ?? [];
  const [clientIds, setClientIds] = useState<Set<string>>(new Set());
  const [clientsLoaded, setClientsLoaded] = useState(false);
  const restrictedToClients = !isSuper && !effective.has("seeAllClients");

  useEffect(() => {
    let cancelled = false;
    listMemberClients(member.id)
      .then((rows) => {
        if (!cancelled) {
          setClientIds(new Set(rows.map((r) => r.clientId)));
          setClientsLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setClientsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [member.id]);

  function toggleClient(id: string) {
    setClientIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Two-step delete: first click reveals the confirm strip, second click does it.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function togglePermission(id: string) {
    if (isSuper) return; // Super Admin always has everything.
    setEffective((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Changing the role resets the permission ticks to that role's defaults (a clean
  // slate); the admin can then re-tweak individual permissions as overrides.
  function changeRole(next: RoleId) {
    setRole(next);
    setEffective(next === "SUPER_ADMIN" ? new Set(ALL_PERMISSION_IDS) : roleDefault(next));
  }

  function applyPreset(presetId: PermissionPresetId) {
    const preset = PERMISSION_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setRole(preset.role);
    setEffective(new Set(preset.permissions));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      // Overrides = the delta between the chosen effective set and the role's defaults.
      const base = roleDefault(role);
      const overrides = isSuper
        ? { grant: [], revoke: [] }
        : {
            grant: [...effective].filter((id) => !base.has(id)),
            revoke: [...base].filter((id) => !effective.has(id)),
          };

      const res = await fetch(`/api/team/members/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, permissionOverrides: overrides }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `Save failed (${res.status})`);
      }
      if (restrictedToClients) {
        await setMemberClients(member.id, Array.from(clientIds));
      }
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/team/members/${member.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `Remove failed (${res.status})`);
      }
      await onSaved();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Remove failed");
      setDeleting(false);
    }
  }

  const base = roleDefault(role);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="proposal-form-theme flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-[14px] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--border-2)] px-6 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand-100)] text-sm font-semibold text-[var(--brand-700)]">
              {(member.user.name ?? member.user.email)[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="app-eyebrow">Edit member</p>
              <h2 className="mt-0.5 truncate text-lg font-semibold text-[var(--text-1)]">
                {member.user.name ?? member.user.email}
              </h2>
              <p className="mt-0.5 truncate text-xs text-[var(--text-4)]">{member.user.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[6px] p-1.5 text-[var(--text-4)] hover:bg-[var(--surface-1)]"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Presets — equal-height, top-aligned cards */}
        <div className="shrink-0 border-b border-[var(--border-2)] px-6 py-4">
          <p className="mb-2 text-xs font-medium text-[var(--text-2)]">Quick presets</p>
          <div className="grid items-stretch gap-2 sm:grid-cols-3">
            {PERMISSION_PRESETS.filter((p) => canManageRole(actorRole, p.role)).map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset.id)}
                className="flex h-full flex-col rounded-[10px] border border-[var(--border-2)] px-3 py-2.5 text-left text-xs transition hover:bg-[var(--surface-1)]"
                title={preset.description}
              >
                <span className="font-semibold text-[var(--text-1)]">{preset.label}</span>
                <span className="mt-1 text-[11px] leading-tight text-[var(--text-4)]">
                  {preset.description}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Body — fixed height, two independently-scrolling columns */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:divide-x md:divide-[var(--border-2)] md:overflow-hidden">
          {/* Left column: Role + assigned clients + danger zone */}
          <div className="shrink-0 space-y-5 border-b border-[var(--border-2)] px-6 py-5 md:w-[340px] md:overflow-y-auto md:border-b-0">
            <div>
              <p className="mb-2 text-xs font-medium text-[var(--text-2)]">Role</p>
              <div className="space-y-2">
                {assignableRoles.map((r) => (
                  <label
                    key={r.id}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-[10px] border px-3 py-2.5",
                      role === r.id
                        ? "border-[var(--brand-600)] bg-[var(--surface-brand)]"
                        : "border-[var(--border-2)] bg-white hover:bg-[var(--surface-1)]",
                    )}
                  >
                    <input
                      type="radio"
                      checked={role === r.id}
                      onChange={() => changeRole(r.id)}
                      className="mt-0.5"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-[var(--text-1)]">{r.label}</span>
                      <span className="mt-0.5 block text-[11px] leading-tight text-[var(--text-4)]">
                        {r.description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Assigned clients — shown when scoped to specific clients (See all clients off). */}
            {restrictedToClients ? (
              <div>
                <p className="mb-1 text-xs font-medium text-[var(--text-2)]">Assigned clients</p>
                <p className="mb-2 text-[11px] text-[var(--text-4)]">
                  With “See all clients” off, this member only sees these clients across Portal and
                  the task board.
                </p>
                {clientsQuery.isPending || !clientsLoaded ? (
                  <p className="text-xs text-[var(--text-4)]">Loading clients…</p>
                ) : workspaceClients.length === 0 ? (
                  <p className="text-xs text-[var(--text-4)]">No clients in the workspace yet.</p>
                ) : (
                  <div className="grid gap-1.5">
                    {workspaceClients.map((c) => (
                      <label
                        key={c.id}
                        className="flex items-center gap-2 rounded-[8px] border border-[var(--border-3)] bg-white px-3 py-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={clientIds.has(c.id)}
                          onChange={() => toggleClient(c.id)}
                        />
                        <span className="min-w-0 truncate text-[var(--text-1)]">{c.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {/* Danger zone */}
            {!isSelf ? (
              <div className="rounded-[10px] border border-[var(--danger-200)] bg-[var(--danger-50)] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--danger-700)]">
                  Danger zone
                </p>
                <p className="mt-1 text-[11px] leading-tight text-[var(--text-3)]">
                  Removes the member from this workspace. Their Foundry sign-in stops working on the
                  next request. Reversible only by sending a new invite.
                </p>
                {!confirmingDelete ? (
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(true)}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--danger-300)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--danger-700)] transition hover:bg-[var(--danger-100)]"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                    Remove from workspace…
                  </button>
                ) : (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs font-semibold text-[var(--danger-700)]">
                      Remove {member.user.name ?? member.user.email}?
                    </p>
                    <div className="flex gap-2">
                      <Button type="button" variant="danger" size="sm" onClick={confirmDelete} loading={deleting}>
                        Yes, remove
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setConfirmingDelete(false);
                          setDeleteError(null);
                        }}
                        disabled={deleting}
                      >
                        Keep
                      </Button>
                    </div>
                    {deleteError ? <p className="text-xs text-[var(--danger-500)]">{deleteError}</p> : null}
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* Right column: Permissions (effective, with per-person override badges) */}
          <div className="min-h-0 flex-1 px-6 py-5 md:overflow-y-auto">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-[var(--text-2)]">Permissions</p>
              {isSuper ? (
                <span className="text-[11px] text-[var(--text-4)]">
                  Super Admins have everything — can&apos;t be limited.
                </span>
              ) : (
                <span className="text-[11px] text-[var(--text-4)]">Ticked = allowed · outlined = override</span>
              )}
            </div>

            {!matrix && !isSuper ? (
              <p className="text-xs text-[var(--text-4)]">Loading role defaults…</p>
            ) : (
              <div className="space-y-4">
                {PERMISSION_CATALOG.map((group) => (
                  <div key={group.product}>
                    <p className="app-eyebrow mb-1.5">{group.product}</p>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {group.permissions.map((perm) => {
                        const checked = isSuper || effective.has(perm.id);
                        const inDefault = base.has(perm.id);
                        const overridden = !isSuper && checked !== inDefault;
                        return (
                          <label
                            key={perm.id}
                            className={cn(
                              "flex items-start gap-2 rounded-[8px] border bg-white px-3 py-2 text-sm",
                              overridden ? "border-[var(--brand-400)]" : "border-[var(--border-3)]",
                              isSuper && "opacity-60",
                            )}
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5 accent-[var(--brand-700)]"
                              checked={checked}
                              onChange={() => togglePermission(perm.id)}
                              disabled={isSuper}
                            />
                            <span className="min-w-0">
                              <span className="flex flex-wrap items-center gap-1.5">
                                <span className="font-medium text-[var(--text-1)]">{perm.label}</span>
                                <span
                                  className={cn(
                                    "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                                    CATEGORY_CHIP[perm.category],
                                  )}
                                >
                                  {CATEGORY_LABEL[perm.category]}
                                </span>
                                {overridden ? (
                                  <span className="rounded-full bg-[var(--surface-brand)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--brand-700)]">
                                    {checked ? "+ added" : "− removed"}
                                  </span>
                                ) : null}
                              </span>
                              <span className="mt-0.5 block text-[11px] leading-tight text-[var(--text-4)]">
                                {perm.description}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {error ? (
          <p className="shrink-0 border-t border-[var(--border-2)] px-6 py-3 text-sm text-[var(--danger-500)]">
            {error}
          </p>
        ) : null}

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-[var(--border-2)] px-6 py-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={save} loading={saving} disabled={!matrix && !isSuper}>
            Save changes
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Merge accounts (Super Admin only) ────────────────────────────────────────
// Use when a dev had a placeholder/old email and now has a gitwork email.
// Transfers all data from the old account into the new one, then deletes the old.

function MergeAccountsCard({ onMerged }: { onMerged: () => void }) {
  const [keepEmail, setKeepEmail] = useState("");
  const [mergeEmail, setMergeEmail] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!confirm) { setConfirm(true); return; }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/dev/merge-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keepEmail: keepEmail.trim(), mergeEmail: mergeEmail.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Merge failed");
      } else {
        const r = json.data ?? json;
        const t = r.transferred ?? {};
        setResult(
          `Merged. Transferred: ${t.clientAssignments ?? 0} client assignments, ` +
          `${(t.tasks ?? 0) + (t.taskAssignees ?? 0)} task rows, ` +
          `${t.leaveRequests ?? 0} leave requests, ` +
          `${t.expenses ?? 0} expenses, ` +
          `${t.dailyUpdates ?? 0} daily updates. ` +
          `Candidate email updated: ${t.candidateEmailUpdated ? "yes" : "no"}. ` +
          `Membership: ${r.membershipAction}.`,
        );
        setKeepEmail("");
        setMergeEmail("");
        setConfirm(false);
        onMerged();
      }
    } catch {
      setError("Network error — check console.");
    }
    setLoading(false);
  }

  return (
    <SettingsCard number="05" title="Merge accounts">
      <p className="text-sm leading-6 text-[var(--text-3)]">
        Use when a team member previously had a placeholder email and has now logged in with their{" "}
        <code className="rounded bg-[var(--surface-2)] px-1 py-0.5 text-xs">@gitwork.co.uk</code>{" "}
        address — creating two accounts. All data (client assignments, tasks, leave, standup logs)
        is transferred from the old account to the new one, then the old account is deleted.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="app-eyebrow mb-1.5 block">Keep (new gitwork email)</label>
          <input
            type="email"
            value={keepEmail}
            onChange={(e) => { setKeepEmail(e.target.value); setConfirm(false); setResult(null); }}
            placeholder="nasir@gitwork.co.uk"
            className="app-input w-full"
          />
        </div>
        <div>
          <label className="app-eyebrow mb-1.5 block">Merge from (old / placeholder email)</label>
          <input
            type="email"
            value={mergeEmail}
            onChange={(e) => { setMergeEmail(e.target.value); setConfirm(false); setResult(null); }}
            placeholder="nasir@gmail.com"
            className="app-input w-full"
          />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          disabled={loading || !keepEmail.trim() || !mergeEmail.trim()}
          onClick={run}
          className={cn(
            "rounded-[8px] px-4 py-2 text-sm font-medium transition disabled:opacity-50",
            confirm
              ? "bg-[var(--danger-500)] text-white hover:bg-[var(--danger-600)]"
              : "bg-[var(--brand-700)] text-white hover:bg-[var(--brand-800)]",
          )}
        >
          {loading ? "Merging…" : confirm ? "Confirm merge — this is irreversible" : "Merge accounts"}
        </button>
        {confirm && !loading ? (
          <button
            type="button"
            onClick={() => setConfirm(false)}
            className="text-sm text-[var(--text-4)] hover:text-[var(--text-2)]"
          >
            Cancel
          </button>
        ) : null}
      </div>
      {result ? (
        <p className="mt-3 rounded-[8px] border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-300">
          {result}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm text-[var(--danger-500)]">{error}</p>
      ) : null}
    </SettingsCard>
  );
}
