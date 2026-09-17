"use client";

/**
 * The four renderers. Presentation only — every one takes a slice of the board DTO and
 * nothing else: no `mode`, no `slug`, no hooks.
 *
 * That is deliberate and it is the §42.4 rule: one rendering path for the team and the
 * client, so the two can never be shown different figures for the same board.
 *
 * ## Every figure is followed by the same facts in text
 *
 * An SVG scaled into a 350px column is decoration, not information — and a screen reader
 * gets nothing from it at all. So each chart renders a readable list underneath carrying
 * the same numbers. On a phone that list IS the chart; on a desktop it is the caption.
 */

import { Donut, MONO } from "@/components/analytics/analytics-widgets";
import { layoutColumns, type BarPoint } from "@/lib/insights/bar-layout";
import { layoutRadial, MAX_BRANCHES_RADIAL } from "@/lib/insights/radial-layout";
import {
  regionLabel,
  regionsFor,
  vennGeometry,
} from "@/lib/insights/venn-geometry";
import { insightColor } from "@/lib/insights/palette";
import type {
  InsightBranch,
  InsightSeriesPoint,
  InsightVennItem,
  InsightVennSet,
} from "@/server/wiki-insights";

/** Numbers are shown as authored — no rounding, no thousands magic that would make a
 *  figure disagree with the caption beside it. */
function fmt(value: number, unit: string | null): string {
  const n = Number.isInteger(value) ? String(value) : String(value);
  if (!unit) return n;
  // A currency-ish unit reads as a prefix; everything else as a suffix.
  return /^[£$€¥]/.test(unit) ? `${unit}${n}` : `${n}${unit}`;
}

const figureFrame =
  // .widget-card is overflow:hidden, so any figure wider than the card would be
  // UNREACHABLE rather than merely off-screen (CLAUDE.md §45.2).
  "overflow-x-auto";

/**
 * ⚠️ A figure is capped at its OWN design size and never stretched to the card.
 *
 * Every chart here is `w-full` with an `aspect-ratio`, which means its height grows with
 * whatever width it is given — with no cap. Measured in a 1591px card at 1920px wide:
 * the node map rendered **1549 x 1270px** and the venn **1549 x 996px**, both taller than
 * the viewport. Two things follow from that, and the second is the one that matters:
 *
 *   1. The chart is simply too big to read — a three-circle venn does not become clearer
 *      at 1549px, it becomes a wall.
 *   2. It pushes the region/data list underneath it BELOW THE FOLD. That list is where
 *      the item names live, so a reader sees bare numbers with nothing explaining them.
 *      "Where does the 1 come from?" is the exact question it produces, and the figure
 *      cannot answer it on its own by design — the names were deliberately put in the
 *      list rather than inside the circles (§48.3).
 *
 * The viewBox IS the design size, so that is the cap. Wider cards get whitespace, not a
 * bigger drawing; narrower ones still scale down, and `min-w` still drives the scroller.
 */
function figureScale(width: number) {
  return { maxWidth: `${width}px` } as const;
}

