/**
 * Settings → Team → Members: everyone in the workspace in one table, with the role
 * as an inline dropdown and archive / restore in the last column.
 *
 * Archive is the ONLY way to take someone out. It replaced a Remove that deleted
 * the membership, which turned out to be the unsafe operation — see
 * `RevokedAccessError` in src/server/auth/effective-user.ts. Nothing here deletes.
 */

"use client";

import { useMemo, useState } from "react";
import { ArchiveBoxIcon, ArrowUturnLeftIcon, PencilIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/format";
import {
  ROLES,
  canManageRole,
  isAtLeast,
  normalizeOverrides,
  roleLabel,
  type RoleId, DEFAULT_PROVISIONED_ROLE } from "@/types/auth";

export type MemberStatusValue = "active" | "archived" | "expired";

export interface ManagedMember {
  id: string;
  role: string;
  permissions: string[];
  permissionOverrides?: unknown;
  createdAt: string;
  hasSignedIn: boolean;
  status: MemberStatusValue;
  archivedAt: string | null;
  archivedByName: string | null;
  daysUntilPurge: number | null;
  openTaskCount: number;
  user: { id: string; name: string | null; email: string; avatarUrl?: string | null };
}

const RETENTION_DAYS = 30;

function displayName(m: ManagedMember) {
  return m.user.name ?? m.user.email;
}

function overrideCount(m: ManagedMember): number {
  const o = normalizeOverrides(m.permissionOverrides);
  return o.grant.length + o.revoke.length;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

async function call(url: string, init: RequestInit): Promise<string | null> {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
  if (res.ok) return null;
  const body = await res.json().catch(() => null);
  return body?.error ?? `Request failed (${res.status})`;
}

export function UserManagementTable({
  members,
  actorRole,
  actorUserId,
  avatar,
  accessSummary,
  onEditAccess,
  onChanged,
}: {
  members: ManagedMember[];
  actorRole: string;
  actorUserId: string | null;
  avatar: (m: ManagedMember) => React.ReactNode;
  accessSummary: (m: ManagedMember) => string;
  onEditAccess: (m: ManagedMember) => void;
  onChanged: () => Promise<void> | void;
}) {
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [archiving, setArchiving] = useState<ManagedMember | null>(null);
  const [roleChange, setRoleChange] = useState<{ member: ManagedMember; role: RoleId } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active = useMemo(() => members.filter((m) => m.status === "active"), [members]);
  const archived = useMemo(
    () =>
      members
        .filter((m) => m.status !== "active")
        // Soonest-to-be-removed first: those are the decisions that are running out.
        .sort((a, b) => (a.daysUntilPurge ?? 0) - (b.daysUntilPurge ?? 0)),
    [members],
  );
  const rows = tab === "active" ? active : archived;

  // Only the roles this person is allowed to hand out. An Admin cannot make anyone
  // an Admin; nobody can assign a role above their own.
  const assignable = ROLES.filter((r) => canManageRole(actorRole, r.id));

  async function applyRole(member: ManagedMember, role: RoleId) {
    setBusyId(member.id);
    setError(null);
    const failure = await call(`/api/team/members/${member.id}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
    setBusyId(null);
    if (failure) setError(`${displayName(member)}: ${failure}`);
    else await onChanged();
  }

  function onRoleSelected(member: ManagedMember, role: RoleId) {
    if (role === member.role) return;
    // ⚠️ A role change resets the member's per-person overrides (updateMember in
    // src/server/team.ts). From a dropdown that would be a silent loss of whatever
    // custom access someone was given, so it is confirmed first when there is any.
    if (overrideCount(member) > 0) {
      setRoleChange({ member, role });
      return;
    }
    void applyRole(member, role);
  }

  async function restore(member: ManagedMember) {
    setBusyId(member.id);
    setError(null);
    const failure = await call(`/api/team/members/${member.id}/restore`, { method: "POST" });
    setBusyId(null);
    if (failure) setError(`${displayName(member)}: ${failure}`);
    else await onChanged();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-2)] px-6 py-3">
        {/* Segmented control — the platform's pick-one control (DESIGN.md). */}
        <div className="inline-flex rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] p-0.5">
          {(
            [
              ["active", `Active`, active.length],
              ["archived", `Archived`, archived.length],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.08em] transition",
                tab === key
                  ? "bg-[var(--surface-0)] text-[var(--brand-700)] shadow-[var(--shadow-sm)]"
                  : "text-[var(--text-3)] hover:text-[var(--text-1)]",
              )}
            >
              {label}
              <span className="rounded-[4px] bg-[var(--surface-2)] px-1.5 text-[10px] text-[var(--text-3)]">
                {count}
              </span>
            </button>
          ))}
        </div>
        <p className="text-xs text-[var(--text-4)]">
          {tab === "active"
            ? "Archiving removes access immediately. You can restore anyone for 30 days."
            : `Restore brings back their role and access exactly as they were. After ${RETENTION_DAYS} days they're removed from the workspace.`}
        </p>
      </div>

      {error ? (
        <p className="mx-6 mt-3 rounded-[8px] border border-[var(--danger-500)] bg-[var(--danger-50)] px-3 py-2 text-[13px] text-[var(--danger-500)]">
          {error}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="px-6 py-8 text-center text-sm text-[var(--text-4)]">
          {tab === "active" ? "No active members." : "Nobody is archived."}
        </p>
      ) : (
        // ⚠️ The card is `overflow: hidden`, so a table wider than a phone would be
        // CLIPPED, not scrolled (CLAUDE.md §45.2). It gets its own scroller.
        <div className="overflow-x-auto">
          <table className="app-table app-table--dense w-full min-w-[760px]">
            <thead>
              <tr>
                <th className="pl-6 text-left">Member</th>
                <th className="w-[170px] text-left">Role</th>
                <th className="text-left">{tab === "active" ? "Access" : "Archived"}</th>
                <th className="w-[130px] text-left">{tab === "active" ? "Open work" : "Restore by"}</th>
                <th className="w-[190px] pr-6 text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const self = actorUserId != null && m.user.id === actorUserId;
                const manageable = canManageRole(actorRole, m.role) && !self;
                const busy = busyId === m.id;
                return (
                  <tr key={m.id} className={cn(m.status !== "active" && "opacity-75")}>
                    <td className="pl-6">
                      <div className="flex min-w-0 items-center gap-3">
                        {avatar(m)}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-[var(--text-1)]" title={displayName(m)}>
                            {displayName(m)}
                            {self ? <span className="ml-1.5 text-xs font-normal text-[var(--text-4)]">(you)</span> : null}
                            {/* Only the exception is labelled. Signed-in is the normal case,
                                and "Active" is reserved for the active/archived status — the
                                old marker used the same word for "has signed in". */}
                            {!m.hasSignedIn ? (
                              <span
                                className="ml-2 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-4)]"
                                title="Provisioned or invited, but hasn't signed in yet"
                              >
                                Invited
                              </span>
                            ) : null}
                          </p>
                          <p className="truncate text-xs text-[var(--text-4)]" title={m.user.email}>
                            {m.user.email}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td>
                      {m.status === "active" && manageable ? (
                        <select
                          aria-label={`Role for ${displayName(m)}`}
                          className="app-select-compact app-select-chevron w-full pr-7"
                          value={m.role}
                          disabled={busy}
                          onChange={(e) => onRoleSelected(m, e.target.value as RoleId)}
                        >
                          {/* The current role is always listed, even when it is one
                              the actor could not assign, so the control never shows
                              a value it does not contain. */}
                          {!assignable.some((r) => r.id === m.role) ? (
                            <option value={m.role} disabled>
                              {roleLabel(m.role)}
                            </option>
                          ) : null}
                          {assignable.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span
                          className={cn(
                            "inline-block rounded-[4px] px-2 py-0.5 text-xs font-medium",
                            isAtLeast(m.role, "ADMIN")
                              ? "bg-[var(--brand-50)] text-[var(--brand-700)]"
                              : "bg-[var(--surface-2)] text-[var(--text-3)]",
                          )}
                          title={self ? "You can't change your own role." : undefined}
                        >
                          {roleLabel(m.role)}
                        </span>
                      )}
                    </td>

                    <td className="text-xs text-[var(--text-3)]">
                      {m.status === "active" ? (
                        <span className="block truncate" title={accessSummary(m)}>
                          {accessSummary(m)}
                        </span>
                      ) : (
                        <span>
                          {formatDate(m.archivedAt)}
                          {m.archivedByName ? <span className="text-[var(--text-4)]"> · by {m.archivedByName}</span> : null}
                        </span>
                      )}
                    </td>

                    <td className="text-xs">
                      {m.status === "active" ? (
                        m.openTaskCount > 0 ? (
                          <span className="font-mono text-[var(--text-2)]">{m.openTaskCount} open</span>
                        ) : (
                          <span className="text-[var(--text-4)]">—</span>
                        )
                      ) : m.status === "expired" ? (
                        <span className="font-mono text-[var(--text-4)]">Window passed</span>
                      ) : (
                        <span
                          className={cn(
                            "font-mono",
                            (m.daysUntilPurge ?? 0) <= 7 ? "text-[var(--warning-500)]" : "text-[var(--text-2)]",
                          )}
                        >
                          {m.daysUntilPurge} day{m.daysUntilPurge === 1 ? "" : "s"} left
                        </span>
                      )}
                    </td>

                    <td className="pr-6">
                      <div className="flex items-center justify-end gap-1.5">
                        {m.status === "active" ? (
                          <>
                            {canManageRole(actorRole, m.role) ? (
                              <Button
                                type="button"
                                variant="secondary"
                                size="xs"
                                onClick={() => onEditAccess(m)}
                                title="Edit individual permissions"
                              >
                                <PencilIcon className="h-3.5 w-3.5" />
                                Access
                              </Button>
                            ) : null}
                            {manageable ? (
                              <Button
                                type="button"
                                variant="secondary"
                                size="xs"
                                onClick={() => setArchiving(m)}
                                disabled={busy}
                                title={`Archive ${displayName(m)}`}
                              >
                                <ArchiveBoxIcon className="h-3.5 w-3.5" />
                                Archive
                              </Button>
                            ) : null}
                          </>
                        ) : m.status === "archived" && canManageRole(actorRole, m.role) ? (
                          <Button
                            type="button"
                            variant="primary"
                            size="xs"
                            onClick={() => restore(m)}
                            loading={busy}
                          >
                            <ArrowUturnLeftIcon className="h-3.5 w-3.5" />
                            Restore
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === "archived" ? <ReinstatePanel actorRole={actorRole} onDone={onChanged} /> : null}

      <ArchiveDialog
        member={archiving}
        onClose={() => setArchiving(null)}
        onArchived={async () => {
          setArchiving(null);
          await onChanged();
        }}
      />

      <Modal
        open={roleChange != null}
        onClose={() => setRoleChange(null)}
        title="01 // CHANGE ROLE"
        panelClassName="w-full max-w-md"
      >
        {roleChange ? (
          <>
            <div className="space-y-2 px-5 py-4 text-sm text-[var(--text-2)]">
              <p>
                Make <strong>{displayName(roleChange.member)}</strong> a{" "}
                <strong>{roleLabel(roleChange.role)}</strong>?
              </p>
              <p className="text-[var(--text-3)]">
                They have {overrideCount(roleChange.member)} custom permission
                {overrideCount(roleChange.member) === 1 ? "" : "s"} set on top of their role.
                Changing role resets those to the new role&rsquo;s defaults.
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--border-2)] px-5 py-3">
              <Button type="button" variant="secondary" size="sm" onClick={() => setRoleChange(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => {
                  const next = roleChange;
                  setRoleChange(null);
                  void applyRole(next.member, next.role);
                }}
              >
                Change role
              </Button>
            </div>
          </>
        ) : null}
      </Modal>
    </div>
  );
}

function ArchiveDialog({
  member,
  onClose,
  onArchived,
}: {
  member: ManagedMember | null;
  onClose: () => void;
  onArchived: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!member) return;
    setBusy(true);
    setError(null);
    const failure = await call(`/api/team/members/${member.id}/archive`, { method: "POST" });
    setBusy(false);
    if (failure) setError(failure);
    else await onArchived();
  }

  return (
    <Modal open={member != null} onClose={onClose} title="01 // ARCHIVE MEMBER" panelClassName="w-full max-w-lg">
      {member ? (
        <>
          <div className="space-y-3 px-5 py-4 text-sm text-[var(--text-2)]">
            <p>
              Archive <strong>{displayName(member)}</strong>?
            </p>
            <ul className="space-y-2 text-[13px] leading-5 text-[var(--text-3)]">
              <li>
                They lose access to Foundry straight away — on the web, iOS and desktop — and stop
                appearing anywhere in Foundry, including notifications.
              </li>
              {member.openTaskCount > 0 ? (
                <li className="text-[var(--text-1)]">
                  <strong>
                    {member.openTaskCount} open task{member.openTaskCount === 1 ? " is" : "s are"} still
                    assigned to them.
                  </strong>{" "}
                  Reassign {member.openTaskCount === 1 ? "it" : "them"} first, or{" "}
                  {member.openTaskCount === 1 ? "it'll" : "they'll"} be left without an owner.
                </li>
              ) : null}
              <li>
                You can restore them for {RETENTION_DAYS} days with their role and access exactly as now.
                After that they&rsquo;re removed from the workspace; work they did stays attributed to them.
              </li>
              <li>
                This doesn&rsquo;t touch their Google account. Suspend it in Google Admin as well, or they
                keep Gmail and any shared Drive folders.
              </li>
            </ul>
            {error ? <p className="text-[13px] text-[var(--danger-500)]">{error}</p> : null}
          </div>
          <div className="flex justify-end gap-2 border-t border-[var(--border-2)] px-5 py-3">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" variant="danger" size="sm" onClick={confirm} loading={busy}>
              Archive
            </Button>
          </div>
        </>
      ) : null}
    </Modal>
  );
}

/**
 * For someone past the restore window (or removed before archiving existed). Sign-in
 * refuses a person with a User row and no membership — it no longer re-provisions
 * them — so this is the only way they can get back in under their own email.
 */
function ReinstatePanel({ actorRole, onDone }: { actorRole: string; onDone: () => Promise<void> | void }) {
  const [email, setEmail] = useState("");
  const assignable = ROLES.filter((r) => canManageRole(actorRole, r.id));
  const [role, setRole] = useState<RoleId>(
    (assignable.find((r) => r.id === DEFAULT_PROVISIONED_ROLE)?.id ?? assignable[assignable.length - 1]?.id ?? "STAFF") as RoleId,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit() {
    setBusy(true);
    setMessage(null);
    const failure = await call("/api/team/members/reinstate", {
      method: "POST",
      body: JSON.stringify({ email: email.trim().toLowerCase(), role }),
    });
    setBusy(false);
    if (failure) setMessage({ ok: false, text: failure });
    else {
      setMessage({ ok: true, text: `${email.trim()} can sign in again.` });
      setEmail("");
      await onDone();
    }
  }

  return (
    <div className="border-t border-[var(--border-2)] px-6 py-4">
      <p className="widget-data-label">Bring someone back after {RETENTION_DAYS} days</p>
      <p className="mt-1 text-xs text-[var(--text-4)]">
        Once the restore window has passed they&rsquo;re no longer listed. Add them back by email.
      </p>
      {/* A grid, not a flex row: `app-input` is `width: 100%`, which wins a flex row
          and stacked the email, role and button into three full-width lines. */}
      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px_auto] sm:items-center">
        <input
          className="app-input"
          type="email"
          placeholder="name@gitwork.co.uk"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label="Email to reinstate"
        />
        <select
          className="app-select-compact app-select-chevron pr-7"
          value={role}
          onChange={(e) => setRole(e.target.value as RoleId)}
          aria-label="Role to reinstate as"
        >
          {assignable.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
        <Button type="button" variant="secondary" size="sm" onClick={submit} loading={busy} disabled={!email.trim()}>
          Reinstate
        </Button>
      </div>
      {message ? (
        <p className={cn("mt-2 text-[13px]", message.ok ? "text-[var(--success-500)]" : "text-[var(--danger-500)]")}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
