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

/** One figure in the AS YOU GROW readout — house grammar: serif figure, mono caps label. */
function ScaleFigure({
  label,
  figure,
  unit,
}: {
  label: string;
  figure: string;
  unit?: string;
}) {
  return (
    <div>
      <p
        className="text-[10px] tracking-[0.12em] text-[var(--text-4)] uppercase"
        style={{ fontFamily: MONO }}
      >
        {label}
      </p>
      <p
        className="mt-1 text-[30px] leading-none break-words text-[var(--text-1)]"
        style={{ fontFamily: SERIF }}
      >
        {figure}
        {unit ? (
          <span
            className="ml-2 align-[0.35em] text-[10px] tracking-[0.12em] text-[var(--text-4)] uppercase"
            style={{ fontFamily: MONO }}
          >
            {unit}
          </span>
        ) : null}
      </p>
    </div>
  );
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
  const { headline, lines, scale, blindSpots, options } = readout;
  /**
   * "from" on EVERY banner figure or none — see the note at the grid below.
   *
   * It renders as a small mono word rather than as part of the serif figure: at 34px a
   * serif "from" doubled the width of the longest tile and wrapped it onto two lines,
   * which is how a four-across row of totals stopped being scannable.
   */
  /**
   * Zero users is a legitimate, useful state — a client before launch. The totals are
   * real there; only the per-user figures are undefined. See the banner below.
   */
  const atZero = model.headlineUsers === 0;
  const prefix = headline.incomplete ? (
    <span
      className="mr-1 align-[0.28em] text-[12px] tracking-[0.08em] text-[var(--text-4)] uppercase"
      style={{ fontFamily: MONO }}
    >
      from
    </span>
  ) : null;
  const cur = model.currency;

  /**
   * Which band the AS YOU GROW slider is on. Opens on the client's own headline count
   * so the panel agrees with the banner above it; falls back to the nearest band when
   * the headline is not itself one (a hand-typed 1,234).
   */
  const defaultBand = useMemo(() => {
    let best = 0;
    for (let i = 1; i < scale.length; i += 1) {
      const closer =
        Math.abs(scale[i].users - model.headlineUsers) <
        Math.abs(scale[best].users - model.headlineUsers);
      if (closer) best = i;
    }
    return best;
  }, [scale, model.headlineUsers]);
  const [bandIdx, setBandIdx] = useState(defaultBand);
  // `scale` is a fixed ladder, but clamp anyway so a stale index can never index undefined.
  const band = scale[Math.min(bandIdx, scale.length - 1)] ?? scale[0];
  const maxTotal = Math.max(...scale.map((r) => r.totalMonthly), 1);
  /**
   * Bar heights are LOG-scaled, and the panel says so. The bands span five orders of
   * magnitude (50 → 1,000,000 users) and cost tracks users, so on a linear scale the
   * first eight bars render as 4px slivers — the whole range a client is actually
   * choosing within reads as empty. Log makes the ramp legible; the caption keeps it
   * from being read as a linear jump, and every exact figure is one hover or one
   * disclosure away.
   */
  const barPct = (value: number) => {
    if (!(value > 0)) return 4;
    return Math.max(6, Math.round((Math.log10(1 + value) / Math.log10(1 + maxTotal)) * 100));
  };

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
            {/* The panel does not show a cost per user when there are no users, so it
                does not claim to. */}
            {atZero ? " // COST TO RUN" : " // COST PER USER"}
          </span>
          <span className="widget-header__status" style={{ fontFamily: MONO }}>
            {mode === "internal" ? (
              <button
                type="button"
                className="app-button app-button-secondary app-button-xs"
                onClick={() => setEditing(true)}
              >
                Edit model
              </button>
            ) : atZero ? (
              "NO USERS YET"
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
          {atZero ? (
            /* ⚠️ Zero users is a real, useful state, not an error — a client before
               launch still pays every fixed fee, and that floor is the number they
               actually need. So the TOTAL leads here instead of the per-user figure,
               which is genuinely undefined (nothing to divide by) and is stated in
               words rather than shown as a dash or, worse, as £0.00.

               It is deliberately NOT rendered as a negative. The cost is +£48; it is
               the MARGIN that is negative, and Foundry holds no revenue figure to
               subtract from — a minus sign here would be a P&L we cannot back. */
            <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
              <div>
                <p
                  className="text-[11px] tracking-[0.12em] text-[var(--text-4)] uppercase"
                  style={{ fontFamily: MONO }}
                >
                  Cost / month
                </p>
                <p
                  className="mt-1 text-[36px] leading-none text-[var(--text-1)]"
                  style={{ fontFamily: SERIF }}
                >
                  {prefix}
                  {money(headline.totalMonthly, cur)}
                </p>
                <p className="mt-1 text-[12px] text-[var(--text-4)]">with no users yet</p>
              </div>
              <StatTile
                label="Cost / year"
                figure={
                  <>
                    {prefix}
                    {money(headline.totalAnnual, cur)}
                  </>
                }
                sub={
                  readout.annualSaving > 0 ? (
                    <span
                      className="text-[11px] text-[var(--success-500)]"
                      style={{ fontFamily: MONO }}
                    >
                      {money(readout.annualSaving, cur)} SAVED ANNUALLY
                    </span>
                  ) : undefined
                }
              />
            </div>
          ) : (
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
                    <span
                      className="text-[11px] text-[var(--success-500)]"
                      style={{ fontFamily: MONO }}
                    >
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
          )}

          {atZero && (
            <p className="mt-4 text-[13px] leading-relaxed text-[var(--text-3)]">
              There is no cost per user yet — there is nobody to divide it by. These are
              what the app costs to run with no users on it, and they are paid whether
              anyone signs up or not. The table below shows what it becomes as users
              arrive.
            </p>
          )}

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

      {/* ── 03 the options, when there are any ───────────────────────────────
           Priced but NOT committed. A separate panel rather than a flag on a row in
           02, because the reader's question about 02 is "what am I paying" and the
           reader's question here is "which of these should we pick" — and because a
           muted row inside a table of real costs is exactly how someone comes away
           believing they are already paying for it. */}
      {options.length > 0 && (
        <section className="widget-card">
          <div className="widget-header">
            <span className="widget-header__label" style={{ fontFamily: MONO }}>
              <span className="widget-header__label--number">03</span>
              {" // OPTIONS BEING PRICED"}
            </span>
            <span className="widget-header__status" style={{ fontFamily: MONO }}>
              NOT IN THE TOTAL
            </span>
          </div>
          <div className="p-5 sm:p-6">
            <p className="text-[13px] leading-relaxed text-[var(--text-3)]">
              Costed at {users(model.headlineUsers)} users so they can be compared like
              for like, and <strong className="font-semibold">not counted</strong> in the
              figures above. Pick one and we will move it into the total.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {options.map((opt) => (
                <div
                  key={opt.line.itemId}
                  className="rounded-[8px] border border-dashed border-[var(--border-2)] p-4"
                >
                  <p className="truncate text-[14px] text-[var(--text-1)]" title={opt.line.name}>
                    {opt.line.name}
                  </p>
                  {opt.line.vendor && (
                    <p className="truncate text-[12px] text-[var(--text-4)]" title={opt.line.vendor}>
                      {opt.line.vendor}
                    </p>
                  )}
                  <p
                    className="mt-3 text-[26px] leading-none text-[var(--text-1)]"
                    style={{ fontFamily: SERIF }}
                  >
                    {opt.line.incomplete ? (
                      <span
                        className="mr-1 align-[0.3em] text-[11px] tracking-[0.08em] text-[var(--text-4)] uppercase"
                        style={{ fontFamily: MONO }}
                      >
                        from
                      </span>
                    ) : null}
                    {money(opt.line.monthly, cur)}
                  </p>
                  <p
                    className="mt-1 text-[10px] tracking-[0.1em] text-[var(--text-4)] uppercase"
                    style={{ fontFamily: MONO }}
                  >
                    per month
                  </p>
                  {/* The two numbers a choice actually turns on. */}
                  <dl className="mt-3 space-y-1 border-t border-[var(--border-1)] pt-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <dt
                        className="text-[10px] tracking-[0.1em] text-[var(--text-4)] uppercase"
                        style={{ fontFamily: MONO }}
                      >
                        Per user
                      </dt>
                      <dd
                        className="text-[13px] whitespace-nowrap text-[var(--text-2)] tabular-nums"
                        style={{ fontFamily: MONO }}
                      >
                        {money(opt.perUserMonthly, cur, true)}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <dt
                        className="text-[10px] tracking-[0.1em] text-[var(--text-4)] uppercase"
                        style={{ fontFamily: MONO }}
                      >
                        Total would be
                      </dt>
                      <dd
                        className="text-[13px] whitespace-nowrap text-[var(--text-2)] tabular-nums"
                        style={{ fontFamily: MONO }}
                      >
                        {money(opt.totalMonthlyWith, cur)}
                      </dd>
                    </div>
                  </dl>
                  {opt.line.detail && (
                    <p className="mt-2 text-[12px] text-[var(--text-4)]">{opt.line.detail}</p>
                  )}
                  {opt.notes && (
                    <p className="mt-1 text-[12px] text-[var(--text-4)]">{opt.notes}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── 04 the curve ────────────────────────────────────────────────────── */}
      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label" style={{ fontFamily: MONO }}>
            <span className="widget-header__label--number">{options.length ? "04" : "03"}</span>
            {" // AS YOU GROW"}
          </span>
          <span className="widget-header__status" style={{ fontFamily: MONO }}>
            {users(SCALE_BANDS[0])} → {users(SCALE_BANDS[SCALE_BANDS.length - 1])} USERS
          </span>
        </div>

        {/*
          This was an 11-row table behind a 620px scroller, so on a phone the per-user
          column — the number the panel exists for — sat off the edge inside
          `widget-card`, which is `overflow: hidden`. One band at a time, scrubbable,
          reads at 390px with no sideways scroll at all. The shape of the curve is not
          lost: it moves into the bars, the same relative-width idiom the table row
          used, turned upright. Every band is still readable as a figure via the
          disclosure at the foot — nothing was removed, only folded away.
        */}
        <div className="space-y-5 p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <ScaleFigure label="At" figure={users(band.users)} unit="users" />
            <ScaleFigure
              label="Per month"
              figure={`${band.incomplete ? "from " : ""}${money(band.totalMonthly, cur)}`}
            />
            <ScaleFigure
              label="Per user"
              figure={`${
                band.incomplete && band.perUserMonthly !== null ? "from " : ""
              }${money(band.perUserMonthly, cur, true)}`}
            />
          </div>

          <div className="space-y-2">
            <div className="flex h-14 items-end gap-1">
              {scale.map((row, i) => (
                <button
                  key={row.users}
                  type="button"
                  onClick={() => setBandIdx(i)}
                  title={`${users(row.users)} users — ${money(row.totalMonthly, cur)} per month`}
                  aria-label={`Price at ${users(row.users)} users`}
                  aria-pressed={i === bandIdx}
                  className="group flex h-full flex-1 items-end"
                >
                  <span
                    className={`block w-full rounded-sm transition-colors ${
                      i === bandIdx
                        ? "bg-[var(--brand-700)]"
                        : "bg-[var(--surface-2)] group-hover:bg-[var(--brand-300)]"
                    }`}
                    style={{ height: `${barPct(row.totalMonthly)}%` }}
                  />
                </button>
              ))}
            </div>

            <input
              type="range"
              min={0}
              max={scale.length - 1}
              step={1}
              value={bandIdx}
              onChange={(e) => setBandIdx(Number(e.target.value))}
              aria-label="User count"
              aria-valuetext={`${users(band.users)} users`}
              className="w-full accent-[var(--brand-700)]"
            />

            <div
              className="flex justify-between text-[10px] tracking-[0.12em] text-[var(--text-4)] uppercase"
              style={{ fontFamily: MONO }}
            >
              <span>{users(scale[0].users)}</span>
              <span className="text-[var(--text-4)]">bars: log scale</span>
              <span>{users(scale[scale.length - 1].users)}</span>
            </div>
          </div>

          <details className="group/bands">
            <summary
              className="cursor-pointer list-none text-[10px] tracking-[0.12em] text-[var(--text-4)] uppercase hover:text-[var(--text-2)]"
              style={{ fontFamily: MONO }}
            >
              <span className="group-open/bands:hidden">All {scale.length} bands</span>
              <span className="hidden group-open/bands:inline">Hide bands</span>
            </summary>
            <div className="-mx-4 mt-3">
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
                        {/* ⚠️ "from —" is meaningless. A floor qualifies a FIGURE, so the
                            prefix is suppressed where there is no figure — which is exactly
                            the zero-users row this table now starts at. */}
                        {row.incomplete && row.perUserMonthly !== null ? "from " : ""}
                        {money(row.perUserMonthly, cur, true)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            </div>
          </details>
        </div>
      </section>

      {mode === "internal" && editing && (
        <WikiCostsEditor slug={slug} model={model} onClose={() => setEditing(false)} />
      )}
    </div>
  );
}
