"use client";

// Gitwork Costing & Quote — a Super-Admin calculator inside Studio, aligned to the four packages on
// gitwork.co.uk. Pick a package, give it a couple of inputs, see the client price + (Super-Admin
// only) the internal cost & margin behind it. Fixed packages take a target price; recurring ones
// compute from their published unit rate. Advanced cost levers are tucked away. Nothing is persisted.

import { useEffect, useMemo, useRef, useState } from "react";
import { useCostingConfig, useCostingPreview } from "@/hooks/use-costing";
import { COSTING_PACKAGES, type CostingAdvancedConfig, type PackageCostingInput, type PackageType } from "@/types/costing";

const gbp = (n: number) => "£" + Math.round(n).toLocaleString("en-GB");

const ADVANCED_DEFAULTS: CostingAdvancedConfig = {
  fxFromUsd: 0.79,
  buildSeniority: "senior",
  ukReviewOverheadPercent: 15,
  contingencyPercent: 10,
};

type Form = Omit<PackageCostingInput, "packageType" | "config">;

function seedForm(id: PackageType): Form {
  const meta = COSTING_PACKAGES.find((p) => p.id === id)!;
  if (id === "greenfield") return { devs: 1, months: 3, pricePerDevMonthGbp: meta.fromGbp };
  if (id === "care_plan") return { months: 3, effortDaysPerMonth: 2, pricePerMonthGbp: meta.fromGbp };
  return { targetPriceGbp: meta.fromGbp, weeks: id === "mvp_sprint" ? 5 : 3, devs: id === "mvp_sprint" ? 3 : 1 };
}

