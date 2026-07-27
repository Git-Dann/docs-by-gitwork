"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { SettingsCard } from "@/components/settings/settings-card";
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
  /** Distinct actions present in the log (first page only). */
  actions?: Array<{ action: string; count: number }>;
}

/** Nicer wording for the few ids that don't read well when humanised. */
const ACTION_LABEL_OVERRIDES: Record<string, string> = {
  "settings.ai_provider.changed": "AI provider changed",
  "settings.ai_key.rotated": "AI key rotated",
  "settings.external_key.rotated": "External key rotated",
  "integration.mcp.connected": "MCP connected",
  "integration.mcp.revoked": "MCP revoked",
  "integration.mcp.enabled": "MCP enabled",
  "integration.mcp.disabled": "MCP disabled",
};

/**
 * Turn any action id into readable text — "foreman.run.completed" →
 * "Foreman run completed". Previously unknown ids fell through as the raw id,
 * which is why the feed was full of shouting FOREMAN.RUN.COMPLETED chips.
 */
function actionLabel(action: string): string {
  const override = ACTION_LABEL_OVERRIDES[action];
  if (override) return override;
  const words = action.replace(/[._]/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * A run of consecutive identical events, shown as one row.
 *
 * DISPLAY ONLY — the underlying rows are untouched. This is an append-only
 * audit log, so nothing is merged or dropped at the source; a repeated event
 * (e.g. the Claude connector re-authorising 15×) is just presented once with a
 * count and a time span so it can't bury everything else in the feed.
 */
interface EntryGroup {
  key: string;
  entries: AuditLogEntry[];
  /** Most recent entry — the one whose detail we render. */
  latest: AuditLogEntry;
}

/** Group runs of consecutive entries sharing action + target + actor. */
function collapseEntries(entries: AuditLogEntry[]): EntryGroup[] {
  const groups: EntryGroup[] = [];
  for (const entry of entries) {
    const signature = `${entry.action}|${entry.target ?? ""}|${entry.actor?.id ?? "system"}`;
    const previous = groups[groups.length - 1];
    // Only collapse an unbroken run, so the feed stays chronologically honest —
    // a different event in between starts a new group.
    if (previous && previous.key === signature) {
      previous.entries.push(entry);
    } else {
      groups.push({ key: signature, entries: [entry], latest: entry });
    }
  }
  return groups;
}

function actionColor(action: string): string {
  if (action.startsWith("team.")) return "bg-[var(--brand-200)] text-[var(--brand-700)]";
  if (action.startsWith("integration.")) return "bg-[var(--brand-200)] text-[var(--brand-700)]";
  if (action.startsWith("settings.")) return "bg-[var(--warning-50)] text-[var(--warning-500)]";
  if (action.startsWith("workspace.")) return "bg-[var(--danger-50)] text-[var(--danger-500)]";
  if (action.startsWith("template.")) return "bg-[var(--success-50)] text-[var(--success-500)]";
  return "bg-[var(--surface-2)] text-[var(--text-2)]";
}

export function AuditLogSection() {
  const [filter, setFilter] = useState("");
  // Pages already loaded via "Load more" — the log was previously capped at the
  // first 50 rows with no way to reach older entries.
  const [extraPages, setExtraPages] = useState<AuditLogEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const query = useQuery({
    queryKey: ["audit-log", filter],
    queryFn: async (): Promise<AuditLogResponse> => {
      const url = filter
        ? `/api/audit-log?action=${encodeURIComponent(filter)}`
        : "/api/audit-log";
      const res = await apiFetch<AuditLogResponse>(url);
      // A fresh first page resets any accumulated pages.
      setExtraPages([]);
      setCursor(res.nextCursor);
      return res;
    },
  });

  const entries = [...(query.data?.entries ?? []), ...extraPages];
  const actionOptions = query.data?.actions ?? [];

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ cursor });
      if (filter) params.set("action", filter);
      const res = await apiFetch<AuditLogResponse>(`/api/audit-log?${params.toString()}`);
      setExtraPages((current) => [...current, ...res.entries]);
      setCursor(res.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="proposal-form-theme space-y-4">
      <SettingsCard
        number="01"
        title="Workspace activity"
        bodyClassName="p-0"
        right={
          <div className="flex items-center gap-2">
            {/* h-7 + min-h-0: the widget header is a fixed 36px box inside a
                card with overflow:hidden, so a default 36px field exactly fills
                it and its 4px focus ring gets clipped at the top. 28px leaves
                room for the ring. font-mono/11px matches the header's grammar
                rather than dropping a 14px sans control into a mono strip. */}
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="app-select-compact h-7 min-h-0 w-auto font-mono text-[11px]"
              aria-label="Filter activity by action"
            >
              <option value="">All actions</option>
              {actionOptions.map((option) => (
                <option key={option.action} value={option.action}>
                  {actionLabel(option.action)} ({option.count})
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
        }
      >
        <p className="border-b border-[var(--border-2)] px-6 py-4 text-sm leading-6 text-[var(--text-3)]">
          Settings changes, key rotations, team updates, and integration events. Read-only.
        </p>

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
            {collapseEntries(entries).map((group) => {
              const entry = group.latest;
              const repeatCount = group.entries.length;
              const oldest = group.entries[repeatCount - 1];
              return (
              <li
                key={entry.id}
                className="grid gap-3 px-6 py-4 sm:grid-cols-[180px_minmax(0,1fr)_180px]"
              >
                <span className="flex h-fit flex-wrap items-center gap-1.5">
                  <span
                    className={cn(
                      "inline-flex h-fit items-center rounded-[4px] px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.06em]",
                      actionColor(entry.action),
                    )}
                  >
                    {actionLabel(entry.action)}
                  </span>
                  {repeatCount > 1 ? (
                    <span
                      title={`${repeatCount} identical events collapsed`}
                      className="inline-flex h-fit items-center rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[var(--text-3)]"
                    >
                      ×{repeatCount}
                    </span>
                  ) : null}
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
                  {repeatCount > 1 ? (
                    <p className="mt-0.5 text-[11px]">
                      {repeatCount} events since {formatDate(oldest.createdAt)}
                    </p>
                  ) : null}
                </div>
              </li>
              );
            })}
          </ol>
        )}

        {entries.length > 0 ? (
          <div className="flex items-center justify-between gap-3 border-t border-[var(--border-3)] px-6 py-3">
            <span className="widget-data-label">
              {entries.length} {entries.length === 1 ? "entry" : "entries"}
            </span>
            {cursor ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={loadMore}
                loading={loadingMore}
              >
                Load more
              </Button>
            ) : (
              <span className="text-xs text-[var(--text-4)]">End of log</span>
            )}
          </div>
        ) : null}
      </SettingsCard>
    </div>
  );
}
