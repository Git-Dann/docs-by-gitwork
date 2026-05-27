"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { ClipboardDocumentIcon, TrashIcon, UserPlusIcon, CheckIcon } from "@heroicons/react/24/outline";

type Invite = {
  id: string;
  token: string;
  label: string | null;
  status: string;
  createdAt: string;
  invitedBy: { name: string | null; email: string };
  acceptedBy: { name: string | null; email: string } | null;
};

type Member = {
  id: string;
  role: string;
  createdAt: string;
  user: { id: string; name: string | null; email: string };
};

const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

export default function TeamPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [membersRes, invitesRes] = await Promise.all([
      fetch("/api/team/members"),
      fetch("/api/team/invites"),
    ]);
    if (membersRes.ok) setMembers(await membersRes.json().then((r) => r.data ?? r));
    if (invitesRes.ok) setInvites(await invitesRes.json().then((r) => r.data ?? r));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createInvite() {
    setCreating(true);
    const res = await fetch("/api/team/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: label.trim() || undefined }),
    });
    if (res.ok) { setLabel(""); await load(); }
    setCreating(false);
  }

  async function revokeInvite(id: string) {
    await fetch(`/api/team/invites/${id}`, { method: "DELETE" });
    await load();
  }

  async function removeMember(id: string) {
    if (!confirm("Remove this member from the workspace?")) return;
    await fetch(`/api/team/members/${id}`, { method: "DELETE" });
    await load();
  }

  function copyLink(token: string, id: string) {
    navigator.clipboard.writeText(`${baseUrl}/invite/${token}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  const pendingInvites = invites.filter((i) => i.status === "PENDING");
  const pastInvites = invites.filter((i) => i.status !== "PENDING");

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 space-y-10">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--text-1)]">Team</h1>
        <p className="mt-1 text-sm text-[var(--text-3)]">Manage workspace members and invite links.</p>
      </div>

      {/* Create invite */}
      {isAdmin && (
        <div className="rounded-[12px] border border-[var(--border-2)] bg-white p-6">
          <div className="flex items-center gap-2 mb-4">
            <UserPlusIcon className="h-5 w-5 text-[var(--text-3)]" />
            <h2 className="text-sm font-semibold text-[var(--text-1)]">Create invite link</h2>
          </div>
          <div className="flex gap-3">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label (e.g. "For Sarah") — optional"
              className="app-input flex-1"
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
        </div>
      )}

      {/* Pending invites */}
      {pendingInvites.length > 0 && (
        <section>
          <h2 className="app-eyebrow mb-3">Pending invite links</h2>
          <div className="divide-y divide-[var(--border-2)] rounded-[12px] border border-[var(--border-2)] bg-white overflow-hidden">
            {pendingInvites.map((inv) => (
              <div key={inv.id} className="flex items-center gap-4 px-5 py-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text-1)] truncate">
                    {inv.label ?? "Invite link"}
                  </p>
                  <p className="text-xs text-[var(--text-4)] mt-0.5 truncate">
                    {`${baseUrl}/invite/${inv.token}`}
                  </p>
                  <p className="text-xs text-[var(--text-4)] mt-0.5">
                    Created by {inv.invitedBy.name ?? inv.invitedBy.email} · {new Date(inv.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => copyLink(inv.token, inv.id)}
                  className="flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
                >
                  {copiedId === inv.id ? (
                    <><CheckIcon className="h-3.5 w-3.5 text-green-500" /> Copied</>
                  ) : (
                    <><ClipboardDocumentIcon className="h-3.5 w-3.5" /> Copy link</>
                  )}
                </button>
                {isAdmin && (
                  <button
                    onClick={() => revokeInvite(inv.id)}
                    className="rounded-[6px] p-1.5 text-[var(--text-4)] transition hover:bg-[var(--danger-50)] hover:text-[var(--danger-500)]"
                    title="Revoke invite"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Members */}
      <section>
        <h2 className="app-eyebrow mb-3">Members</h2>
        {loading ? (
          <p className="text-sm text-[var(--text-3)]">Loading…</p>
        ) : (
          <div className="divide-y divide-[var(--border-2)] rounded-[12px] border border-[var(--border-2)] bg-white overflow-hidden">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-4 px-5 py-4">
                <div className="h-8 w-8 shrink-0 rounded-full bg-[var(--brand-100)] flex items-center justify-center text-xs font-semibold text-[var(--brand-700)]">
                  {(m.user.name ?? m.user.email)[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text-1)] truncate">{m.user.name ?? m.user.email}</p>
                  <p className="text-xs text-[var(--text-4)] truncate">{m.user.email}</p>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  m.role === "ADMIN"
                    ? "bg-[var(--brand-50)] text-[var(--brand-700)]"
                    : "bg-[var(--surface-2)] text-[var(--text-3)]"
                }`}>
                  {m.role.charAt(0) + m.role.slice(1).toLowerCase()}
                </span>
                {isAdmin && m.user.email !== session?.user?.email && (
                  <button
                    onClick={() => removeMember(m.id)}
                    className="rounded-[6px] p-1.5 text-[var(--text-4)] transition hover:bg-[var(--danger-50)] hover:text-[var(--danger-500)]"
                    title="Remove member"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Past invites */}
      {pastInvites.length > 0 && (
        <section>
          <h2 className="app-eyebrow mb-3">Past invites</h2>
          <div className="divide-y divide-[var(--border-2)] rounded-[12px] border border-[var(--border-2)] bg-white overflow-hidden">
            {pastInvites.map((inv) => (
              <div key={inv.id} className="flex items-center gap-4 px-5 py-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text-1)] truncate">{inv.label ?? "Invite link"}</p>
                  {inv.acceptedBy && (
                    <p className="text-xs text-[var(--text-4)] mt-0.5">
                      Accepted by {inv.acceptedBy.name ?? inv.acceptedBy.email}
                    </p>
                  )}
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  inv.status === "ACCEPTED"
                    ? "bg-green-50 text-green-700"
                    : "bg-[var(--surface-2)] text-[var(--text-4)]"
                }`}>
                  {inv.status.charAt(0) + inv.status.slice(1).toLowerCase()}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

    </div>
  );
}
