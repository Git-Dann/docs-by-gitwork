"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { WidgetCard } from "@/components/codeclear/codeclear-shared";
import { usePermissions } from "@/hooks/use-permissions";
import { cn } from "@/lib/format";
import { useNotice } from "./notice";
import {
  useCreateDevSignalPipelineConfig,
  useDevSignalCalibration,
  useDevSignalConfigs,
} from "@/hooks/use-devsignal";
import { CALIBRATION_THRESHOLDS, type CalibrationReport } from "@/lib/devsignal/calibration";
import type { DevSignalPipelineConfigDTO } from "@/types/devsignal";

const STATUS_TONE: Record<string, string> = {
  insufficient: "border-[var(--border-2)] bg-[var(--surface-1)] text-[var(--text-3)]",
  provisional: "border-amber-200 bg-amber-50 text-amber-700",
  calibrated: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

function label(stageId: string): string {
  return stageId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function bumpVersion(v: string): string {
  const m = /^v(\d+)$/.exec(v);
  return m ? `v${Number(m[1]) + 1}` : `${v}-2`;
}

export function ModelCockpit() {
  const { canCalibrateDevSignal } = usePermissions();
  const calibration = useDevSignalCalibration(canCalibrateDevSignal);
  const configs = useDevSignalConfigs();

  if (!canCalibrateDevSignal) {
    return (
      <p className="text-sm text-[var(--text-3)]">
        The scoring model is editable by Super Admins only. Ask the platform owner for access.
      </p>
    );
  }

  const report = calibration.data?.report;
  const defaultConfig = configs.data?.items.find((c) => c.isDefault) ?? configs.data?.items[0] ?? null;

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--brand-700)]">
          DevSignal · Super Admin
        </p>
        <h2 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-[var(--text-1)]">
          Model &amp; calibration
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-[var(--text-3)]">
          How the score is weighted, and how well it predicts real delivery outcomes. Method:
          criterion-related validation — each stage&apos;s score is correlated against recorded
          outcomes, benchmarked against the personnel-selection literature (Sackett et al. 2022).
        </p>
      </div>

      {calibration.isLoading ? (
        <p className="text-sm text-[var(--text-4)]">Loading…</p>
      ) : (
        <>
          <StatusCard report={report} />
          <ValidityTable report={report} />
          <WeightEditor config={defaultConfig} suggested={report?.suggestedWeights ?? null} />
        </>
      )}
    </div>
  );
}

