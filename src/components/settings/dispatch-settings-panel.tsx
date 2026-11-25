"use client";

/**
 * Settings → Dispatch (Super Admins, §155): the switch that releases the assistant to the team,
 * the AI budget the hourly check alerts against, and the Figma token Dispatch reads designs with.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SettingsCard } from "@/components/settings/settings-card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { LoadingState } from "@/components/ui/motion/loading-state";
import { apiFetch } from "@/lib/api";
import { formatBudgetUsd } from "@/lib/dispatch/budget";

interface DispatchSettings {
  assistantEnabled: boolean;
  budgetUsd: number;
  budgetSince: string | null;
  figmaConnected: boolean;
  spend: { budgetUsd: number; spentUsd: number; dispatchUsd: number; period: { label: string } };
}

type Patch = Partial<{ assistantEnabled: boolean; budgetUsd: number; budgetSince: string | null; figmaToken: string | null }>;

const KEY = ["dispatch-settings"];

export function DispatchSettingsPanel() {
  const qc = useQueryClient();
  const { success, error } = useToast();
  const { data, isLoading } = useQuery({ queryKey: KEY, queryFn: () => apiFetch<DispatchSettings>("/api/dispatch/settings") });
  const save = useMutation({
    mutationFn: (patch: Patch) =>
      apiFetch<DispatchSettings>("/api/dispatch/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }),
    onSuccess: (next) => qc.setQueryData(KEY, next),
  });
  const [budget, setBudget] = useState<string | null>(null);
  const [since, setSince] = useState<string | null>(null);
  const [token, setToken] = useState("");

  if (isLoading || !data) return <LoadingState label="Loading Dispatch…" className="py-8" />;

  async function apply(patch: Patch, done: string) {
    try {
      await save.mutateAsync(patch);
      success(done);
      return true;
    } catch (e) {
      error("Not saved", e instanceof Error ? e.message : undefined);
      return false;
    }
  }

  const pct = data.spend.budgetUsd > 0 ? Math.min(100, Math.round((data.spend.spentUsd / data.spend.budgetUsd) * 100)) : 0;
  const budgetValue = budget ?? String(data.budgetUsd);
  const sinceValue = since ?? data.budgetSince ?? "";

  return (
    <div className="space-y-5">
      <SettingsCard number="01" title="The assistant">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--text-1)]">Switch Dispatch on for the team</p>
            <p className="mt-1 text-sm text-[var(--text-3)]">
              The panel in the app and answers in Slack, for everyone with the Dispatch permission. Super Admins can use it
              while it&apos;s off, to try it.
            </p>
          </div>
          <Switch
            checked={data.assistantEnabled}
            disabled={save.isPending}
            label="Dispatch for the team"
            onChange={(next) => void apply({ assistantEnabled: next }, next ? "Dispatch is on for the team" : "Dispatch is off for the team")}
          />
        </div>
      </SettingsCard>

      <SettingsCard number="02" title="AI budget">
        <p className="text-sm text-[var(--text-3)]">
          Every AI feature on the Anthropic key counts, not only Dispatch. Super Admins are told at 50%, 80% and 95%. Nothing is
          switched off at 100%.
        </p>
        <div className="mt-4">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-[var(--text-1)]">
              {formatBudgetUsd(data.spend.spentUsd)} of {formatBudgetUsd(data.spend.budgetUsd)} {data.spend.period.label}
            </span>
            <span className="tabular-nums text-[var(--text-3)]">{pct}%</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--surface-2)]" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Budget used">
            <div
              className={pct >= 95 ? "h-full bg-[var(--danger-500)]" : pct >= 80 ? "h-full bg-[var(--warning-500)]" : "h-full bg-[var(--brand-700)]"}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-[var(--text-4)]">Dispatch: {formatBudgetUsd(data.spend.dispatchUsd)}. Estimated from list prices.</p>
        </div>
        <form
          className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(budgetValue);
            if (!Number.isFinite(n) || n < 1) return error("Not saved", "The budget must be at least $1.");
            void apply({ budgetUsd: n, budgetSince: sinceValue || null }, "Budget saved").then((ok) => {
              if (ok) {
                setBudget(null);
                setSince(null);
              }
            });
          }}
        >
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--text-2)]">Budget (US dollars)</span>
            <input className="app-input" inputMode="decimal" value={budgetValue} onChange={(e) => setBudget(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--text-2)]">Count from (empty: each month)</span>
            <input className="app-input" type="text" placeholder="YYYY-MM-DD" pattern="\d{4}-\d{2}-\d{2}" value={sinceValue} onChange={(e) => setSince(e.target.value)} />
          </label>
          <Button type="submit" variant="secondary" size="sm" loading={save.isPending}>
            Save budget
          </Button>
        </form>
      </SettingsCard>

      <SettingsCard number="03" title="Figma" right={<span className="text-xs text-[var(--text-3)]">{data.figmaConnected ? "Connected" : "Not connected"}</span>}>
        <p className="text-sm text-[var(--text-3)]">
          A Figma personal access token lets Dispatch read the designs linked on each client in Portal, to compare them with
          what was built. Make it from a Gitwork Figma account that can see those files, with read-only file access. It is
          stored encrypted and never shown again.
        </p>
        <form
          className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (!token.trim()) return;
            void apply({ figmaToken: token.trim() }, "Figma connected").then((ok) => ok && setToken(""));
          }}
        >
          <label className="block min-w-0 flex-1">
            <span className="mb-1 block text-xs font-medium text-[var(--text-2)]">{data.figmaConnected ? "Replace token" : "Personal access token"}</span>
            <input className="app-input" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="figd_…" />
          </label>
          <div className="flex gap-2">
            <Button type="submit" variant="secondary" size="sm" loading={save.isPending} disabled={!token.trim()}>
              Save token
            </Button>
            {data.figmaConnected ? (
              <Button type="button" variant="tertiary" size="sm" disabled={save.isPending} onClick={() => void apply({ figmaToken: null }, "Figma disconnected")}>
                Disconnect
              </Button>
            ) : null}
          </div>
        </form>
      </SettingsCard>
    </div>
  );
}
