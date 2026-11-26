"use client";

/**
 * Settings → Dispatch (Super Admins, §156): the switch that releases the assistant to the team,
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
import { DatePicker } from "@/components/ui/date-picker";
import { formatDisplayDate } from "@/lib/calendar-date";

interface DispatchSettings {
  assistantEnabled: boolean;
  budgetUsd: number;
  budgetSince: string | null;
  figmaConnected: boolean;
  anthropicConnected: boolean;
  anthropicKeyFromServer: boolean;
  spend: {
    budgetUsd: number;
    spentUsd: number;
    dispatchUsd: number;
    source: "anthropic" | "estimate";
    billedThrough: string | null;
    anthropicError: boolean;
    period: { label: string };
  };
}

type PendingAction = "switch" | "budget" | "figma" | "figma-off" | "anthropic" | "anthropic-off";

type Patch = Partial<{
  assistantEnabled: boolean;
  budgetUsd: number;
  budgetSince: string | null;
  figmaToken: string | null;
  anthropicAdminKey: string | null;
}>;

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
  const [adminKey, setAdminKey] = useState("");
  /** The one control being saved: only its button shows a spinner (they used to all spin). */
  const [pending, setPending] = useState<PendingAction | null>(null);

  if (isLoading || !data) return <LoadingState label="Loading Dispatch…" className="py-8" />;

  async function apply(patch: Patch, done: string, action: PendingAction) {
    setPending(action);
    try {
      await save.mutateAsync(patch);
      success(done);
      return true;
    } catch (e) {
      error("Not saved", e instanceof Error ? e.message : undefined);
      return false;
    } finally {
      setPending(null);
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
            disabled={pending === "switch"}
            label="Dispatch for the team"
            onChange={(next) => void apply({ assistantEnabled: next }, next ? "Dispatch is on for the team" : "Dispatch is off for the team", "switch")}
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
          <p className="mt-1.5 text-xs text-[var(--text-4)]">
            {data.spend.source === "anthropic" && data.spend.billedThrough
              ? `From Anthropic's own billing to the end of ${formatDisplayDate(new Date(Date.parse(data.spend.billedThrough) - 86_400_000).toISOString().slice(0, 10))}, plus Foundry's estimate for today (Anthropic reports a day behind).`
              : data.spend.anthropicError
                ? "Anthropic's billing didn't answer, so this is Foundry's estimate from list prices for now."
                : "Foundry's estimate from list prices. Connect an Anthropic Admin key below to use Anthropic's own figures."}{" "}
            Dispatch: {formatBudgetUsd(data.spend.dispatchUsd)} (estimated).
          </p>
        </div>
        <form
          className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(budgetValue);
            if (!Number.isFinite(n) || n < 1) return error("Not saved", "The budget must be at least $1.");
            void apply({ budgetUsd: n, budgetSince: sinceValue || null }, "Budget saved", "budget").then((ok) => {
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
          <div className="block">
            <span id="dispatch-budget-since" className="mb-1 block text-xs font-medium text-[var(--text-2)]">
              Count from (empty: each month)
            </span>
            <DatePicker
              value={sinceValue}
              onChange={(v) => setSince(v)}
              aria-label="Count spend from"
              placeholder="Each calendar month"
              max={new Date().toISOString().slice(0, 10)}
            />
          </div>
          <Button type="submit" variant="secondary" size="sm" loading={pending === "budget"}>
            Save budget
          </Button>
        </form>
      </SettingsCard>

      <SettingsCard number="03" title="Figma" right={<span className="text-xs text-[var(--text-3)]">{data.figmaConnected ? "Connected" : "Not connected"}</span>}>
        <p className="text-sm text-[var(--text-3)]">
          A Figma personal access token lets Dispatch read the designs linked on each client in Portal, to compare them with
          what was built. In Figma, go to Settings → Security → Personal access tokens, and give it &quot;File content&quot;
          read-only. Make it from an account that can see the clients&apos; files. It is checked against one of those files,
          stored encrypted and never shown again.
        </p>
        {data.figmaConnected ? (
          <ConnectedRow
            text="Connected. To use a different token, disconnect this one and add the new one."
            loading={pending === "figma-off"}
            onDisconnect={() => void apply({ figmaToken: null }, "Figma disconnected", "figma-off")}
          />
        ) : (
          <form
            className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (!token.trim()) return;
              void apply({ figmaToken: token.trim() }, "Figma connected", "figma").then((ok) => ok && setToken(""));
            }}
          >
            <label className="block min-w-0 flex-1">
              <span className="mb-1 block text-xs font-medium text-[var(--text-2)]">Personal access token</span>
              <input className="app-input" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="figd_…" />
            </label>
            <Button type="submit" variant="secondary" size="sm" loading={pending === "figma"} disabled={!token.trim()}>
              Save token
            </Button>
          </form>
        )}
      </SettingsCard>

      <SettingsCard
        number="04"
        title="Anthropic billing"
        right={<span className="text-xs text-[var(--text-3)]">{data.anthropicConnected ? "Connected" : "Not connected"}</span>}
      >
        <p className="text-sm text-[var(--text-3)]">
          With an Anthropic Admin key, the budget above, its alerts and the AI spend card in the sidebar use Anthropic&apos;s own
          billed figures instead of Foundry&apos;s estimate. Make one in the Claude Console under Settings → Admin keys (it
          starts sk-ant-admin). Anthropic has no way to read the credit balance itself, so the budget figure stays the one you
          set above. The key is checked with Anthropic, stored encrypted and never shown again.
        </p>
        {data.anthropicKeyFromServer ? (
          <p className="mt-3 text-sm text-[var(--text-2)]">Set on the server (ANTHROPIC_ADMIN_KEY), so it&apos;s changed there.</p>
        ) : data.anthropicConnected ? (
          <ConnectedRow
            text="Connected. To use a different key, disconnect this one and add the new one."
            loading={pending === "anthropic-off"}
            onDisconnect={() => void apply({ anthropicAdminKey: null }, "Anthropic billing disconnected", "anthropic-off")}
          />
        ) : (
          <form
            className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (!adminKey.trim()) return;
              void apply({ anthropicAdminKey: adminKey.trim() }, "Anthropic billing connected", "anthropic").then((ok) => ok && setAdminKey(""));
            }}
          >
            <label className="block min-w-0 flex-1">
              <span className="mb-1 block text-xs font-medium text-[var(--text-2)]">Admin key</span>
              <input className="app-input" type="password" autoComplete="off" value={adminKey} onChange={(e) => setAdminKey(e.target.value)} placeholder="sk-ant-admin…" />
            </label>
            <Button type="submit" variant="secondary" size="sm" loading={pending === "anthropic"} disabled={!adminKey.trim()}>
              Save key
            </Button>
          </form>
        )}
      </SettingsCard>

      <LinkCheckCard />
    </div>
  );
}