function DataList({
  rows,
}: {
  rows: { id: string; label: string; value?: string; color?: string; note?: string | null }[];
}) {
  if (rows.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1">
      {rows.map((row) => (
        <li key={row.id} className="flex items-start gap-2 text-[13px]">
          {row.color ? (
            <span
              aria-hidden
              className="mt-[5px] h-2 w-2 shrink-0 rounded-[2px]"
              style={{ background: row.color }}
            />
          ) : null}
          <span className="min-w-0 flex-1 text-[var(--text-2)]">
            {row.label}
            {row.note ? (
              <span className="block text-[12px] text-[var(--text-4)]">{row.note}</span>
            ) : null}
          </span>
          {row.value ? (
            <span
              className="shrink-0 font-semibold text-[var(--text-1)]"
              style={{ fontFamily: MONO }}
            >
              {row.value}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function InsightBarChart({
  points,
  unit,
}: {
  points: InsightSeriesPoint[];
  unit: string | null;
}) {
  const bars: BarPoint[] = points.map((p, i) => ({
    id: p.id,
    label: p.label,
    value: p.value,
    color: insightColor(p.color, i),
  }));
  const layout = layoutColumns(bars);

  return (
    <div>
      <div className={figureFrame}>
        <svg
          viewBox={layout.viewBox}
          role="img"
          aria-label={`Bar chart: ${points.map((p) => `${p.label} ${fmt(p.value, unit)}`).join(", ")}`}
          preserveAspectRatio="xMidYMid meet"
          className="block w-full min-w-[480px]"
          style={{ aspectRatio: `${layout.width} / ${layout.height}`, ...figureScale(layout.width) }}
        >
          <line
            x1={0}
            x2={layout.width}
            y1={layout.baselineY}
            y2={layout.baselineY}
            stroke="var(--border-1)"
            strokeWidth={1}
          />
          {layout.bars.map((bar, i) => (
            <g key={bar.id}>
              <rect
                x={bar.x}
                y={bar.y}
                width={bar.width}
                height={Math.max(bar.height, bar.value === 0 ? 0 : 1)}
                rx={3}
                fill={bar.color}
              />
              <text
                x={bar.valueX}
                y={bar.valueY}
                textAnchor="middle"
                style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600 }}
                fill="var(--text-2)"
              >
                {fmt(bar.value, unit)}
              </text>
              <text
                x={bar.labelX}
                // Staggering rather than rotating: rotated labels are unreadable on a
                // phone and make the figure's height unbounded.
                y={layout.baselineY + 18 + (layout.labelMode === "stagger" ? (i % 2) * 14 : 0)}
                textAnchor="middle"
                style={{ fontSize: 11 }}
                fill="var(--text-3)"
              >
                {bar.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <DataList
        rows={points.map((p, i) => ({
          id: p.id,
          label: p.label,
          value: fmt(p.value, unit),
          color: insightColor(p.color, i),
          note: p.note,
        }))}
      />
    </div>
  );
}

export function InsightPieChart({
  points,
  unit,
}: {
  points: InsightSeriesPoint[];
  unit: string | null;
}) {
  // `Donut` is reused verbatim — it already draws the ring, the centre figure and a
  // legend with swatches. The only guard it needs is at the call site: with no segments
  // it renders an empty ring and a centre 0, which reads as a real answer.
  if (points.length === 0) return null;
  return (
    <Donut
      segments={points.map((p, i) => ({
        label: p.label,
        value: p.value,
        color: insightColor(p.color, i),
      }))}
      centerLabel={unit ?? "total"}
      size={150}
    />
  );
}

export function InsightVennChart({
  sets,
  items,
}: {
  sets: InsightVennSet[];
  items: InsightVennItem[];
}) {
  const setCount = sets.length >= 3 ? 3 : 2;
  const geo = vennGeometry(setCount);
  const labels = Object.fromEntries(sets.map((s) => [s.key, s.label]));
  const byRegion = new Map<string, InsightVennItem[]>();
  for (const item of items) {
    const list = byRegion.get(item.region) ?? [];
    list.push(item);
    byRegion.set(item.region, list);
  }
  const anyItems = items.length > 0;

  return (
    <div>
      <div className={figureFrame}>
        <svg
          viewBox={geo.viewBox}
          role="img"
          aria-label={`Venn diagram of ${sets.map((s) => s.label).join(", ")}`}
          preserveAspectRatio="xMidYMid meet"
          className="block w-full min-w-[420px]"
          style={{ aspectRatio: `${geo.width} / ${geo.height}`, ...figureScale(geo.width) }}
        >
          {geo.circles.map((circle, i) => {
            const hex = insightColor(sets[i]?.color, i);
            return (
              <circle
                key={circle.key}
                cx={circle.cx}
                cy={circle.cy}
                r={circle.r}
                // Stacked ALPHA over the surface, never `mixBlendMode: multiply` — multiply
                // collapses to black on the navy ground, so the overlaps would vanish in
                // dark mode. Alpha over a token self-adapts: 0.16 → 0.29 → 0.40 reads as
                // progressively deeper in both themes.
                fill={hex}
                fillOpacity={0.16}
                stroke={hex}
                strokeWidth={1.5}
              />
            );
          })}
          {geo.circles.map((circle, i) => (
            <text
              key={`l-${circle.key}`}
              x={circle.labelX}
              y={circle.labelY}
              textAnchor={circle.labelAnchor}
              style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600 }}
              fill="var(--text-2)"
            >
              {sets[i]?.label ?? circle.key}
            </text>
          ))}
          {geo.regions.map((region) => {
            const anchor = geo.anchors[region];
            const count = byRegion.get(region)?.length ?? 0;
            // An empty region shows a muted 0 when the board has items ANYWHERE, and
            // nothing at all when the whole board is empty. "We looked and it is empty"
            // and "there is nothing here to look at" are different facts.
            if (count === 0 && !anyItems) return null;
            return (
              <text
                key={`c-${region}`}
                x={anchor.x}
                y={anchor.y}
                textAnchor="middle"
                style={{ fontSize: 20, fontWeight: 600 }}
                fill={count === 0 ? "var(--text-4)" : "var(--text-1)"}
              >
                {count}
              </text>
            );
          })}
        </svg>
      </div>
      {/* The numbers in the circles are COUNTS, which is not self-evident — a reader
          seeing "1" has no way to know it means one item unless something says so. The
          names themselves live in the list below, not in the circles (that is what
          actually gets read, and what works at 350px). */}
      {anyItems && (
        <p
          className="mt-2 text-[10px] uppercase tracking-[0.08em] text-[var(--text-4)]"
          style={{ fontFamily: MONO }}
        >
          Numbers are how many items sit in each region · named below
        </p>
      )}
      <div className="mt-3 space-y-2">
        {regionsFor(setCount).map((region) => {
          const list = byRegion.get(region) ?? [];
          return (
            <div key={region}>
              <p
                className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-4)]"
                style={{ fontFamily: MONO }}
              >
                {regionLabel(region, labels)}
              </p>
              {list.length === 0 ? (
                // An em-dash rather than omitting the row: a region that is empty is a
                // finding, and hiding it hides that finding.
                <p className="text-[13px] text-[var(--text-4)]">—</p>
              ) : (
                <p className="text-[13px] text-[var(--text-2)]">
                  {list.map((i) => i.label).join(" · ")}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function InsightNodeMap({
  core,
  branches,
}: {
  core: string;
  branches: InsightBranch[];
}) {
  const layout = layoutRadial({
    core,
    branches: branches.map((b, i) => ({
      id: b.id,
      label: b.label,
      color: insightColor(b.color, i),
      leaves: b.leaves.map((l) => ({ id: l.id, label: l.label })),
    })),
  });

  const list = (
    <div className="space-y-2.5">
      {branches.map((branch, i) => (
        <div key={branch.id} className="flex items-start gap-2">
          <span
            aria-hidden
            className="mt-[6px] h-2 w-2 shrink-0 rounded-full"
            style={{ background: insightColor(branch.color, i) }}
          />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-[var(--text-1)]">
              {branch.link ? (
                <a
                  href={branch.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--brand-700)] hover:underline"
                >
                  {branch.label}
                </a>
              ) : (
                branch.label
              )}
            </p>
            {branch.note ? (
              <p className="text-[12px] text-[var(--text-4)]">{branch.note}</p>
            ) : null}
            {branch.leaves.length > 0 && (
              <p className="text-[13px] text-[var(--text-3)]">
                {branch.leaves.map((l) => l.label).join(" · ")}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  // Past the cap the list is not a fallback, it is the better artefact — a twenty-spoke
  // radial is a bad diagram and no amount of machinery makes it a good one.
  if (layout.overflow || branches.length === 0) {
    return (
      <div>
        <p className="mb-2 text-[13px] font-semibold text-[var(--text-1)]">{core}</p>
        {branches.length === 0 ? (
          <p className="text-[13px] text-[var(--text-4)]">No connected entities yet.</p>
        ) : (
          list
        )}
      </div>
    );
  }

  return (
    <div>
      <div className={figureFrame}>
        <svg
          viewBox={layout.viewBox}
          role="img"
          aria-label={`${core}, connected to ${branches.map((b) => b.label).join(", ")}`}
          preserveAspectRatio="xMidYMid meet"
          className="block w-full min-w-[420px]"
          style={{ aspectRatio: `${layout.width} / ${layout.height}`, ...figureScale(layout.width) }}
        >
          {layout.edges.map((edge) => (
            <line
              key={edge.id}
              x1={edge.x1}
              y1={edge.y1}
              x2={edge.x2}
              y2={edge.y2}
              stroke={edge.color}
              strokeOpacity={0.35}
              strokeWidth={1.25}
            />
          ))}
          {layout.nodes.map((node) => (
            <g key={node.id}>
              <title>{node.title}</title>
              <circle
                cx={node.x}
                cy={node.y}
                r={node.r}
                fill={node.kind === "core" ? "var(--surface-2)" : node.color}
                fillOpacity={node.kind === "leaf" ? 1 : node.kind === "core" ? 1 : 0.18}
                stroke={node.kind === "core" ? "var(--border-1)" : node.color}
                strokeWidth={node.kind === "core" ? 1.5 : 1.5}
              />
              {node.kind === "core" ? (
                // The core's label sits INSIDE its circle; everything else reads outward.
                node.lines.map((line, li) => (
                  <text
                    key={li}
                    x={node.x}
                    y={node.y + (li - (node.lines.length - 1) / 2) * 15 + 4}
                    textAnchor="middle"
                    style={{ fontSize: 13, fontWeight: 600 }}
                    fill="var(--text-1)"
                  >
                    {line}
                  </text>
                ))
              ) : (
                node.lines.map((line, li) => (
                  <text
                    key={li}
                    x={node.labelX}
                    y={node.labelY + li * (node.kind === "branch" ? 14 : 13)}
                    textAnchor={node.anchor}
                    style={{
                      fontSize: node.kind === "branch" ? 12 : 11,
                      fontWeight: node.kind === "branch" ? 600 : 400,
                    }}
                    fill={node.kind === "branch" ? "var(--text-1)" : "var(--text-3)"}
                  >
                    {line}
                  </text>
                ))
              )}
            </g>
          ))}
        </svg>
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-[12px] font-medium text-[var(--text-3)] transition hover:text-[var(--text-1)]">
          Read as a list
        </summary>
        <div className="mt-2">{list}</div>
      </details>
      {branches.length === MAX_BRANCHES_RADIAL && (
        <p className="mt-2 text-[11px] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
          {MAX_BRANCHES_RADIAL} connections — the most a radial diagram reads clearly.
        </p>
      )}
    </div>
  );
}
