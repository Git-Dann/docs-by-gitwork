"use client";

/**
 * Spend against budget, month by month (CLAUDE.md §150). Plain SVG on tokens, so it reads in
 * light and dark. Three marks: what's been spent (brand, solid), where spend would be if the
 * budget ran evenly over the dates (grey, dashed), and the budget itself (a hairline at the top).
 * The same figures are listed underneath for anyone who can't see the chart.
 */

import { formatMoney, monthLabel } from "@/lib/money";
import type { BurnPoint } from "@/lib/project-budget";

const W = 560;
const H = 180;
const PAD = { top: 16, right: 12, bottom: 26, left: 12 };

export function BurnChart({ points, budget, currency }: { points: BurnPoint[]; budget: number | null; currency: string }) {
  if (points.length === 0) return null;
  const spentMax = Math.max(0, ...points.map((p) => p.spent ?? 0));
  const top = Math.max(budget ?? 0, spentMax, ...points.map((p) => p.planned ?? 0), 1);
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length === 1 ? iw / 2 : (iw * i) / (points.length - 1));
  const y = (v: number) => PAD.top + ih - (ih * v) / top;

  const spent = points.map((p, i) => ({ i, v: p.spent })).filter((p): p is { i: number; v: number } => p.v != null);
  const planned = points.map((p, i) => ({ i, v: p.planned })).filter((p): p is { i: number; v: number } => p.v != null);
  const path = (pts: Array<{ i: number; v: number }>) => pts.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const step = points.length > 8 ? Math.ceil(points.length / 6) : 1;
  const over = budget != null && spentMax > budget;
  const lastSpent = spent[spent.length - 1];

  return (
    <figure className="relative m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Spend against budget by month">
        {budget != null ? (
          <g>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(budget)} y2={y(budget)} stroke="var(--border-2)" strokeWidth={1} />
            <text x={W - PAD.right} y={y(budget) - 4} textAnchor="end" fontSize={10} fill="var(--text-4)" style={{ fontFamily: "var(--font-mono)" }}>
              BUDGET {formatMoney(budget, currency, { compact: true })}
            </text>
          </g>
        ) : null}
        <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + ih} y2={PAD.top + ih} stroke="var(--border-1)" strokeWidth={1} />
        {planned.length > 1 ? (
          <path d={path(planned)} fill="none" stroke="var(--text-4)" strokeWidth={1.5} strokeDasharray="4 4" />
        ) : null}
        {spent.length > 1 ? (
          <path d={path(spent)} fill="none" stroke={over ? "var(--danger-500)" : "var(--brand-500)"} strokeWidth={2.25} strokeLinejoin="round" />
        ) : null}
        {lastSpent ? <circle cx={x(lastSpent.i)} cy={y(lastSpent.v)} r={3.5} fill={over ? "var(--danger-500)" : "var(--brand-500)"} /> : null}
        {points.map((p, i) =>
          i % step === 0 || i === points.length - 1 ? (
            <text
              key={p.month}
              x={x(i)}
              y={H - 8}
              textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
              fontSize={10}
              fill="var(--text-4)"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {monthLabel(p.month).toUpperCase()}
            </text>
          ) : null,
        )}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--text-3)]">
        <span className="inline-flex items-center gap-1.5">
          <span className={over ? "h-0.5 w-4 bg-[var(--danger-500)]" : "h-0.5 w-4 bg-[var(--brand-500)]"} aria-hidden />
          Spent
        </span>
        {planned.length > 1 ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0 w-4 border-t border-dashed border-[var(--text-4)]" aria-hidden />
            Even pace to the end date
          </span>
        ) : null}
      </figcaption>
      <table className="sr-only">
        <caption>Spend by month</caption>
        <tbody>
          {points.map((p) => (
            <tr key={p.month}>
              <th scope="row">{monthLabel(p.month, "long")}</th>
              <td>{p.spent == null ? "Still to come" : formatMoney(p.spent, currency)}</td>
              <td>{p.planned == null ? "" : `Even pace ${formatMoney(p.planned, currency)}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
