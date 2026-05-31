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
  UserPlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/format";
import {
  FEATURE_PERMISSIONS,
  MODULE_PERMISSIONS,
  PERMISSION_PRESETS,
  type PermissionPresetId,
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
  user: { id: string; name: string | null; email: string };
}

export function TeamSection() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
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

  return (
    <div className="proposal-form-theme space-y-6">
      {/* Create invite */}
      {isAdmin ? (
        <section className="app-card p-6">
          <div className="mb-4 flex items-center gap-2">
            <UserPlusIcon className="h-5 w-5 text-[var(--text-3)]" />
            <h2 className="text-sm font-semibold text-[var(--text-1)]">Create invite link</h2>
          </div>
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
        </section>
      ) : null}

      {/* Pending invites */}
      {pendingInvites.length > 0 ? (
        <section>
          <h2 className="app-eyebrow mb-3">Pending invite links</h2>
          <div className="divide-y divide-[var(--border-2)] overflow-hidden rounded-[12px] border border-[var(--border-2)] bg-white">
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
        </section>
      ) : null}

      {/* Members */}
      <section>
        <h2 className="app-eyebrow mb-3">Members</h2>
        {loading ? (
          <p className="text-sm text-[var(--text-3)]">Loading…</p>
        ) : (
          <div className="divide-y divide-[var(--border-2)] overflow-hidden rounded-[12px] border border-[var(--border-2)] bg-white">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-4 px-5 py-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand-100)] text-xs font-semibold text-[var(--brand-700)]">
                  {(m.user.name ?? m.user.email)[0].toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--text-1)]">
                    {m.user.name ?? m.user.email}
                  </p>
                  <p className="truncate text-xs text-[var(--text-4)]">{m.user.email}</p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    m.role === "ADMIN"
                      ? "bg-[var(--brand-50)] text-[var(--brand-700)]"
                      : "bg-[var(--surface-2)] text-[var(--text-3)]"
                  }`}
                >
                  {m.role.charAt(0) + m.role.slice(1).toLowerCase()}
                </span>
                {isAdmin ? (
                  <button
                    onClick={() => setAccessMember(m)}
                    className="flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] px-2.5 py-1 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
                    title="Edit access"
                  >
                    <PencilIcon className="h-3.5 w-3.5" />
                    Edit
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Past invites */}
      {pastInvites.length > 0 ? (
        <section>
          <h2 className="app-eyebrow mb-3">Past invites</h2>
          <div className="divide-y divide-[var(--border-2)] overflow-hidden rounded-[12px] border border-[var(--border-2)] bg-white">
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
        </section>
      ) : null}

      {accessMember ? (
        <MemberAccessModal
          member={accessMember}
          onClose={() => setAccessMember(null)}
          onSaved={async () => {
            setAccessMember(null);
            await load();
          }}
        />
      ) : null}
    </div>
  );
}

// ── Member edit modal ────────────────────────────────────────────────────────
// Two-column layout. Left: role + modules. Right: features + danger zone (delete).
// Delete is gated behind a confirmation step inside the modal so it can't fire by
// accident. Save call hits PATCH /api/team/members/[id]; delete hits DELETE.
function MemberAccessModal({
  member,
  onClose,
  onSaved,
}: {
  member: Member;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const { data: session } = useSession();
  const isSelf = member.user.email === session?.user?.email;

  const [role, setRole] = useState<"ADMIN" | "STAFF">(
    member.role === "ADMIN" ? "ADMIN" : "STAFF",
  );
  const [perms, setPerms] = useState<Set<string>>(new Set(member.permissions ?? []));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Two-step delete: first click reveals the confirm strip, second click does it.
  // Prevents accidental removal in the middle of editing permissions.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function toggle(id: string) {
    setPerms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function applyPreset(presetId: PermissionPresetId) {
    const preset = PERMISSION_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setRole(preset.role);
    setPerms(new Set(preset.permissions));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/team/members/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, permissions: Array.from(perms) }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `Save failed (${res.status})`);
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

  // ADMIN role bypasses all permission checks server-side. We grey out the module/feature
  // toggles to make that obvious — they have no effect for admins.
  const adminBypass = role === "ADMIN";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-12"
      onClick={onClose}
    >
      <div
        className="proposal-form-theme w-full max-w-4xl rounded-[14px] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border-2)] px-6 py-4">
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

        {/* Presets — full width, sits above the two columns. */}
        <div className="border-b border-[var(--border-2)] px-6 py-4">
          <p className="mb-2 text-xs font-medium text-[var(--text-2)]">Quick presets</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {PERMISSION_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset.id)}
                className="rounded-[8px] border border-[var(--border-2)] px-3 py-2 text-left text-xs transition hover:bg-[var(--surface-1)]"
                title={preset.description}
              >
                <span className="block font-semibold text-[var(--text-1)]">{preset.label}</span>
                <span className="mt-0.5 block text-[11px] leading-tight text-[var(--text-4)]">
                  {preset.description}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Two-column body */}
        <div className="grid gap-0 md:grid-cols-2 md:divide-x md:divide-[var(--border-2)]">
          {/* Left: Role + Modules */}
          <div className="space-y-5 px-6 py-5">
            <div>
              <p className="mb-2 text-xs font-medium text-[var(--text-2)]">Role</p>
              <div className="flex flex-col gap-2">
                {(["ADMIN", "STAFF"] as const).map((r) => (
                  <label
                    key={r}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-[10px] border px-3 py-2.5",
                      role === r
                        ? "border-[var(--brand-600)] bg-[var(--surface-brand)]"
                        : "border-[var(--border-2)] bg-white hover:bg-[var(--surface-1)]",
                    )}
                  >
                    <input
                      type="radio"
                      checked={role === r}
                      onChange={() => setRole(r)}
                      className="mt-0.5"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-[var(--text-1)]">
                        {r === "ADMIN" ? "Admin" : "Staff"}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-tight text-[var(--text-4)]">
                        {r === "ADMIN"
                          ? "Full workspace access including Team, Developer, integrations."
                          : "Module-level access controlled below."}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1 text-xs font-medium text-[var(--text-2)]">Modules</p>
              <p className="mb-2 text-[11px] text-[var(--text-4)]">
                {adminBypass
                  ? "Admins implicitly have every module — toggles are ignored."
                  : "Areas this user can reach inside the app."}
              </p>
              <div className={cn("space-y-1.5", adminBypass && "opacity-50")}>
                {MODULE_PERMISSIONS.map((mod) => (
                  <label
                    key={mod.id}
                    className="flex items-start gap-2 rounded-[8px] border border-[var(--border-3)] bg-white px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={perms.has(mod.id)}
                      onChange={() => toggle(mod.id)}
                      disabled={adminBypass}
                    />
                    <span className="min-w-0">
                      <span className="block font-medium text-[var(--text-1)]">{mod.label}</span>
                      <span className="mt-0.5 block text-[11px] leading-tight text-[var(--text-4)]">
                        {mod.description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Features + Danger zone */}
          <div className="flex flex-col gap-5 px-6 py-5">
            <div>
              <p className="mb-1 text-xs font-medium text-[var(--text-2)]">Feature access</p>
              <p className="mb-2 text-[11px] text-[var(--text-4)]">
                Cross-cutting visibility flags. Enforcement rolls out per-feature.
              </p>
              <div className={cn("space-y-1.5", adminBypass && "opacity-50")}>
                {FEATURE_PERMISSIONS.map((flag) => (
                  <label
                    key={flag.id}
                    className="flex items-start gap-2 rounded-[8px] border border-[var(--border-3)] bg-white px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={perms.has(flag.id)}
                      onChange={() => toggle(flag.id)}
                      disabled={adminBypass}
                    />
                    <span className="min-w-0">
                      <span className="block font-medium text-[var(--text-1)]">{flag.label}</span>
                      <span className="mt-0.5 block text-[11px] leading-tight text-[var(--text-4)]">
                        {flag.description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Danger zone — only shown for non-self rows. Two-click confirmation. */}
            {!isSelf ? (
              <div className="mt-auto rounded-[10px] border border-[var(--danger-200)] bg-[var(--danger-50)] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--danger-700)]">
                  Danger zone
                </p>
                <p className="mt-1 text-[11px] leading-tight text-[var(--text-3)]">
                  Removes the member from this workspace. Their Foundry sign-in stops working
                  on the next request. Reversible only by sending a new invite.
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
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        onClick={confirmDelete}
                        loading={deleting}
                      >
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
                    {deleteError ? (
                      <p className="text-xs text-[var(--danger-500)]">{deleteError}</p>
                    ) : null}
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-auto rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-3 text-[11px] text-[var(--text-4)]">
                You can&apos;t remove your own membership. Another admin needs to do that.
              </p>
            )}
          </div>
        </div>

        {error ? (
          <p className="border-t border-[var(--border-2)] px-6 py-3 text-sm text-[var(--danger-500)]">
            {error}
          </p>
        ) : null}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-[var(--border-2)] px-6 py-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={save} loading={saving}>
            Save changes
          </Button>
        </div>
      </div>
    </div>
  );
}