interface LinkCheckResult {
  checkedAt: string;
  clients: {
    clientId: string;
    clientName: string;
    clientSlug: string;
    links: { kind: "design" | "repo"; name: string; url: string | null; ok: boolean; problem: string | null; fix: string | null }[];
    gaps: string[];
  }[];
}

/**
 * Which designs and repositories Dispatch can open, client by client, and how to fix the ones it
 * can't (§173). Runs on a click: it opens every active client's links, which takes a moment.
 */
function LinkCheckCard() {
  const [result, setResult] = useState<LinkCheckResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = () => {
    setRunning(true);
    setError(null);
    apiFetch<LinkCheckResult>("/api/dispatch/links")
      .then(setResult)
      .catch((e) => setError(e instanceof Error ? e.message : "The check didn't finish."))
      .finally(() => setRunning(false));
  };
  const broken = result ? result.clients.reduce((n, c) => n + c.links.filter((l) => !l.ok).length, 0) : 0;
  return (
    <SettingsCard
      number="05"
      title="What Dispatch can open"
      right={
        <Button type="button" variant="secondary" size="sm" loading={running} onClick={run}>
          {result ? "Check again" : "Check links"}
        </Button>
      }
    >
      <p className="text-sm text-[var(--text-3)]">
        Opens every active client&apos;s Figma designs and GitHub repositories the way Dispatch does, and says what to fix for
        any it can&apos;t.
      </p>
      {error ? <p className="mt-3 text-sm text-[var(--warning-500)]">{error}</p> : null}
      {result ? (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-[var(--text-3)]">
            {broken ? `${broken} link${broken === 1 ? "" : "s"} won't open.` : "Everything linked opens."} Checked {new Date(result.checkedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}.
          </p>
          <ul className="divide-y divide-[var(--border-2)] overflow-hidden rounded-[10px] border border-[var(--border-2)]">
            {result.clients.map((c) => {
              const bad = c.links.filter((l) => !l.ok);
              return (
                <li key={c.clientId} className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <a href={`/app/portal/${c.clientSlug}`} className="text-sm font-medium text-[var(--text-1)] hover:text-[var(--brand-700)]">
                      {c.clientName}
                    </a>
                    <span className={bad.length ? "ml-auto text-xs text-[var(--warning-500)]" : "ml-auto text-xs text-[var(--text-4)]"}>
                      {c.links.length ? `${c.links.length - bad.length} of ${c.links.length} open` : "nothing linked"}
                    </span>
                  </div>
                  {bad.map((l) => (
                    <div key={`${l.kind}:${l.name}`} className="mt-1.5 text-xs text-[var(--text-2)]">
                      <span className="font-medium">{l.kind === "design" ? "Design" : "Code"}: {l.name}.</span> {l.problem}{" "}
                      <span className="text-[var(--text-3)]">{l.fix}</span>
                    </div>
                  ))}
                  {c.gaps.map((g) => (
                    <p key={g} className="mt-1 text-xs text-[var(--text-4)]">
                      {g}
                    </p>
                  ))}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </SettingsCard>
  );
}

/** A connected key: what it means, and the one thing to do with it. */
function ConnectedRow({ text, loading, onDisconnect }: { text: string; loading: boolean; onDisconnect: () => void }) {
  return (
    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-[var(--text-2)]">{text}</p>
      <Button type="button" variant="secondary" size="sm" loading={loading} onClick={onDisconnect}>
        Disconnect
      </Button>
    </div>
  );
}
