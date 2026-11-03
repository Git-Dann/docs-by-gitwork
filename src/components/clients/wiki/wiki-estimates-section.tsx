"use client";

/**
 * Estimates — how long the work takes with 1, 2, 3… developers, on a calendar.
 *
 * Two panels and no long lists, on purpose:
 *   01 // ESTIMATE — the one answer for the team size picked, with its finish date.
 *   02 // CALENDAR — one row per team size on a Week / Month / 6 months / Year axis, so
 *                    the comparison IS the chart. Phase detail lives in the bars' colours
 *                    and the legend under them, not in a table the reader has to scroll.
 *
 * Every number is derived at render by `src/lib/wiki-estimates.ts` from the stored effort.
 * Nothing here decides a duration — the section, the editor's preview and the dashboard
 * card all call the same functions, so they cannot disagree.
 *
 * ⚠️ The calendar never scrolls sideways. The axis is the window, so a longer plan zooms
 * out or pages rather than widening the card — and `.widget-card` is `overflow: hidden`,
 * so a wide child would be unreachable, not merely off-screen (CLAUDE.md §45.2).
 */

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { MONO, SERIF } from "@/components/analytics/analytics-widgets";
import { insightColor } from "@/lib/insights/palette";
import {
  CALENDAR_ZOOMS,
  addDays,
  firstWorkingDay,
  COORDINATION_LABEL,
  COORDINATION_OVERHEAD,
  buildEstimateReadout,
  calendarTicks,
  calendarWindow,
  planDurationParts,
  fittingZoom,
  formatDate,
  formatPlanDuration,
  formatShortDate,
  formatWeekdayDate,
  placeSpan,
  positionPct,
  windowLabel,
  type CalendarZoom,
  type EstimatePlan,
} from "@/lib/wiki-estimates";
import type { Estimate, WikiEstimatesSection } from "@/types/wiki-estimates";
import { WikiEstimatesEditor } from "./wiki-estimates-editor";

/** The contingency tail: hatched, so it reads as "might" rather than as more work. */
const TAIL_STYLE: CSSProperties = {
  background:
    "repeating-linear-gradient(135deg, var(--text-4) 0 1.5px, transparent 1.5px 5px)",
  opacity: 0.55,
};

function utcToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/** The house pick-one control: mono caps, 6px, the active option raised in brand. */
function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex rounded-[6px] border border-[var(--border-1)] bg-[var(--surface-1)] p-0.5"
      style={{ fontFamily: MONO }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={active}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={`min-w-[28px] rounded-[4px] px-2 py-1 text-[11px] tracking-[0.06em] uppercase transition ${
              active
                ? "bg-[var(--surface-0)] font-semibold text-[var(--brand-700)] shadow-sm"
                : "text-[var(--text-3)] hover:text-[var(--text-1)]"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function WikiEstimatesSection({
  slug,
  section,
  mode,
}: {
  slug: string;
  section: WikiEstimatesSection;
  mode: "internal" | "public";
}) {
  const estimates = section.estimates;
  const [selectedId, setSelectedId] = useState<string | null>(estimates[0]?.id ?? null);
  const estimate = estimates.find((e) => e.id === selectedId) ?? estimates[0] ?? null;
  // null = closed · "new" = creating · an id = editing that estimate
  const [editing, setEditing] = useState<string | null>(null);

  const editor =
    mode === "internal" && editing !== null ? (
      <WikiEstimatesEditor
        slug={slug}
        estimate={editing === "new" ? null : (estimates.find((e) => e.id === editing) ?? null)}
        onClose={() => setEditing(null)}
        onSaved={(id) => id && setSelectedId(id)}
      />
    ) : null;

  if (!estimate) {
    return (
      <div className="space-y-4">
        <section className="widget-card">
          <div className="widget-header">
            <span className="widget-header__label" style={{ fontFamily: MONO }}>
              <span className="widget-header__label--number">01</span>
              {" // ESTIMATE"}
            </span>
            {mode === "internal" && (
              <button
                type="button"
                className="app-button app-button-secondary app-button-xs"
                onClick={() => setEditing("new")}
              >
                New estimate
              </button>
            )}
          </div>
          <p className="p-8 text-center text-sm text-[var(--text-4)]">
            {mode === "internal"
              ? "No estimates yet. Add the phases and their effort, pick the team sizes to compare, and the timeline for each is worked out for you."
              : "No estimates have been published yet."}
          </p>
        </section>
        {editor}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Keyed on the estimate, so switching resets the team and the calendar to that
          estimate's own defaults rather than carrying the last one's zoom across. */}
      <EstimateView
        key={estimate.id}
        estimate={estimate}
        estimates={estimates}
        onSelect={setSelectedId}
        mode={mode}
        onEdit={() => setEditing(estimate.id)}
        onNew={() => setEditing("new")}
      />
      {editor}
    </div>
  );
}

function EstimateView({
  estimate,
  estimates,
  onSelect,
  mode,
  onEdit,
  onNew,
}: {
  estimate: Estimate;
  estimates: Estimate[];
  onSelect: (id: string) => void;
  mode: "internal" | "public";
  onEdit: () => void;
  onNew: () => void;
}) {
  const today = useMemo(utcToday, []);
  const readout = useMemo(() => buildEstimateReadout(estimate, today), [estimate, today]);
  const [devs, setDevs] = useState<number | null>(readout.recommended?.devs ?? null);
  const plan = readout.plans.find((p) => p.devs === devs) ?? readout.recommended;

  const header = (
    <div className="widget-header">
      <span className="widget-header__label" style={{ fontFamily: MONO }}>
        <span className="widget-header__label--number">01</span>
        {" // ESTIMATE"}
      </span>
      {mode === "internal" ? (
        <span className="flex items-center gap-1.5">
          <button
            type="button"
            className="app-button app-button-secondary app-button-xs"
            onClick={onEdit}
          >
            Edit
          </button>
          <button
            type="button"
            className="app-button app-button-secondary app-button-xs"
            onClick={onNew}
          >
            New
          </button>
        </span>
      ) : (
        <span className="widget-header__status" style={{ fontFamily: MONO }}>
          {`UPDATED ${formatShortDate(new Date(estimate.updatedAt)).toUpperCase()}`}
        </span>
      )}
    </div>
  );

  const picker =
    estimates.length > 1 ? (
      <select
        value={estimate.id}
        onChange={(e) => onSelect(e.target.value)}
        aria-label="Estimate"
        className="app-select-compact w-full sm:w-auto sm:min-w-[220px]"
      >
        {estimates.map((e) => (
          <option key={e.id} value={e.id}>
            {e.title}
          </option>
        ))}
      </select>
    ) : null;

  if (!plan) {
    return (
      <section className="widget-card">
        {header}
        <div className="space-y-3 p-5">
          {picker}
          <h3 className="text-[22px] leading-tight text-[var(--text-1)]" style={{ fontFamily: SERIF }}>
            {estimate.title}
          </h3>
          <p className="text-sm text-[var(--text-4)]">
            {mode === "internal"
              ? "This estimate has no phases with effort yet, so there is no timeline to show. Add them with Edit."
              : "This estimate is still being put together."}
          </p>
        </div>
      </section>
    );
  }

  const { figure, unit } = planDurationParts(plan);
  const hasTail = plan.upperWorkingDays > plan.workingDays;

  return (
    <>
      {/* ── 01 the answer for the team picked ─────────────────────────────── */}
      <section className="widget-card">
        {header}
        <div className="space-y-4 p-5 sm:p-6">
          {picker}
          <div className="space-y-1.5">
            <h3
              className="text-[22px] leading-tight text-[var(--text-1)]"
              style={{ fontFamily: SERIF }}
            >
              {estimate.title}
            </h3>
            {estimate.summary && (
              <p className="max-w-[68ch] text-sm leading-6 text-[var(--text-3)]">
                {estimate.summary}
              </p>
            )}
          </div>

          {/* The figure and the control that changes it share a row, so a phone reads
              "12 WEEKS · [1 2 3 4]" as one thing instead of scrolling between them. It
              wraps only when a long team list genuinely cannot fit beside the figure. */}
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div className="min-w-0">
              <p
                className="text-[11px] tracking-[0.12em] text-[var(--text-4)] uppercase"
                style={{ fontFamily: MONO }}
              >
                With {plan.devs} developer{plan.devs === 1 ? "" : "s"}
              </p>
              <p className="mt-1 leading-none text-[var(--text-1)]" style={{ fontFamily: SERIF }}>
                <span className="text-[44px]">{figure}</span>
                {unit && (
                  <span
                    className="ml-2 align-[0.6em] text-[11px] tracking-[0.12em] text-[var(--text-4)] uppercase"
                    style={{ fontFamily: MONO }}
                  >
                    {unit}
                  </span>
                )}
              </p>
            </div>
            <Segmented
              label="Team size"
              value={plan.devs}
              onChange={setDevs}
              options={readout.plans.map((p) => ({
                value: p.devs,
                label: p.devs,
                title: `${p.devs} developer${p.devs === 1 ? "" : "s"} — ${formatPlanDuration(p)}`,
              }))}
            />
          </div>

          <div className="space-y-1">
            <p className="text-sm text-[var(--text-2)]">
              Done by <span className="font-semibold">{formatDate(plan.end)}</span>
              {hasTail && (
                <span className="text-[var(--text-3)]">
                  {" "}
                  · could run to {formatDate(plan.upperEnd)}
                </span>
              )}
            </p>
            {plan.noFasterThan !== null && (
              // Said in words, not left for the reader to spot two equal bars: a client
              // weighing a bigger team needs to know the extra people buy nothing here.
              <p className="text-[13px] text-[var(--warning-500)]">
                No faster than {plan.noFasterThan} developer
                {plan.noFasterThan === 1 ? "" : "s"} — the phases can&rsquo;t usefully be split
                further.
              </p>
            )}
            <p className="text-[11px] tracking-[0.06em] text-[var(--text-4)] uppercase" style={{ fontFamily: MONO }}>
              {readout.startAgreed
                ? `Starting ${formatWeekdayDate(readout.start)}`
                : `No start date agreed — shown as if we start ${formatWeekdayDate(readout.start)}`}
            </p>
          </div>
        </div>
      </section>

      <CalendarPanel
        estimate={estimate}
        plans={readout.plans}
        selected={plan.devs}
        onSelect={setDevs}
        start={readout.start}
        today={today}
        totalEffortDays={readout.totalEffortDays}
      />
    </>
  );
}

function CalendarPanel({
  estimate,
  plans,
  selected,
  onSelect,
  start,
  today,
  totalEffortDays,
}: {
  estimate: Estimate;
  plans: EstimatePlan[];
  selected: number;
  onSelect: (devs: number) => void;
  start: Date;
  today: Date;
  totalEffortDays: number;
}) {
  const latestEnd = plans.reduce(
    (latest, p) => (p.upperEnd > latest ? p.upperEnd : latest),
    plans[0].upperEnd,
  );
  const [zoom, setZoom] = useState<CalendarZoom>(() => fittingZoom(start, latestEnd));
  const [page, setPage] = useState(0);
  const win = calendarWindow(zoom, start, page);
  const ticks = calendarTicks(zoom, win);
  const todayPct = today >= win.from && today < win.to ? positionPct(today, win) : null;
  const phases = plans[0].phases;
  const overhead = Math.round(COORDINATION_OVERHEAD[estimate.coordination] * 100);

  const changeZoom = (next: CalendarZoom) => {
    setZoom(next);
    setPage(0);
  };

  return (
    <section className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label" style={{ fontFamily: MONO }}>
          <span className="widget-header__label--number">02</span>
          {" // CALENDAR"}
        </span>
        <Segmented
          label="Calendar zoom"
          value={zoom}
          onChange={changeZoom}
          options={CALENDAR_ZOOMS.map((z) => ({
            value: z.value,
            title: z.label,
            // Full words from `sm`; a phone gets W · M · 6M · Y so the band stays 36px.
            label: (
              <>
                <span className="sm:hidden">{z.short}</span>
                <span className="hidden sm:inline">{z.label}</span>
              </>
            ),
          }))}
        />
      </div>

      <div className="space-y-3 p-4">
        {/* Window navigation — the plan pages rather than the card widening. */}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => p - 1)}
            aria-label="Earlier"
            className="app-button app-button-secondary app-button-icon-sm"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="truncate text-[12px] tracking-[0.08em] text-[var(--text-2)] uppercase"
              style={{ fontFamily: MONO }}
              title={windowLabel(zoom, win)}
            >
              {windowLabel(zoom, win)}
            </span>
            {page !== 0 && (
              <button
                type="button"
                onClick={() => setPage(0)}
                className="app-button app-button-link app-button-xs shrink-0"
              >
                Back to start
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            aria-label="Later"
            className="app-button app-button-secondary app-button-icon-sm"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-1.5">
          {plans.map((plan) => (
            <PlanRow
              key={plan.devs}
              plan={plan}
              win={win}
              ticks={ticks.map((t) => t.pct)}
              todayPct={todayPct}
              active={plan.devs === selected}
              onSelect={() => onSelect(plan.devs)}
            />
          ))}

          {/* Axis — the same two columns as the rows, so the labels sit under the
              gridlines they name. Labels past 90% are dropped rather than run off the
              card's edge. */}
          <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-3 sm:grid-cols-[96px_minmax(0,1fr)]">
            <span />
            <div className="relative h-4">
              {ticks
                .filter((t) => t.pct < 90)
                .map((t) => (
                  <span
                    key={t.date.getTime()}
                    className="absolute top-0 pl-1 text-[10px] whitespace-nowrap text-[var(--text-4)]"
                    style={{ left: `${t.pct}%`, fontFamily: MONO }}
                    title={formatDate(t.date)}
                  >
                    <span className="sm:hidden">{t.short}</span>
                    <span className="hidden sm:inline">{t.label}</span>
                  </span>
                ))}
            </div>
          </div>
        </div>

        {/* Legend — the phases, in order. It doubles as the only phase list on the page. */}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-[var(--border-1)] pt-3">
          {phases.map((p, i) => (
            <span key={p.id} className="inline-flex items-center gap-1.5 text-[12px] text-[var(--text-2)]">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                style={{ background: insightColor(null, i) }}
                aria-hidden
              />
              {p.name}
            </span>
          ))}
          {plans.some((p) => p.upperWorkingDays > p.workingDays) && (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-[var(--text-3)]">
              <span className="h-2.5 w-3 shrink-0 rounded-[2px]" style={TAIL_STYLE} aria-hidden />
              Contingency ({estimate.contingencyPct}%)
            </span>
          )}
        </div>

        <details className="group/how">
          <summary
            className="cursor-pointer list-none text-[10px] tracking-[0.12em] text-[var(--text-4)] uppercase hover:text-[var(--text-2)]"
            style={{ fontFamily: MONO }}
          >
            <span className="group-open/how:hidden">How this is worked out</span>
            <span className="hidden group-open/how:inline">Hide</span>
          </summary>
          <div className="mt-2 max-w-[72ch] space-y-2 text-[13px] leading-6 text-[var(--text-3)]">
            <p>
              The work is {Math.round(totalEffortDays * 10) / 10} developer-days in total — one
              person working one day. More developers don&rsquo;t divide that evenly: each extra
              person adds coordination ({COORDINATION_LABEL[estimate.coordination].toLowerCase()},
              about {overhead}% each), and some phases can only use so many people, so the gains
              shrink as the team grows.
            </p>
            <p>
              Phases run one after another. Days are working days, Monday to Friday; bank
              holidays and leave aren&rsquo;t taken out.
              {estimate.contingencyPct > 0 &&
                ` The shaded tail on each row is the ${estimate.contingencyPct}% contingency — the range, not a padded figure.`}
            </p>
          </div>
        </details>
      </div>
    </section>
  );
}

function PlanRow({
  plan,
  win,
  ticks,
  todayPct,
  active,
  onSelect,
}: {
  plan: EstimatePlan;
  win: ReturnType<typeof calendarWindow>;
  ticks: number[];
  todayPct: number | null;
  active: boolean;
  onSelect: () => void;
}) {
  const tail =
    plan.upperWorkingDays > plan.workingDays
      ? placeSpan(firstWorkingDay(addDays(plan.end, 1)), plan.upperEnd, win)
      : null;
  const bars = plan.phases.map((p, i) => ({ phase: p, i, bar: placeSpan(p.start, p.end, win) }));
  const after = plan.end < win.from;
  const before = plan.start >= win.to;
  const summary = `${plan.devs} developer${plan.devs === 1 ? "" : "s"} — ${formatPlanDuration(plan)}, done by ${formatDate(plan.end)}`;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      aria-label={summary}
      title={summary}
      className={`grid w-full grid-cols-[76px_minmax(0,1fr)] items-center gap-3 rounded-[6px] px-0 py-1 text-left transition sm:grid-cols-[96px_minmax(0,1fr)] ${
        active ? "bg-[var(--brand-50)]" : "hover:bg-[var(--surface-1)]"
      }`}
    >
      <span className="min-w-0 pl-2">
        <span
          className={`block text-[11px] tracking-[0.08em] uppercase ${
            active ? "font-semibold text-[var(--brand-700)]" : "text-[var(--text-2)]"
          }`}
          style={{ fontFamily: MONO }}
        >
          {plan.devs} dev{plan.devs === 1 ? "" : "s"}
        </span>
        <span
          className="block truncate text-[10px] text-[var(--text-4)]"
          style={{ fontFamily: MONO }}
          title={`Done by ${formatDate(plan.end)}`}
        >
          {formatShortDate(plan.end)}
        </span>
      </span>

      <span className="relative block h-7 overflow-hidden rounded-[4px] bg-[var(--surface-1)]">
        {ticks.map((pct) => (
          <span
            key={pct}
            className="absolute inset-y-0 w-px bg-[var(--border-1)]"
            style={{ left: `${pct}%` }}
            aria-hidden
          />
        ))}
        {bars.map(({ phase, i, bar }) =>
          bar ? (
            <span
              key={phase.id}
              className="absolute inset-y-1.5 rounded-[3px]"
              style={{
                left: `${bar.left}%`,
                width: `${bar.width}%`,
                background: insightColor(null, i),
                opacity: active ? 1 : 0.55,
              }}
              title={`${phase.name} · ${phase.workingDays} working day${phase.workingDays === 1 ? "" : "s"} · ${phase.devsUsed} developer${phase.devsUsed === 1 ? "" : "s"} · ${formatShortDate(phase.start)} – ${formatShortDate(phase.end)}`}
            />
          ) : null,
        )}
        {tail && (
          <span
            className="absolute inset-y-1.5 rounded-[3px]"
            style={{ ...TAIL_STYLE, left: `${tail.left}%`, width: `${tail.width}%` }}
            aria-hidden
          />
        )}
        {todayPct !== null && (
          <span
            className="absolute inset-y-0 w-0.5 bg-[var(--danger-500)]"
            style={{ left: `${todayPct}%` }}
            title="Today"
            aria-hidden
          />
        )}
        {/* Off the window entirely — say where it went rather than drawing an empty track. */}
        {(after || before) && (
          <span
            className="absolute inset-0 flex items-center px-2 text-[10px] tracking-[0.08em] text-[var(--text-4)] uppercase"
            style={{ fontFamily: MONO }}
          >
            {after ? `Finished ${formatShortDate(plan.end)}` : `Starts ${formatShortDate(plan.start)}`}
          </span>
        )}
      </span>
    </button>
  );
}
