"use client";

/**
 * Running costs — what the app costs to operate, and what that is per end user.
 *
 * ⚠️ This is NOT Docs costing. Docs prices what Gitwork charges to build something;
 * this prices what the finished thing costs the client to run every month. A client
 * looking at subscription pricing needs the second number and Foundry never held it.
 *
 * Every figure is derived at render from the stored lines by `src/lib/wiki-costs.ts` —
 * nothing here decides a number, and nothing is stored pre-totalled, so a line edited
 * in the editor can never leave the banner stating a total that no longer adds up.
 *
 * The blind-spot strip renders ABOVE the lines, not under them, for the same reason the
 * Countermark certificate does it (§38): a reader must never have to infer from the
 * absence of a caveat that a total is complete.
 */

import { useMemo, useState } from "react";
import { MONO, SERIF, StatTile } from "@/components/analytics/analytics-widgets";
import type { CostItem, CostModel } from "@/types/wiki-costs";
import { buildCostReadout, formatCostMoney as money, SCALE_BANDS } from "@/lib/wiki-costs";
import { WikiCostsEditor } from "./wiki-costs-editor";

const KIND_LABEL: Record<CostItem["kind"], string> = {
  FLAT: "Fixed",
  PER_USER: "Per user",
  METERED: "Usage",
  STEPPED: "Plan band",
};

function users(n: number): string {
  return n.toLocaleString("en-GB");
}

