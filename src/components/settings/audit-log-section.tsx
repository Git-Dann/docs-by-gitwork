"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { cn, formatDate } from "@/lib/format";

interface AuditLogEntry {
  id: string;
  action: string;
  target: string | null;
  before: unknown;
  after: unknown;
  metadata: unknown;
  createdAt: string;
  actor: { id: string; name: string | null; email: string } | null;
}

interface AuditLogResponse {
  entries: AuditLogEntry[];
  nextCursor: string | null;
}

const ACTION_FILTERS: { id: string; label: string }[] = [
  { id: "", label: "All actions" },
  { id: "settings.ai_provider.changed", label: "AI provider changed" },
  { id: "settings.ai_key.rotated", label: "AI key rotated" },
  { id: "settings.external_key.rotated", label: "External key rotated" },
  { id: "team.member.invited", label: "Member invited" },
  { id: "team.member.role_changed", label: "Member role changed" },
  { id: "team.member.removed", label: "Member removed" },
  { id: "integration.google.connected", label: "Google connected" },
  { id: "integration.slack.connected", label: "Slack connected" },
];

function actionLabel(action: string): string {
  const found = ACTION_FILTERS.find((f) => f.id === action);
  return found?.label ?? action;
}

function actionColor(action: string): string {
  if (action.startsWith("team.")) return "bg-[var(--info-100)] text-[var(--info-700)]";
  if (action.startsWith("integration.")) return "bg-[var(--brand-200)] text-[var(--brand-700)]";
  if (action.startsWith("settings.")) return "bg-[var(--warn-100)] text-[var(--warn-700)]";
  if (action.startsWith("workspace.")) return "bg-[var(--danger-100)] text-[var(--danger-700)]";
  if (action.startsWith("template.")) return "bg-[var(--success-100)] text-[var(--success-700)]";
  return "bg-[var(--surface-2)] text-[var(--text-2)]";
}

export function AuditLogSection() {
  const [filter, setFilter] = useState("");

  const query = useQuery({
    queryKey: ["audit-log", filter],
    queryFn: async (): Promise<AuditLogResponse> => {
      const url = filter
        ? `/api/audit-log?action=${encodeURIComponent(filter)}`
        : "/api/audit-log";
      return apiFetch<AuditLogResponse>(url);
    },
  });

  const entries = query.data?.entries ?? [];

  return (
    <div className="proposal-form-theme space-y-4">
      <section className="app-card overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-2)] p-6">
          <div>
            <p className="app-eyebrow">Audit log</p>
            <h2 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">
              Workspace activity
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">
              Settings changes, key rotations, team updates, and integration events. Read-only.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="app-select"
            >
              {ACTION_FILTERS.map((f) => (
                <option key={f.id || "all"} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => query.refetch()}
              loading={query.isFetching}
              leadingIcon={<ArrowPathIcon className="h-4 w-4" />}
            >
              Refresh
            </Button>
          </div>
        </div>

        {query.isLoading ? (
          <div className="p-6 text-sm text-[var(--text-3)]">Loading the audit log…</div>
        ) : entries.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm text-[var(--text-2)]">No audit entries yet.</p>
            <p className="mt-1 text-xs text-[var(--text-4)]">
              Entries appear here when sensitive settings change. Try rotating an API key or
              inviting a member to see it in action.
            </p>
          </div>
        ) : (
          <ol className="divide-y divide-[var(--border-3)]">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="grid gap-3 px-6 py-4 sm:grid-cols-[180px_minmax(0,1fr)_180px]"
              >
                <span
                  className={cn(
                    "inline-flex h-fit items-center rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.06em]",
                    actionColor(entry.action),
                  )}
                >
                  {actionLabel(entry.action)}
                </span>

                <div className="min-w-0">
                  {entry.target ? (
                    <p className="truncate font-mono text-xs text-[var(--text-3)]">
                      {entry.target}
                    </p>
                  ) : null}
                  {entry.before !== null && entry.before !== undefined ? (
                    <p className="mt-1 text-xs text-[var(--text-4)]">
                      <span className="font-mono">before:</span>{" "}
                      <code className="text-[var(--text-3)]">
                        {JSON.stringify(entry.before)}
                      </code>
                    </p>
                  ) : null}
                  {entry.after !== null && entry.after !== undefined ? (
                    <p className="mt-1 text-xs text-[var(--text-4)]">
                      <span className="font-mono">after:</span>{" "}
                      <code className="text-[var(--text-3)]">
                        {JSON.stringify(entry.after)}
                      </code>
                    </p>
                  ) : null}
                </div>

                <div className="text-right text-xs text-[var(--text-4)]">
                  <p className="font-medium text-[var(--text-2)]">
                    {entry.actor?.name ?? entry.actor?.email ?? "System"}
                  </p>
                  <p className="mt-0.5">{formatDate(entry.createdAt)}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
