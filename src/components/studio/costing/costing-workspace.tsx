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

  useEffect(() => {
    setForm(seedForm(pkg));
  }, [pkg]);

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
    <div className="h-full min-h-0 overflow-y-auto pb-2">
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

      <div className="mt-3 grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
        {/* Inputs */}
        <div className="widget-card">
          <div className="widget-header">
            <span className="widget-header-label">01 // {meta.name.toUpperCase()}</span>
            <span className="widget-header-right widget-data-label">{meta.typical.toUpperCase()}</span>
          </div>
          <div className="flex flex-col gap-4 p-4">
            {pkg === "greenfield" ? (
              <>
                <Num label="Squad size" unit="developers" value={form.devs} onChange={(v) => setField({ devs: v })} hint="How many embedded developers on the squad." />
                <Num label="Engagement length" unit="months" value={form.months} onChange={(v) => setField({ months: v })} hint="How long the squad runs. Price = rate × devs × months." />
                <Num
                  label="Price per developer / month"
                  unit="£"
                  value={form.pricePerDevMonthGbp}
                  onChange={(v) => setField({ pricePerDevMonthGbp: v })}
                  hint={`Client rate per developer — from ${gbp(meta.fromGbp)}. Sets the client price.`}
                />
              </>
            ) : pkg === "care_plan" ? (
              <>
                <Num label="Plan length" unit="months" value={form.months} onChange={(v) => setField({ months: v })} hint="How many months the Care Plan runs. Price = fee × months." />
                <Num
                  label="Monthly fee"
                  unit="£"
                  value={form.pricePerMonthGbp}
                  onChange={(v) => setField({ pricePerMonthGbp: v })}
                  hint={`Client's monthly retainer — from ${gbp(meta.fromGbp)}. Sets the client price.`}
                />
                <Num
                  label="Support effort per month"
                  unit="eng-days"
                  value={form.effortDaysPerMonth}
                  onChange={(v) => setField({ effortDaysPerMonth: v })}
                  hint="Engineer-days you expect to spend each month. Drives the internal cost only — not the price."
                />
              </>
            ) : (
              <>
                <Num
                  label="Target price"
                  unit="£"
                  value={form.targetPriceGbp}
                  onChange={(v) => setField({ targetPriceGbp: v })}
                  hint={`The fixed price you'll quote — from ${gbp(meta.fromGbp)}. Sets the client price.`}
                />
                <Num label="Build effort" unit="weeks" value={form.weeks} onChange={(v) => setField({ weeks: v })} hint="Calendar weeks of build work. Drives the internal cost only — not the price." />
                <Num label="Team size" unit="developers" value={form.devs} onChange={(v) => setField({ devs: v })} hint="Developers on the build. Drives the internal cost only." />
              </>
            )}
          </div>

          {/* Advanced */}
          <details
            className="border-t border-[var(--border-3)] px-4 py-3"
            open={advancedOpen}
            onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}
          >
            <summary className="widget-data-label cursor-pointer select-none">Advanced — internal cost basis</summary>
            <p className="mt-2 text-[12px] leading-snug text-[var(--text-4)]">
              These tune how the internal cost is estimated. They don&apos;t change the client price — edit any value.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                <span className="text-[12px] leading-snug text-[var(--text-4)]">Which Rate Card band to blend for the build cost.</span>
              </label>
              <Num label="FX rate" unit="USD→GBP" value={config.fxFromUsd} step={0.01} onChange={(v) => setCfg({ fxFromUsd: v ?? ADVANCED_DEFAULTS.fxFromUsd })} hint="Converts the USD Rate Card to GBP. Live rate prefilled." />
              <Num label="UK review overhead" unit="%" value={config.ukReviewOverheadPercent} onChange={(v) => setCfg({ ukReviewOverheadPercent: v ?? 0 })} hint="UK senior review / QA / deploy, as a % of build cost." />
              <Num label="Contingency" unit="%" value={config.contingencyPercent} onChange={(v) => setCfg({ contingencyPercent: v ?? 0 })} hint="Delivery buffer on top of build + review." />
              <Num
                label="Build day-rate override"
                unit="£/day"
                value={config.dayRateOverrideGbp}
                placeholder="from Rate Card"
                onChange={(v) => setCfg({ dayRateOverrideGbp: v })}
                hint="Force a custom build cost day rate. Leave blank to blend it from the Rate Card."
              />
            </div>
          </details>
        </div>

        {/* Quote */}
        <div className="widget-card">
          <div className="widget-header">
            <span className="widget-header-label">02 // QUOTE</span>
            <span className="widget-header-right widget-data-label">{preview.isPending ? "CALCULATING…" : "CLIENT PRICE"}</span>
          </div>
          <div className="flex flex-col p-4">
            <div className="widget-stat leading-none">{result ? gbp(result.clientPriceGbp) : "—"}</div>
            <div className="widget-data-label mt-1.5">{result?.priceBasisLabel ?? " "}</div>

            <div className="mt-4 flex flex-col rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-4">
              <div className="widget-data-label" style={{ color: "var(--danger-500)" }}>
                INTERNAL · SUPER ADMIN
              </div>
              <div className="mt-3 grid grid-cols-2 gap-4">
                <Readout label="Internal cost" value={result ? gbp(result.internalCostGbp) : "—"} />
                <Readout label="Margin" value={result ? `${result.marginPercent}%` : "—"} color={marginColor} />
                <Readout label="Markup" value={result ? `${result.markupPercent}%` : "—"} />
                <Readout label="Build cost / day" value={result ? gbp(result.buildDayRateGbp) : "—"} />
              </div>
              <div className="mt-4">
                <div className="widget-data-label">Cost breakdown</div>
                <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-3)]">
                  {result
                    ? `Build ${gbp(result.breakdown.buildCostGbp)} · UK review ${gbp(result.breakdown.ukReviewCostGbp)} · contingency ${gbp(result.breakdown.contingencyGbp)}`
                    : "Enter the inputs to see the internal breakdown."}
                </p>
                {result ? (
                  <p className="mt-1 text-[12px] leading-snug text-[var(--text-4)]">
                    {result.usedRateCard
                      ? "Build cost blended from the workspace Rate Card."
                      : cfg.data && !cfg.data.hasRateCard
                        ? "No Rate Card people yet — using the fallback build rate."
                        : "Using the build day-rate override."}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Num({
  label,
  unit,
  value,
  onChange,
  step,
  placeholder,
  hint,
}: {
  label: string;
  unit?: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  step?: number;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="widget-data-label">
        {label}
        {unit ? <span className="text-[var(--text-4)]"> · {unit}</span> : null}
      </span>
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
      {hint ? <span className="text-[12px] leading-snug text-[var(--text-4)]">{hint}</span> : null}
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
