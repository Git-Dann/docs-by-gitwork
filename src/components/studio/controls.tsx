"use client";

// Shared control widgets for the visual Studio modes (Screenshots + App Icons): a range Slider, a
// hex ColorField, and the BackgroundEditor (preset swatches + solid/linear/radial fill editor).
// Kept mode-agnostic so both workspaces reuse them without duplication.

import type { CSSProperties } from "react";
import { Field, Segmented } from "./studio-ui";
import { BACKGROUND_PRESETS, fillBase, type BackgroundTheme, type Fill } from "./screenshots/config";

export function Slider({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      {label ? (
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-3)]">{label}</span>
          <span className="font-mono text-[10px] tabular-nums text-[var(--text-4)]">
            {Number.isInteger(value) ? value : value.toFixed(2)}
            {suffix ?? ""}
          </span>
        </div>
      ) : null}
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="studio-range" />
    </div>
  );
}

export function ColorField({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) ? value : "#000000";
  return (
    <div className="flex items-center gap-2">
      <input type="color" value={hex} onChange={(e) => onChange(e.target.value)} className="h-8 w-9 shrink-0 cursor-pointer rounded-[6px] border border-[var(--border-1)] bg-transparent p-0.5" />
      <input className="app-input w-full font-mono text-[12px]" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function gradientStops(fill: Fill): { color: string; at: number }[] {
  if (fill.kind === "solid") return [{ color: fill.color, at: 0 }, { color: "#0A1533", at: 100 }];
  return fill.stops.length >= 2 ? fill.stops : [{ color: fillBase(fill), at: 0 }, { color: "#0A1533", at: 100 }];
}
function resolveSwatch(fill: Fill): CSSProperties {
  if (fill.kind === "solid") return { backgroundColor: fill.color };
  const stops = fill.stops.map((s) => `${s.color} ${s.at}%`).join(", ");
  return fill.kind === "linear" ? { backgroundImage: `linear-gradient(${fill.angle}deg, ${stops})` } : { backgroundImage: `radial-gradient(circle, ${stops})` };
}

export function BackgroundEditor({
  theme,
  onChange,
  presets = true,
  swatches,
}: {
  theme: BackgroundTheme;
  onChange: (t: BackgroundTheme) => void;
  presets?: boolean;
  // When provided (e.g. a client's brand palette), these replace the built-in preset swatches.
  swatches?: { label: string; fill: Fill }[];
}) {
  const fill = theme.fill;
  const setFill = (f: Fill) => onChange({ fill: f });
  const setStop = (i: number, color: string) => {
    if (fill.kind === "solid") return;
    setFill({ ...fill, stops: fill.stops.map((s, j) => (j === i ? { ...s, color } : s)) });
  };
  const shownSwatches = swatches ?? (presets ? BACKGROUND_PRESETS.map((p) => ({ label: p.label, fill: p.theme.fill })) : []);
  return (
    <div className="space-y-3">
      {shownSwatches.length ? (
        <div className="flex flex-wrap gap-2">
          {shownSwatches.map((p, i) => (
            <button key={`${p.label}-${i}`} type="button" title={p.label} onClick={() => onChange({ fill: p.fill })} className="h-8 w-8 rounded-[8px] border border-[var(--border-1)] transition hover:border-[var(--text-4)]" style={resolveSwatch(p.fill)} />
          ))}
        </div>
      ) : null}
      <Segmented
        full
        value={fill.kind}
        options={[{ value: "solid", label: "Solid" }, { value: "linear", label: "Linear" }, { value: "radial", label: "Radial" }]}
        onChange={(k) => {
          if (k === "solid") setFill({ kind: "solid", color: fillBase(fill) });
          else if (k === "linear") setFill({ kind: "linear", angle: 155, stops: gradientStops(fill) });
          else setFill({ kind: "radial", shape: "circle", stops: gradientStops(fill) });
        }}
      />
      {fill.kind === "solid" ? (
        <ColorField value={fill.color} onChange={(c) => setFill({ kind: "solid", color: c })} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From">
              <ColorField value={fill.stops[0].color} onChange={(c) => setStop(0, c)} />
            </Field>
            <Field label="To">
              <ColorField value={fill.stops[1]?.color ?? "#000000"} onChange={(c) => setStop(1, c)} />
            </Field>
          </div>
          {fill.kind === "linear" ? (
            <Slider label="Angle" value={fill.angle} min={0} max={360} step={5} suffix="°" onChange={(v) => setFill({ ...fill, angle: v })} />
          ) : (
            <Segmented full value={fill.shape} options={[{ value: "circle", label: "Circle" }, { value: "ellipse", label: "Ellipse" }]} onChange={(shape) => setFill({ ...fill, shape })} />
          )}
        </>
      )}
    </div>
  );
}