export function CostingWorkspace() {
  const [pkg, setPkg] = useState<PackageType>("launch_pad");
  const [form, setForm] = useState<Form>(() => seedForm("launch_pad"));
  const [config, setConfig] = useState<CostingAdvancedConfig>(ADVANCED_DEFAULTS);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const cfg = useCostingConfig(true);
  const preview = useCostingPreview();
  const fxPrefilled = useRef(false);

  // Reset inputs to the package's sensible defaults whenever the package changes.
  useEffect(() => {
    setForm(seedForm(pkg));
  }, [pkg]);

  // Prefill FX from the live rate once (unless already touched).
  useEffect(() => {
    if (!fxPrefilled.current && cfg.data?.defaults?.fxFromUsd) {
      fxPrefilled.current = true;
      setConfig((c) => ({ ...c, fxFromUsd: cfg.data!.defaults.fxFromUsd }));
    }
  }, [cfg.data]);

  const run = useRef(preview.mutate);
  run.current = preview.mutate;
  useEffect(() => {
    const t = setTimeout(() => run.current({ packageType: pkg, ...form, config }), 350);
    return () => clearTimeout(t);
  }, [pkg, form, config]);

  const result = preview.data && preview.data.packageType === pkg ? preview.data : undefined;
  const setField = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const setCfg = (patch: Partial<CostingAdvancedConfig>) => setConfig((c) => ({ ...c, ...patch }));
  const meta = COSTING_PACKAGES.find((p) => p.id === pkg)!;

  const marginColor = useMemo(() => {
    const m = result?.marginPercent ?? 0;
    return m >= 40 ? "var(--success-500)" : m >= 20 ? "var(--warning-500)" : "var(--danger-500)";
  }, [result?.marginPercent]);

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      {/* Package picker */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {COSTING_PACKAGES.map((p) => {
          const active = p.id === pkg;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setPkg(p.id)}
              className={
                "rounded-[10px] border p-4 text-left transition " +
                (active
                  ? "border-[var(--brand-600)] bg-[var(--surface-brand)]"
                  : "border-[var(--border-2)] bg-[var(--surface-0)] hover:border-[var(--border-1)]")
              }
            >
              <div className="text-[15px] font-semibold text-[var(--text-1)]">{p.name}</div>
              <div className="mt-0.5 text-[13px] text-[var(--text-3)]">{p.tagline}</div>
              <div className="widget-stat-sm mt-2">{gbp(p.fromGbp)}</div>
              <div className="widget-data-label mt-0.5">FROM · {p.basisLabel}</div>
            </button>
          );
        })}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Inputs */}
        <div className="widget-card">
          <div className="widget-header">
            <span className="widget-header-label">01 // {meta.name.toUpperCase()}</span>
            <span className="widget-header-right widget-data-label">{meta.typical.toUpperCase()}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 p-4">
            {pkg === "greenfield" ? (
              <>
                <NumField label="Developers" value={form.devs} onChange={(v) => setField({ devs: v })} />
                <NumField label="Months" value={form.months} onChange={(v) => setField({ months: v })} />
                <NumField label="Price / dev / month £" value={form.pricePerDevMonthGbp} onChange={(v) => setField({ pricePerDevMonthGbp: v })} />
              </>
            ) : pkg === "care_plan" ? (
              <>
                <NumField label="Months" value={form.months} onChange={(v) => setField({ months: v })} />
                <NumField label="Price / month £" value={form.pricePerMonthGbp} onChange={(v) => setField({ pricePerMonthGbp: v })} />
                <NumField label="Effort days / month" value={form.effortDaysPerMonth} onChange={(v) => setField({ effortDaysPerMonth: v })} />
              </>
            ) : (
              <>
                <NumField label="Target price £" value={form.targetPriceGbp} onChange={(v) => setField({ targetPriceGbp: v })} />
                <NumField label="Duration (weeks)" value={form.weeks} onChange={(v) => setField({ weeks: v })} />
                <NumField label="Team size (devs)" value={form.devs} onChange={(v) => setField({ devs: v })} />
              </>
            )}
          </div>

          {/* Advanced (collapsed) */}
          <details className="border-t border-[var(--border-3)] px-4 py-3" open={advancedOpen} onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}>
            <summary className="widget-data-label cursor-pointer select-none">Advanced cost inputs</summary>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="widget-data-label">Build seniority</span>
                <select
                  className="app-select-compact"
                  value={config.buildSeniority}
                  onChange={(e) => setCfg({ buildSeniority: e.target.value === "mid" ? "mid" : "senior" })}
                >
                  <option value="senior">Senior</option>
                  <option value="mid">Mid</option>
                </select>
              </label>
              <NumField label="FX USD→GBP" value={config.fxFromUsd} step={0.01} onChange={(v) => setCfg({ fxFromUsd: v ?? ADVANCED_DEFAULTS.fxFromUsd })} />
              <NumField label="UK review overhead %" value={config.ukReviewOverheadPercent} onChange={(v) => setCfg({ ukReviewOverheadPercent: v ?? 0 })} />
              <NumField label="Contingency %" value={config.contingencyPercent} onChange={(v) => setCfg({ contingencyPercent: v ?? 0 })} />
              <NumField label="Build £/day override" value={config.dayRateOverrideGbp} placeholder="from rate card" onChange={(v) => setCfg({ dayRateOverrideGbp: v })} />
            </div>
            <p className="mt-2 text-[12px] text-[var(--text-4)]">
              {result
                ? result.usedRateCard
                  ? `Build cost blended from the Rate Card at ${gbp(result.buildDayRateGbp)}/day.`
                  : `Using the ${gbp(result.buildDayRateGbp)}/day build override.`
                : cfg.data && !cfg.data.hasRateCard
                  ? "No Rate Card people yet — using the fallback build rate."
                  : " "}
            </p>
          </details>
        </div>

        {/* Result */}
        <div className="widget-card">
          <div className="widget-header">
            <span className="widget-header-label">02 // QUOTE</span>
            <span className="widget-header-right widget-data-label">{preview.isPending ? "CALCULATING…" : "CLIENT PRICE"}</span>
          </div>
          <div className="p-4">
            <div className="widget-stat">{result ? gbp(result.clientPriceGbp) : "—"}</div>
            <div className="widget-data-label mt-1">{result?.priceBasisLabel ?? ""}</div>

            <div className="mt-4 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
              <div className="widget-data-label" style={{ color: "var(--danger-500)" }}>
                INTERNAL · SUPER ADMIN
              </div>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <Readout label="Internal cost" value={result ? gbp(result.internalCostGbp) : "—"} />
                <Readout label="Margin" value={result ? `${result.marginPercent}%` : "—"} color={marginColor} />
                <Readout label="Markup" value={result ? `${result.markupPercent}%` : "—"} />
                <Readout label="Build £/day" value={result ? gbp(result.buildDayRateGbp) : "—"} />
              </div>
              {result ? (
                <p className="mt-3 text-[12px] text-[var(--text-4)]">
                  Build {gbp(result.breakdown.buildCostGbp)} · UK review {gbp(result.breakdown.ukReviewCostGbp)} · contingency{" "}
                  {gbp(result.breakdown.contingencyGbp)}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
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
    <label className="flex flex-col gap-1">
      <span className="widget-data-label">{label}</span>
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
    </label>
  );
}

function Readout({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="widget-data-label">{label}</div>
      <div className="widget-stat-sm mt-0.5" style={color ? { color } : undefined}>
        {value}
      </div>
    </div>
  );
}