export function WikiCostsSection({
  slug,
  model,
  mode,
}: {
  slug: string;
  model: CostModel;
  mode: "internal" | "public";
}) {
  const [editing, setEditing] = useState(false);
  const readout = useMemo(
    () => buildCostReadout(model.items, model.headlineUsers),
    [model.items, model.headlineUsers],
  );
  const { headline, lines, scale, blindSpots } = readout;
  /**
   * "from" on EVERY banner figure or none — see the note at the grid below.
   *
   * It renders as a small mono word rather than as part of the serif figure: at 34px a
   * serif "from" doubled the width of the longest tile and wrapped it onto two lines,
   * which is how a four-across row of totals stopped being scannable.
   */
  const prefix = headline.incomplete ? (
    <span
      className="mr-1 align-[0.28em] text-[12px] tracking-[0.08em] text-[var(--text-4)] uppercase"
      style={{ fontFamily: MONO }}
    >
      from
    </span>
  ) : null;
  const cur = model.currency;

  if (model.items.length === 0) {
    return (
      <div className="space-y-4">
        <section className="widget-card">
          <div className="widget-header">
            <span className="widget-header__label" style={{ fontFamily: MONO }}>
              <span className="widget-header__label--number">01</span>
              {" // RUNNING COSTS"}
            </span>
            {mode === "internal" && (
              <button type="button" className="app-button app-button-secondary app-button-xs" onClick={() => setEditing(true)}>
                Add costs
              </button>
            )}
          </div>
          <p className="p-8 text-center text-sm text-[var(--text-4)]">
            {/* Never "£0.00 per user" — a cost model with no lines states nothing. */}
            {mode === "internal"
              ? "No running costs recorded yet. Add the services this app pays for and the cost per user is worked out for you."
              : "Running costs haven’t been published yet."}
          </p>
        </section>
        {mode === "internal" && editing && (
          <WikiCostsEditor slug={slug} model={model} onClose={() => setEditing(false)} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── 01 the banner: the one number the page exists for ───────────────── */}
      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label" style={{ fontFamily: MONO }}>
            <span className="widget-header__label--number">01</span>
            {" // COST PER USER"}
          </span>
          <span className="widget-header__status" style={{ fontFamily: MONO }}>
            {mode === "internal" ? (
              <button type="button" className="app-button app-button-secondary app-button-xs" onClick={() => setEditing(true)}>
                Edit model
              </button>
            ) : (
              `AT ${users(model.headlineUsers)} USERS`
            )}
          </span>
        </div>
        <div className="p-5 sm:p-6">
          {/* ⚠️ `from` goes on EVERY figure or none. The first cut put it on three of
              the four, which made the one without it — cost per user per year — read as
              the certain number when it is derived from exactly the same incomplete
              total. One flag, applied uniformly. */}
          {/* ⚠️ `xl`, not `lg`. The breakpoint asks about the VIEWPORT; the constraint
              is the wiki's content COLUMN, which is only 645px at a 1024 laptop — four
              34px serif currency figures need ~200px each, so at `lg` the longest total
              rendered 201px of text in a 149px cell and spilled over its neighbour.
              Measured at 768 · 1024 · 1280 · 1440. */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:items-end">
            <div>
              <p
                className="text-[11px] tracking-[0.12em] text-[var(--text-4)] uppercase"
                style={{ fontFamily: MONO }}
              >
                Per user / month
              </p>
              <p
                className="mt-1 text-[36px] leading-none text-[var(--text-1)]"
                style={{ fontFamily: SERIF }}
              >
                {prefix}
                {money(headline.perUserMonthly, cur, true)}
              </p>
              <p className="mt-1 text-[12px] text-[var(--text-4)]">
                at {users(model.headlineUsers)} users
              </p>
            </div>
            <StatTile
              label="Total / month"
              figure={
                <>
                  {prefix}
                  {money(headline.totalMonthly, cur)}
                </>
              }
            />
            <StatTile
              label="Total / year"
              figure={
                <>
                  {prefix}
                  {money(headline.totalAnnual, cur)}
                </>
              }
              sub={
                readout.annualSaving > 0 ? (
                  <span className="text-[11px] text-[var(--success-500)]" style={{ fontFamily: MONO }}>
                    {money(readout.annualSaving, cur)} SAVED ANNUALLY
                  </span>
                ) : undefined
              }
            />
            <StatTile
              label="Per user / year"
              figure={
                <>
                  {prefix}
                  {money(headline.perUserAnnual, cur, true)}
                </>
              }
            />
          </div>

          {/* ⚠️ Rendered ABOVE the lines and never suppressed. "from" on the figures
              above is meaningless without the sentence that says why. */}
          {blindSpots.length > 0 && (
            <div className="mt-5 space-y-2 border-t border-[var(--border-1)] pt-4">
              <p
                className="text-[11px] tracking-[0.12em] text-[var(--warning-500)] uppercase"
                style={{ fontFamily: MONO }}
              >
                What this does not cover
              </p>
              {blindSpots.map((spot) => (
                <p key={spot.kind} className="text-[13px] leading-relaxed text-[var(--text-3)]">
                  {spot.message}
                  {spot.items.length > 0 && (
                    <span className="text-[var(--text-4)]"> ({spot.items.join(", ")})</span>
                  )}
                </p>
              ))}
            </div>
          )}

          {model.notes && (
            <p className="mt-4 border-t border-[var(--border-1)] pt-4 text-[13px] leading-relaxed text-[var(--text-3)]">
              {model.notes}
            </p>
          )}
        </div>
      </section>

      {/* ── 02 the lines ────────────────────────────────────────────────────── */}
      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label" style={{ fontFamily: MONO }}>
            <span className="widget-header__label--number">02</span>
            {" // WHAT MAKES IT UP"}
          </span>
          <span className="widget-header__status" style={{ fontFamily: MONO }}>
            {lines.length} {lines.length === 1 ? "LINE" : "LINES"}
          </span>
        </div>
        {/* §45.2 — .widget-card is overflow:hidden, so a wide child is UNREACHABLE, not
            off-screen. Header and rows share ONE scroller or they desync when scrolled.
            ⚠️ The money columns are fixed-width AND `whitespace-nowrap`. Fixed, because
            every row is its own grid, so `max-content` would size each row differently
            and the columns would stop lining up. Nowrap, because a total that outgrows
            its column must push the scroller rather than wrap and make one row taller
            than the rest — which is what "from £403,045.00" did in a 120px cell. */}
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <div
              className="grid grid-cols-[minmax(0,1fr)_92px_130px_130px] gap-3 border-b border-[var(--border-1)] px-4 py-2 text-[10px] tracking-[0.12em] text-[var(--text-4)] uppercase"
              style={{ fontFamily: MONO }}
            >
              <span>Service</span>
              <span>Type</span>
              <span className="text-right">Per month</span>
              <span className="text-right">Per year</span>
            </div>
            {lines.map((line) => (
              <div
                key={line.itemId}
                className="grid grid-cols-[minmax(0,1fr)_92px_130px_130px] items-start gap-3 border-b border-[var(--border-1)] px-4 py-3 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-[14px] text-[var(--text-1)]" title={line.name}>
                    {line.name}
                    {line.vendor && (
                      <span className="text-[var(--text-4)]"> · {line.vendor}</span>
                    )}
                  </p>
                  {line.detail && (
                    <p className="mt-0.5 text-[12px] text-[var(--text-4)]">{line.detail}</p>
                  )}
                </div>
                <span
                  className="text-[10px] tracking-[0.1em] text-[var(--text-4)] uppercase"
                  style={{ fontFamily: MONO }}
                >
                  {KIND_LABEL[line.kind]}
                </span>
                <span
                  className="text-right text-[14px] whitespace-nowrap text-[var(--text-1)] tabular-nums"
                  style={{ fontFamily: MONO }}
                >
                  {line.incomplete ? "from " : ""}
                  {money(line.monthly, cur)}
                </span>
                <span
                  className="text-right text-[14px] whitespace-nowrap text-[var(--text-3)] tabular-nums"
                  style={{ fontFamily: MONO }}
                >
                  {/* Same flag as the monthly cell beside it. The first cut marked only
                      the monthly figure, so a line's yearly total read as certain while
                      its monthly read as a floor — from the identical evidence. */}
                  {line.incomplete ? "from " : ""}
                  {money(line.annual, cur)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 03 the curve ────────────────────────────────────────────────────── */}
      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label" style={{ fontFamily: MONO }}>
            <span className="widget-header__label--number">03</span>
            {" // AS YOU GROW"}
          </span>
          <span className="widget-header__status" style={{ fontFamily: MONO }}>
            {users(SCALE_BANDS[0])} → {users(SCALE_BANDS[SCALE_BANDS.length - 1])} USERS
          </span>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[620px]">
            <div
              className="grid grid-cols-[110px_minmax(0,1fr)_150px_150px] gap-3 border-b border-[var(--border-1)] px-4 py-2 text-[10px] tracking-[0.12em] text-[var(--text-4)] uppercase"
              style={{ fontFamily: MONO }}
            >
              <span>Users</span>
              <span />
              <span className="text-right">Per month</span>
              <span className="text-right">Per user</span>
            </div>
            {scale.map((row) => {
              const isHeadline = row.users === model.headlineUsers;
              return (
                <div
                  key={row.users}
                  className={`grid grid-cols-[110px_minmax(0,1fr)_150px_150px] items-center gap-3 border-b border-[var(--border-1)] px-4 py-2 last:border-b-0 ${
                    isHeadline ? "bg-[var(--brand-50)]" : ""
                  }`}
                >
                  <span
                    className="text-[13px] text-[var(--text-2)] tabular-nums"
                    style={{ fontFamily: MONO }}
                  >
                    {users(row.users)}
                  </span>
                  {/* A bar, not a chart: the shape of the curve is the point, and one
                      relative bar carries it without a renderer or a library. */}
                  <span className="block h-1.5 rounded-full bg-[var(--surface-2)]">
                    <span
                      className="block h-1.5 rounded-full bg-[var(--brand-700)]"
                      style={{
                        width: `${Math.max(
                          2,
                          Math.round(
                            (row.totalMonthly /
                              Math.max(...scale.map((s) => s.totalMonthly), 1)) *
                              100,
                          ),
                        )}%`,
                      }}
                    />
                  </span>
                  <span
                    className="text-right text-[13px] whitespace-nowrap text-[var(--text-1)] tabular-nums"
                    style={{ fontFamily: MONO }}
                  >
                    {row.incomplete ? "from " : ""}
                    {money(row.totalMonthly, cur)}
                  </span>
                  <span
                    className="text-right text-[13px] whitespace-nowrap text-[var(--text-3)] tabular-nums"
                    style={{ fontFamily: MONO }}
                  >
                    {row.incomplete ? "from " : ""}
                    {money(row.perUserMonthly, cur, true)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {mode === "internal" && editing && (
        <WikiCostsEditor slug={slug} model={model} onClose={() => setEditing(false)} />
      )}
    </div>
  );
}
