"use client";

import { useState } from "react";
import { ArrowPathIcon, PlayIcon, BeakerIcon, CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { SettingsCard } from "@/components/settings/settings-card";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/format";
import {
  useCuratorStatus,
  useCuratorRuns,
  useRunCurator,
  useCuratorProposalAction,
  useRestoreCuratorRun,
  useUpdateCuratorConfig,
  type CuratorConfig,
  type CuratorProposal,
  type CuratorRunSummary,
} from "@/hooks/use-curator";

const PROPOSAL_LABELS: Record<CuratorProposal["kind"], string> = {
  STARTER_ARCHIVE: "Archive starter",
  STARTER_CONSOLIDATE: "Consolidate (advisory)",
  CHECK_DISABLE: "Disable check",
  CHECK_SEVERITY: "Change severity",
  CHECK_RELABEL: "Relabel check",
};

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

export function CuratorPanel() {
  const { data: status, isLoading } = useCuratorStatus();
  const { data: runs = [] } = useCuratorRuns();
  const runCurator = useRunCurator();
  const proposalAction = useCuratorProposalAction();
  const restoreRun = useRestoreCuratorRun();
  const updateConfig = useUpdateCuratorConfig();
  const { success, error } = useToast();

  if (isLoading || !status) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-[var(--text-3)]">
        <ArrowPathIcon className="size-4 animate-spin" />
        Loading curator…
      </div>
    );
  }

  const latest = status.latestRun;
  const openProposals = (latest?.proposals ?? []).filter((p) => p.status === "open");

  async function run(mode?: "prune" | "consolidate", dryRun?: boolean) {
    try {
      await runCurator.mutateAsync({ mode, dryRun });
      success(dryRun ? "Dry run complete" : "Curator run complete");
    } catch (e) {
      error("Curator run failed", e instanceof Error ? e.message : undefined);
    }
  }

  async function act(runId: string, proposalId: string, action: "apply" | "dismiss") {
    try {
      await proposalAction.mutateAsync({ runId, proposalId, action });
      success(action === "apply" ? "Proposal applied" : "Proposal dismissed");
    } catch (e) {
      error("Could not process proposal", e instanceof Error ? e.message : undefined);
    }
  }

  async function restore(runId: string) {
    try {
      const res = (await restoreRun.mutateAsync(runId)) as { reversed?: number };
      success("Run reversed", `${res?.reversed ?? 0} starter change(s) undone.`);
    } catch (e) {
      error("Restore failed", e instanceof Error ? e.message : undefined);
    }
  }

  const busy = runCurator.isPending;

  return (
    <div className="space-y-5">
      {/* 01 — STATUS */}
      <SettingsCard
        number="01"
        title="Status"
        right={
          <span className="widget-data-label text-[var(--text-3)]">
            {status.config.enabled ? `Weekly · next ${fmtDate(status.nextDueAt)}` : "Disabled"}
          </span>
        }
      >
        <div className="space-y-4">
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
              onClick={() => run("consolidate", false)}
              className="flex items-center gap-1.5 rounded-xl border border-[var(--border-2)] px-4 py-2 text-sm font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)] disabled:opacity-50"
            >
              {busy ? <ArrowPathIcon className="size-4 animate-spin" /> : null}
              Run with consolidation
            </button>
          </div>

          {latest ? (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Last run" value={latest.mode} />
                <Stat label="Starters staled" value={latest.stats?.startersStaled ?? 0} />
                <Stat label="Starters archived" value={latest.stats?.startersArchived ?? 0} />
                <Stat label="Proposals" value={latest.stats?.proposalsCreated ?? 0} />
                <Stat label="Checks tracked" value={latest.stats?.checksAggregated ?? 0} />
                <Stat label="Dead checks" value={latest.stats?.deadChecks ?? 0} />
                <Stat label="Always-pass" value={latest.stats?.alwaysPassChecks ?? 0} />
                <Stat label="Noisy" value={latest.stats?.noisyChecks ?? 0} />
              </div>
              <p className="text-xs text-[var(--text-3)]">
                Ran {fmtDate(latest.startedAt)} · {latest.status}
                {latest.stats?.aiSkipped ? " · LLM pass skipped (no cost)" : latest.aiModel ? ` · ${latest.aiModel}` : ""}
                {latest.error ? ` · error: ${latest.error}` : ""}
              </p>
            </>
          ) : (
            <p className="text-sm text-[var(--text-3)]">No runs yet. Try a dry run to preview.</p>
          )}
        </div>
      </SettingsCard>

      {/* 02 — PROPOSALS */}
      <SettingsCard number="02" title="Proposals" right={<span className="widget-data-label text-[var(--text-3)]">{openProposals.length} open</span>}>
        {openProposals.length === 0 ? (
          <p className="text-sm text-[var(--text-3)]">No open proposals. The LLM pass only runs when consolidation is on and there&apos;s something to review.</p>
        ) : (
          <ul className="space-y-2">
            {openProposals.map((p) => {
              const advisory = p.kind === "STARTER_CONSOLIDATE";
              return (
                <li key={p.id} className="rounded-xl border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="rounded-[4px] bg-[var(--brand-50)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--brand-600)]">
                        {PROPOSAL_LABELS[p.kind]}
                      </span>
                      <p className="mt-1.5 text-sm text-[var(--text-1)]">{p.targetLabel ?? p.target}</p>
                      <p className="mt-0.5 text-xs text-[var(--text-3)]">{p.rationale}</p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      {!advisory ? (
                        <button
                          type="button"
                          disabled={proposalAction.isPending}
                          onClick={() => latest && act(latest.id, p.id, "apply")}
                          className="flex items-center gap-1 rounded-lg bg-[var(--brand-600)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--brand-700)] disabled:opacity-50"
                        >
                          <CheckIcon className="size-3.5" /> Apply
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={proposalAction.isPending}
                        onClick={() => latest && act(latest.id, p.id, "dismiss")}
                        className="flex items-center gap-1 rounded-lg border border-[var(--border-2)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)] disabled:opacity-50"
                      >
                        <XMarkIcon className="size-3.5" /> Dismiss
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SettingsCard>

      {/* 03 — LEAST-RECENTLY USED STARTERS */}
      <SettingsCard number="03" title="Least-recently used starters">
        {status.lruStarters.length === 0 ? (
          <p className="text-sm text-[var(--text-3)]">No workspace-authored starters yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--border-2)]">
            {status.lruStarters.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                <span className="truncate text-[var(--text-1)]">{s.name}</span>
                <span className="ml-3 shrink-0 widget-data-label text-[var(--text-3)]">
                  {s.curatorState} · {s.usageCount} uses · {s.lastUsedAt ? fmtDate(s.lastUsedAt) : "never used"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>

      {/* 04 — SETTINGS */}
      <ConfigSection
        config={status.config}
        onSave={async (patch) => {
          try {
            await updateConfig.mutateAsync(patch);
            success("Curator settings saved");
          } catch (e) {
            error("Could not save settings", e instanceof Error ? e.message : undefined);
          }
        }}
        saving={updateConfig.isPending}
      />

      {/* 05 — HISTORY */}
      <SettingsCard number="05" title="Recent runs">
        {runs.length === 0 ? (
          <p className="text-sm text-[var(--text-3)]">No runs recorded.</p>
        ) : (
          <ul className="divide-y divide-[var(--border-2)]">
            {runs.map((r: CuratorRunSummary) => {
              const changes = r.transitions.length;
              return (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="text-[var(--text-1)]">{fmtDate(r.startedAt)}</span>
                    <span className="ml-2 widget-data-label text-[var(--text-3)]">
                      {r.mode} · {r.status} · {changes} change(s)
                    </span>
                  </span>
                  {changes > 0 && r.mode !== "dry_run" ? (
                    <button
                      type="button"
                      disabled={restoreRun.isPending}
                      onClick={() => restore(r.id)}
                      className="shrink-0 rounded-lg border border-[var(--border-2)] px-3 py-1 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)] disabled:opacity-50"
                    >
                      Restore
                    </button>
                  ) : null}
                </li>
              );
            })}
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
  config: CuratorConfig;
  onSave: (patch: Partial<CuratorConfig>) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState<CuratorConfig>(config);
  const dirty = JSON.stringify(draft) !== JSON.stringify(config);

  function num(key: keyof CuratorConfig, value: string) {
    const n = parseInt(value, 10);
    if (!Number.isNaN(n)) setDraft((d) => ({ ...d, [key]: n }));
  }

  return (
    <SettingsCard number="04" title="Settings">
      <div className="space-y-4">
        <label className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-3">
          <span className="text-sm text-[var(--text-1)]">Enabled (weekly run)</span>
          <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft((d) => ({ ...d, enabled: e.target.checked }))} className="size-4" />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-3">
          <span className="text-sm text-[var(--text-1)]">Consolidation (LLM pass — costs tokens)</span>
          <input type="checkbox" checked={draft.consolidate} onChange={(e) => setDraft((d) => ({ ...d, consolidate: e.target.checked }))} className="size-4" />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(
            [
              ["staleAfterDays", "Stale after (days)"],
              ["archiveAfterDays", "Archive after (days)"],
              ["intervalDays", "Interval (days)"],
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