function StatusCard({ report }: { report?: CalibrationReport }) {
  const status = report?.status ?? "insufficient";
  const n = report?.n ?? 0;
  const overall = report?.overallValidity ?? null;
  return (
    <WidgetCard number="01" name="Model status">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={cn(
            "rounded-[4px] border px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em]",
            STATUS_TONE[status],
          )}
        >
          {status}
        </span>
        <span className="text-sm text-[var(--text-3)]">
          {n} scored outcome{n === 1 ? "" : "s"} ·{" "}
          {overall === null ? "validity not yet computable" : `operational validity r = ${overall.toFixed(2)}`}
        </span>
      </div>
      {status !== "calibrated" && (
        <p className="mt-2 text-xs text-[var(--text-4)]">
          Scores are <strong>provisional</strong> until {CALIBRATION_THRESHOLDS.calibrated}+ outcomes are recorded.
          Record delivery outcomes on each assessment (Delivery outcomes panel) to build the data.
        </p>
      )}
      {report?.caveats && report.caveats.length > 0 && (
        <ul className="mt-3 space-y-1">
          {report.caveats.map((c) => (
            <li key={c} className="flex gap-2 text-xs leading-relaxed text-[var(--text-4)]">
              <span>⚠</span>
              <span>{c}</span>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

function ValidityTable({ report }: { report?: CalibrationReport }) {
  const stages = report?.stages ?? [];
  if (stages.length === 0) return null;
  return (
    <WidgetCard number="02" name="Stage validity">
      <p className="text-xs text-[var(--text-4)]">
        Observed = local correlation of the stage score with outcomes. Benchmark = revised
        operational validity for the equivalent method (Sackett et al. 2022). Observed is expected to
        sit <em>below</em> benchmark early on due to range restriction.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-4)]">
              <th className="pb-2">Stage</th>
              <th className="pb-2">Observed r (n)</th>
              <th className="pb-2">Benchmark</th>
            </tr>
          </thead>
          <tbody>
            {stages.map((s) => (
              <tr key={s.stageId} className="border-t border-[var(--border-2)]">
                <td className="py-2 text-[var(--text-2)]">{label(s.stageId)}</td>
                <td className="py-2 font-mono text-[var(--text-2)]">
                  {s.r === null ? <span className="text-[var(--text-4)]">— (n={s.n})</span> : `${s.r.toFixed(2)} (n=${s.n})`}
                </td>
                <td className="py-2 font-mono text-[var(--text-4)]">
                  {s.benchmark === null ? "—" : `${s.benchmark.toFixed(2)}`}
                  {s.benchmarkMethod ? <span className="ml-1 text-[var(--text-4)]">· {s.benchmarkMethod}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </WidgetCard>
  );
}

function WeightEditor({
  config,
  suggested,
}: {
  config: DevSignalPipelineConfigDTO | null;
  suggested: Record<string, number> | null;
}) {
  const { showOk, showErr, noticeEl } = useNotice();
  const create = useCreateDevSignalPipelineConfig();
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [blocking, setBlocking] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (config) {
      setWeights({ ...config.stageWeights });
      setBlocking({ ...config.blockingRules });
    }
  }, [config]);

  const stages = useMemo(() => {
    if (!config) return [];
    return config.stageOrder.length ? config.stageOrder : Object.keys(config.stageWeights);
  }, [config]);

  if (!config) {
    return (
      <WidgetCard number="03" name="Weights">
        <p className="text-sm text-[var(--text-4)]">No pipeline config found.</p>
      </WidgetCard>
    );
  }

  const enabledSum = stages
    .filter((s) => config.enabledStages.includes(s))
    .reduce((sum, s) => sum + (weights[s] ?? 0), 0);
  const sumOk = enabledSum === 100;

  const loadSuggested = () => {
    if (!suggested) return;
    setWeights((prev) => ({ ...prev, ...suggested }));
  };

  const save = async () => {
    if (!sumOk) {
      showErr("Weights must total 100", `Enabled stages currently sum to ${enabledSum}.`);
      return;
    }
    try {
      await create.mutateAsync({
        name: config.name,
        version: bumpVersion(config.version),
        isDefault: true,
        enabledStages: config.enabledStages,
        stageOrder: stages,
        stageWeights: weights,
        blockingRules: blocking,
      });
      showOk("Saved a new default version", "New assessments use it; past scores keep their snapshot.");
    } catch (e) {
      showErr("Could not save", e instanceof Error ? e.message : undefined);
    }
  };

  return (
    <WidgetCard number="03" name="Weights (editable)">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--text-4)]">
          Editing saves a <strong>new version</strong> as the default — historical scores keep the
          config they ran under. Enabled-stage weights must total 100.
        </p>
        {suggested && (
          <Button variant="secondary" size="sm" onClick={loadSuggested}>
            Load data-suggested weights
          </Button>
        )}
      </div>

      <div className="mt-4 space-y-2">
        {stages.map((s) => {
          const enabled = config.enabledStages.includes(s);
          return (
            <div key={s} className={cn("flex items-center gap-3", !enabled && "opacity-50")}>
              <span className="w-44 shrink-0 text-sm text-[var(--text-2)]">{label(s)}</span>
              <input
                type="number"
                min={0}
                max={100}
                value={weights[s] ?? 0}
                disabled={!enabled}
                onChange={(e) => setWeights((p) => ({ ...p, [s]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) }))}
                className="app-input w-20"
              />
              <label className="flex items-center gap-1.5 text-xs text-[var(--text-3)]">
                <input
                  type="checkbox"
                  checked={Boolean(blocking[s])}
                  onChange={(e) => setBlocking((p) => ({ ...p, [s]: e.target.checked }))}
                  className="accent-[var(--brand-600)]"
                />
                blocking gate
              </label>
              {suggested && typeof suggested[s] === "number" && (
                <span className="font-mono text-[10px] text-[var(--text-4)]">suggested {suggested[s]}</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-[var(--border-2)] pt-3">
        <span className={cn("font-mono text-xs", sumOk ? "text-emerald-600" : "text-rose-600")}>
          Enabled total: {enabledSum} / 100
        </span>
        <Button variant="primary" onClick={save} disabled={create.isPending || !sumOk}>
          {create.isPending ? "Saving…" : "Save new default version"}
        </Button>
      </div>
      {noticeEl}
    </WidgetCard>
  );
}
