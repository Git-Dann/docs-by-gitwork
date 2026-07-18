"use client";

import { useState } from "react";
import { ArrowPathIcon, PlayIcon, BeakerIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { SettingsCard } from "@/components/settings/settings-card";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/format";
import {
  useForemanStatus,
  useForemanRuns,
  useRunForeman,
  useUpdateForemanConfig,
  type ForemanConfig,
  type ForemanFinding,
  type ForemanRunSummary,
  type Severity,
} from "@/hooks/use-foreman";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2">
      <div className="widget-data-label text-[var(--text-3)]">{label}</div>
      <div className="mt-0.5 text-lg font-semibold text-[var(--text-1)]">{value}</div>
    </div>
  );
}

function sevClass(s: Severity): string {
  return s === "critical"
    ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"
    : s === "warn"
      ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
      : "bg-[var(--surface-2)] text-[var(--text-3)]";
}

export function ForemanPanel() {
  const { data: status, isLoading } = useForemanStatus();
  const { data: runs = [] } = useForemanRuns();
  const runForeman = useRunForeman();
  const updateConfig = useUpdateForemanConfig();
  const { success, error } = useToast();

  if (isLoading || !status) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-[var(--text-3)]">
        <ArrowPathIcon className="size-4 animate-spin" />
        Loading Foreman…
      </div>
    );
  }

  const latest = status.latestRun;
  const findings = latest?.findings ?? [];
  const risks = findings.filter((f) => f.category !== "blindspot");

  async function run(consolidate?: boolean, dryRun?: boolean) {
    try {
      await runForeman.mutateAsync({ consolidate, dryRun });
      success(dryRun ? "Dry run complete" : "Foreman run complete");
    } catch (e) {
      error("Foreman run failed", e instanceof Error ? e.message : undefined);
    }
  }

  const busy = runForeman.isPending;

  return (
    <div className="space-y-5">
      {/* 01 — STATUS */}
      <SettingsCard
        number="01"
        title="Status"
        right={
          <span className="widget-data-label text-[var(--text-3)]">
            {status.config.enabled ? `Daily 09:00 · next ${fmtDate(status.nextDueAt)}` : "Disabled"}
          </span>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-3)]">
            Foreman audits every active project and developer each morning and pushes overdue / at-risk items to
            admins&apos; Desk. It never flags what it can&apos;t see — missing dates and timelines are reported as
            blind spots instead.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => run(undefined, false)}
              className="flex items-center gap-1.5 rounded-xl bg-[var(--brand-600)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-700)] disabled:opacity-50"
            >
              <PlayIcon className="size-4" /> Run now
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(undefined, true)}
              className="flex items-center gap-1.5 rounded-xl border border-[var(--border-2)] px-4 py-2 text-sm font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)] disabled:opacity-50"
            >
              <BeakerIcon className="size-4" /> Dry run
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(true, false)}
              className="flex items-center gap-1.5 rounded-xl border border-[var(--border-2)] px-4 py-2 text-sm font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)] disabled:opacity-50"
            >
              {busy ? <ArrowPathIcon className="size-4 animate-spin" /> : <SparklesIcon className="size-4" />}
              Run with AI summary
            </button>
          </div>

          {latest ? (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Last run" value={latest.mode} />
                <Stat label="Critical" value={latest.stats?.critical ?? 0} />
                <Stat label="At risk" value={latest.stats?.warn ?? 0} />
                <Stat label="Watch" value={latest.stats?.info ?? 0} />
                <Stat label="Clients" value={latest.stats?.clientsScanned ?? 0} />
                <Stat label="Developers" value={latest.stats?.developersScanned ?? 0} />
                <Stat label="New today" value={latest.stats?.newSinceLast ?? 0} />
                <Stat label="Blind spots" value={latest.stats?.blindSpots ?? 0} />
              </div>
              <p className="text-xs text-[var(--text-3)]">
                Ran {fmtDate(latest.startedAt)} · {latest.status}
                {latest.stats?.aiSkipped ? " · AI summary skipped (no cost)" : latest.aiModel ? ` · ${latest.aiModel}` : ""}
                {latest.error ? ` · error: ${latest.error}` : ""}
              </p>
            </>
          ) : (
            <p className="text-sm text-[var(--text-3)]">No runs yet. Try a dry run to preview today&apos;s picture.</p>
          )}
        </div>
      </SettingsCard>

      {/* 02 — LATEST FINDINGS */}
      <SettingsCard
        number="02"
        title="Latest findings"
        right={<span className="widget-data-label text-[var(--text-3)]">{risks.length} risks</span>}
      >
        {latest?.narrative?.summary ? (
          <p className="mb-3 text-sm leading-relaxed text-[var(--text-2)]">{latest.narrative.summary}</p>
        ) : null}
        {risks.length === 0 ? (
          <p className="text-sm text-[var(--text-3)]">No overdue or at-risk work in the latest run.</p>
        ) : (
          <ul className="space-y-2">
            {risks.map((f: ForemanFinding) => (
              <li key={f.key} className="rounded-xl border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
                <div className="flex items-center gap-2">
                  <span
                    className={cn("rounded-[4px] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", sevClass(f.severity))}
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {f.severity === "critical" ? "Critical" : f.severity === "warn" ? "At risk" : "Watch"}
                  </span>
                  <span className="min-w-0 flex-1 text-sm font-medium text-[var(--text-1)]">{f.headline}</span>
                </div>
                <p className="mt-1.5 text-xs text-[var(--text-3)]">{f.recommendation}</p>
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>

      {/* 03 — SETTINGS */}
      <ConfigSection
        config={status.config}
        onSave={async (patch) => {
          try {
            await updateConfig.mutateAsync(patch);
            success("Foreman settings saved");
          } catch (e) {
            error("Could not save settings", e instanceof Error ? e.message : undefined);
          }
        }}
        saving={updateConfig.isPending}
      />

      {/* 04 — HISTORY */}
      <SettingsCard number="04" title="Recent runs">
        {runs.length === 0 ? (
          <p className="text-sm text-[var(--text-3)]">No runs recorded.</p>
        ) : (
          <ul className="divide-y divide-[var(--border-2)]">
            {runs.map((r: ForemanRunSummary) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="text-[var(--text-1)]">{fmtDate(r.startedAt)}</span>
                  <span className="ml-2 widget-data-label text-[var(--text-3)]">
                    {r.mode} · {r.status} · {(r.stats?.critical ?? 0) + (r.stats?.warn ?? 0)} risk(s)
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>
    </div>
  );
}

function ConfigSection({
  config,
  onSave,
  saving,
}: {
  config: ForemanConfig;
  onSave: (patch: Partial<ForemanConfig>) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState<ForemanConfig>(config);
  const dirty = JSON.stringify(draft) !== JSON.stringify(config);

  function num(key: keyof ForemanConfig, value: string) {
    const n = parseInt(value, 10);
    if (!Number.isNaN(n)) setDraft((d) => ({ ...d, [key]: n }));
  }

  return (
    <SettingsCard number="03" title="Settings">
      <div className="space-y-4">
        <label className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-3">
          <span className="text-sm text-[var(--text-1)]">Enabled (daily 09:00 run)</span>
          <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft((d) => ({ ...d, enabled: e.target.checked }))} className="size-4" />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-3">
          <span className="text-sm text-[var(--text-1)]">AI summary (writes a short narrative — costs tokens)</span>
          <input type="checkbox" checked={draft.consolidate} onChange={(e) => setDraft((d) => ({ ...d, consolidate: e.target.checked }))} className="size-4" />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(
            [
              ["dueSoonDays", "\"Due soon\" horizon (days)"],
              ["criticalOverdue", "Overdue count → critical"],
              ["staleDoingDays", "Stalled after (days)"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block">
              <span className="widget-data-label text-[var(--text-3)]">{label}</span>
              <input
                type="number"
                min={1}
                value={draft[key] as number}
                onChange={(e) => num(key, e.target.value)}
                className="mt-1 w-full rounded-xl border border-[var(--border-2)] bg-[var(--surface-0)] px-3 py-2 text-sm text-[var(--text-1)] focus:border-[var(--brand-400)] focus:outline-none"
              />
            </label>
          ))}
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={() => onSave(draft)}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-semibold text-white",
              dirty && !saving ? "bg-[var(--brand-600)] hover:bg-[var(--brand-700)]" : "bg-[var(--border-2)] cursor-not-allowed",
            )}
          >
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>
      </div>
    </SettingsCard>
  );
}
