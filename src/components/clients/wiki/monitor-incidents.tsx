"use client";

/**
 * Monitor incidents — one per outage (src/lib/monitor-incidents.ts). Three places use this:
 * the client's status board (read-only, public updates only), a client's Monitors manager, and
 * the Gitwork all-clients board, where the team acknowledges and posts updates.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckIcon } from "@heroicons/react/24/outline";
import { apiFetch } from "@/lib/api";
import {
  INCIDENT_STATUSES,
  INCIDENT_STATUS_LABEL,
  MAX_UPDATE_LENGTH,
  incidentLength,
  type IncidentDTO,
  type IncidentStatus,
} from "@/lib/monitor-incidents";

const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function useIncidentAction(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; body: Record<string, unknown> }) =>
      apiFetch<IncidentDTO>(`/api/clients/${slug}/wiki/monitors/incidents/${input.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input.body),
      }),
    // Prefix match: refreshes this wiki, and the all-clients board on the Gitwork wiki.
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client-wiki"] }),
  });
}

function StatusChip({ incident }: { incident: IncidentDTO }) {
  const open = !incident.resolvedAt;
  const color = open ? (incident.kind === "down" ? "var(--danger-500)" : "var(--warning-500)") : "var(--success-500)";
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-[6px] border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]"
      style={{ fontFamily: MONO, color, borderColor: color }}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} aria-hidden />
      {INCIDENT_STATUS_LABEL[incident.status]}
    </span>
  );
}

function UpdateForm({ incident, slug, onDone }: { incident: IncidentDTO; slug: string; onDone: () => void }) {
  const action = useIncidentAction(slug);
  const [status, setStatus] = useState<IncidentStatus>(incident.status === "resolved" ? "monitoring" : incident.status);
  const [message, setMessage] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!message.trim()) {
      setError("Write what's happening.");
      return;
    }
    setError(null);
    try {
      await action.mutateAsync({ id: incident.id, body: { action: "update", status, message: message.trim(), isPublic } });
      setMessage("");
      onDone();
    } catch {
      setError("Couldn't post the update. Try again.");
    }
  }

  return (
    <div className="mt-3 space-y-2 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="app-select-compact"
          value={status}
          onChange={(e) => setStatus(e.target.value as IncidentStatus)}
          aria-label="Status"
        >
          {INCIDENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {INCIDENT_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <label className="inline-flex items-center gap-1.5 text-[12px] text-[var(--text-2)]">
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
          Show to the client
        </label>
      </div>
      <textarea
        className="app-input min-h-[72px] w-full px-3 py-2 text-[14px]"
        value={message}
        maxLength={MAX_UPDATE_LENGTH}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={isPublic ? "What the client should know, in plain words" : "A note for the team only"}
      />
      {error ? <p className="text-[12px] text-[var(--danger-500)]">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={action.isPending}
          onClick={submit}
          className="rounded-[7px] bg-[var(--brand-600)] px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-[var(--brand-700)] disabled:opacity-50"
        >
          {action.isPending ? "Posting…" : "Post update"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-[7px] border border-[var(--border-2)] px-3 py-1.5 text-[13px] text-[var(--text-2)] hover:bg-[var(--surface-1)]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function IncidentCard({
  incident,
  slug,
  audience,
  clientName,
}: {
  incident: IncidentDTO;
  /** The incident's own client — where acknowledge and updates go. */
  slug: string;
  audience: "team" | "client";
  /** Shown on the all-clients board, where incidents from many clients sit together. */
  clientName?: string;
}) {
  const action = useIncidentAction(slug);
  const [composing, setComposing] = useState(false);
  const open = !incident.resolvedAt;
  const team = audience === "team";

  return (
    <li className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {clientName ? (
            <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
              {clientName}
            </p>
          ) : null}
          <p className="text-[15px] font-medium text-[var(--text-1)]">{incident.title}</p>
          <p className="mt-0.5 text-[12px] text-[var(--text-4)]">
            {when(incident.startedAt)} ·{" "}
            {open ? `ongoing for ${incidentLength(incident, new Date())}` : `lasted ${incidentLength(incident, new Date())}`}
          </p>
        </div>
        <StatusChip incident={incident} />
      </div>

      {/* Acknowledged: names the person for the team; tells the client someone is on it. */}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
        {incident.acknowledgedAt ? (
          <span className="inline-flex items-center gap-1 text-[var(--text-3)]">
            <CheckIcon className="h-3.5 w-3.5" aria-hidden />
            {team
              ? `Acknowledged by ${incident.acknowledgedByName ?? "the team"} · ${when(incident.acknowledgedAt)}`
              : open
                ? "Gitwork is on it"
                : "Handled by Gitwork"}
          </span>
        ) : team && open ? (
          <button
            type="button"
            disabled={action.isPending}
            onClick={() => action.mutate({ id: incident.id, body: { action: "acknowledge" } })}
            className="rounded-[6px] bg-[var(--danger-500)] px-2.5 py-1 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {action.isPending ? "Acknowledging…" : "Acknowledge"}
          </button>
        ) : team ? (
          <span className="text-[var(--text-4)]">Not acknowledged</span>
        ) : null}
        {team && !composing ? (
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="rounded-[6px] border border-[var(--border-2)] px-2.5 py-1 text-[12px] font-medium text-[var(--text-2)] hover:bg-[var(--surface-1)]"
          >
            Post update
          </button>
        ) : null}
      </div>

      {composing ? <UpdateForm incident={incident} slug={slug} onDone={() => setComposing(false)} /> : null}

      {incident.updates.length > 0 ? (
        <ol className="mt-3 space-y-2 border-l-2 border-[var(--border-2)] pl-3">
          {[...incident.updates].reverse().map((u) => (
            <li key={u.id}>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
                {INCIDENT_STATUS_LABEL[u.status]} · {when(u.createdAt)}
                {u.automatic ? " · automatic" : u.authorName ? ` · ${u.authorName}` : ""}
                {team && !u.isPublic ? " · team only" : ""}
              </p>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] text-[var(--text-2)]">{u.message}</p>
            </li>
          ))}
        </ol>
      ) : null}
    </li>
  );
}

/** A list of incidents with a heading; renders nothing when there are none. */
export function IncidentList({
  incidents,
  slug,
  audience,
  title = "Incidents",
}: {
  incidents: IncidentDTO[];
  slug: string;
  audience: "team" | "client";
  title?: string;
}) {
  if (incidents.length === 0) return null;
  return (
    <div>
      <p className="mb-2 text-[11px] uppercase tracking-[0.1em] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
        {title}
      </p>
      <ul className="space-y-2">
        {incidents.map((i) => (
          <IncidentCard key={i.id} incident={i} slug={slug} audience={audience} />
        ))}
      </ul>
    </div>
  );
}
