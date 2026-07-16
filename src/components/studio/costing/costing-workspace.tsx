"use client";

// Gitwork Costing & Quote — a Super-Admin live calculator inside Studio.
//
// Enter a scope (phases in calendar weeks for a ~2-dev team), tune the cost levers, and get
// rate-card-grounded internal cost + margin (internal-only) and a client-facing fixed price for
// 1/2/3-dev teams. Nothing is persisted yet. Internal figures never leave this Super-Admin view.

import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCostingConfig, useCostingPreview } from "@/hooks/use-costing";
import type { CostingBand, CostingPhaseInput, GitworkCostingConfig } from "@/types/costing";

const DEFAULTS: GitworkCostingConfig = {
  fxFromUsd: 0.79,
  buildSeniority: "senior",
  ukReviewOverheadPercent: 15,
  contingencyPercent: 10,
  targetMarginPercent: 50,
};

const gbp = (n: number) => "£" + Math.round(n).toLocaleString("en-GB");
const gbpRange = (lo: number, hi: number) => (lo === hi ? gbp(lo) : `${gbp(lo)} – ${gbp(hi)}`);

export function CostingWorkspace() {
  const [phases, setPhases] = useState<CostingPhaseInput[]>([
    { name: "Discovery & setup", weeks: 2, outcome: "" },
    { name: "Core build", weeks: 6, outcome: "" },
    { name: "Hardening & launch", weeks: 2, outcome: "" },
  ]);
  const [bufferPct, setBufferPct] = useState(25);
  const [config, setConfig] = useState<GitworkCostingConfig>(DEFAULTS);
  const [selectedDevs, setSelectedDevs] = useState(2);

  const cfg = useCostingConfig(true);
  const preview = useCostingPreview();
  const fxPrefilled = useRef(false);

  // Prefill FX from the live rate once (unless the user has already touched it).
  useEffect(() => {
    if (!fxPrefilled.current && cfg.data?.defaults?.fxFromUsd) {
      fxPrefilled.current = true;
      setConfig((c) => ({ ...c, fxFromUsd: cfg.data!.defaults.fxFromUsd }));
    }
  }, [cfg.data]);

  const weeksLow = useMemo(() => phases.reduce((s, p) => s + (Number(p.weeks) || 0), 0), [phases]);
  const weeksHigh = useMemo(() => Math.max(weeksLow, Math.round(weeksLow * (1 + bufferPct / 100))), [weeksLow, bufferPct]);

  // Debounced recompute whenever the scope or levers change.
  const runRef = useRef(preview.mutate);
  runRef.current = preview.mutate;
  useEffect(() => {
    if (weeksLow <= 0) return;
    const t = setTimeout(() => {
      runRef.current({ scope: { phases, weeksLow, weeksHigh }, config });
    }, 400);
    return () => clearTimeout(t);
  }, [phases, weeksLow, weeksHigh, config]);

  const bands = preview.data?.bands ?? [];
  const selected: CostingBand | undefined = bands.find((b) => b.devs === selectedDevs) ?? bands[1] ?? bands[0];

  const setCfg = (patch: Partial<GitworkCostingConfig>) => setConfig((c) => ({ ...c, ...patch }));

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* 01 — SCOPE */}
        <div className="widget-card">
          <div className="widget-header">
            <span className="widget-header-label">01 // SCOPE</span>
            <span className="widget-header-right widget-data-label-bright">
              {weeksLow}–{weeksHigh} WKS
            </span>
          </div>
          <div className="flex flex-col gap-2 p-4">
            <p className="text-[13px] text-[var(--text-3)]">
              Phases in calendar weeks for a ~2-dev team. The total drives the effort estimate.
            </p>
            {phases.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className="app-input-compact flex-1"
                  value={p.name}
                  placeholder="Phase name"
                  onChange={(e) => setPhases((rows) => rows.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))}
                />
                <input
                  type="number"
                  min={0}
                  className="app-input-compact w-20"
                  value={p.weeks}
                  onChange={(e) =>
                    setPhases((rows) => rows.map((r, j) => (j === i ? { ...r, weeks: Number(e.target.value) || 0 } : r)))
                  }
                />
                <span className="widget-data-label">wks</span>
                <button
                  type="button"
                  className="app-button app-button-tertiary app-button-icon-sm"
                  aria-label="Remove phase"
                  onClick={() => setPhases((rows) => rows.filter((_, j) => j !== i))}
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="app-button app-button-secondary app-button-sm mt-1 self-start"
              onClick={() => setPhases((rows) => [...rows, { name: "", weeks: 1, outcome: "" }])}
            >
              <PlusIcon className="h-4 w-4" /> Add phase
            </button>
            <label className="mt-2 flex items-center gap-2">
              <span className="widget-data-label">high-end buffer</span>
              <input
                type="number"
                min={0}
                max={100}
                className="app-input-compact w-20"
                value={bufferPct}
                onChange={(e) => setBufferPct(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
              />
              <span className="widget-data-label">%</span>
            </label>
          </div>
        </div>

        {/* 02 — COST INPUTS */}
        <div className="widget-card">
          <div className="widget-header">
            <span className="widget-header-label">02 // COST INPUTS</span>
            <span className="widget-header-right widget-data-label">
              BUILD {preview.data ? gbp(preview.data.buildDayRateGbp) : "—"}/DAY
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 p-4">
            <Field label="Build seniority">
              <select
                className="app-select-compact"
                value={config.buildSeniority}
                onChange={(e) => setCfg({ buildSeniority: e.target.value === "mid" ? "mid" : "senior" })}
              >
                <option value="senior">Senior</option>
                <option value="mid">Mid</option>
              </select>
            </Field>
            <NumField label="FX USD→GBP" value={config.fxFromUsd} step={0.01} onChange={(v) => setCfg({ fxFromUsd: v ?? DEFAULTS.fxFromUsd })} />
            <NumField label="UK review overhead %" value={config.ukReviewOverheadPercent} onChange={(v) => setCfg({ ukReviewOverheadPercent: v ?? 0 })} />
            <NumField
              label="UK review £/day"
              value={config.ukReviewDayRateGbp}
              placeholder="auto"
              onChange={(v) => setCfg({ ukReviewDayRateGbp: v })}
            />
            <NumField label="Contingency %" value={config.contingencyPercent} onChange={(v) => setCfg({ contingencyPercent: v ?? 0 })} />
            <NumField label="Target margin %" value={config.targetMarginPercent} onChange={(v) => setCfg({ targetMarginPercent: v ?? 0 })} />
            <NumField
              label="Build £/day override"
              value={config.dayRateOverrideGbp}
              placeholder="from rate card"
              onChange={(v) => setCfg({ dayRateOverrideGbp: v })}
            />
            <div className="col-span-2">
              <span className="text-[12px] text-[var(--text-4)]">
                {preview.data
                  ? preview.data.usedRateCard
                    ? "Build rate blended from the workspace Rate Card."
                    : "Using the build £/day override (rate card not applied)."
                  : cfg.data && !cfg.data.hasRateCard
                    ? "No Rate Card people yet — using the fallback build rate."
                    : " "}
              </span>
            </div>
          </div>
        </div>

        {/* 03 — PRICING BANDS */}
        <div className="widget-card lg:col-span-2">
          <div className="widget-header">
            <span className="widget-header-label">03 // PRICING BANDS</span>
            <span className="widget-header-right widget-data-label">{preview.isPending ? "CALCULATING…" : "CLIENT PRICE"}</span>
          </div>
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
            {bands.length === 0 ? (
              <p className="text-[13px] text-[var(--text-3)]">Add a phase to see pricing bands.</p>
            ) : (
              bands.map((b) => {
                const active = selected?.devs === b.devs;
                return (
                  <button
                    key={b.devs}
                    type="button"
                    onClick={() => setSelectedDevs(b.devs)}
                    className={
                      "rounded-[10px] border p-4 text-left transition " +
                      (active
                        ? "border-[var(--brand-600)] bg-[var(--surface-brand)]"
                        : "border-[var(--border-2)] bg-[var(--surface-0)] hover:border-[var(--border-1)]")
                    }
                  >
                    <div className="widget-data-label">
                      {b.devs} DEV{b.devs > 1 ? "S" : ""} · {b.weeksLow}–{b.weeksHigh} WKS
                    </div>
                    <div className="widget-stat-sm mt-1">{gbp(b.clientPriceLowGbp)}</div>
                    <div className="widget-data-label mt-0.5">to {gbp(b.clientPriceHighGbp)}</div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* 04 — MARGIN & COST (internal) */}
        <div className="widget-card lg:col-span-2">
          <div className="widget-header">
            <span className="widget-header-label">04 // MARGIN &amp; COST</span>
            <span className="widget-header-right widget-data-label" style={{ color: "var(--danger-500)" }}>
              INTERNAL · SUPER ADMIN
            </span>
          </div>
          {selected ? (
            <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
              <Readout label="Build cost" value={gbp(selected.breakdown.buildCostGbp)} />
              <Readout label="UK review" value={gbp(selected.breakdown.ukReviewCostGbp)} />
              <Readout label="Contingency" value={gbp(selected.breakdown.contingencyGbp)} />
              <Readout label="Internal cost" value={gbpRange(selected.internalCostLowGbp, selected.internalCostHighGbp)} />
              <Readout label="Client price" value={gbpRange(selected.clientPriceLowGbp, selected.clientPriceHighGbp)} bright />
              <Readout label="Margin" value={`${selected.marginPercent}%`} bright />
              <Readout label="Markup" value={`${selected.markupPercent}%`} />
              <Readout label="Build £/day" value={gbp(selected.buildDayRateGbp)} />
            </div>
          ) : (
            <p className="p-4 text-[13px] text-[var(--text-3)]">Select a band to see the internal breakdown.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="widget-data-label">{label}</span>
      {children}
    </label>
  );
}

function NumField({
  label,
  value,
  onChange,
  step,
  placeholder,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  step?: number;
  placeholder?: string;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        step={step}
        placeholder={placeholder}
        className="app-input-compact"
        value={value ?? ""}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === "" ? undefined : Number(raw));
        }}
      />
    </Field>
  );
}

function Readout({ label, value, bright }: { label: string; value: string; bright?: boolean }) {
  return (
    <div>
      <div className={"widget-data-label" + (bright ? "-bright" : "")}>{label}</div>
      <div className="widget-stat-sm mt-0.5">{value}</div>
    </div>
  );
}
