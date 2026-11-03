"use client";

/**
 * Edit one estimate: the assumptions on the left, the phases on the right, and a live
 * preview pinned under the phases so every keystroke shows what it does to each team.
 *
 * ⚠️ Fixed height (`app-dialog-fixed`): the phase list grows as rows are added, and a
 * dialog that resizes under the cursor is the defect DESIGN.md's fixed-height rule exists
 * for. Each column is its own scroller; the header, preview and footer never move.
 *
 * The limits come from ESTIMATE_LIMITS — the same constants the route validates against —
 * so the form cannot offer an input the server will refuse (the request-title bug).
 */

import { useMemo, useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { DatePicker } from "@/components/ui/date-picker";
import { Modal } from "@/components/ui/modal";
import { MONO } from "@/components/analytics/analytics-widgets";
import { useDeleteWikiEstimate, useSaveWikiEstimate } from "@/hooks/use-wiki";
import {
  COORDINATION_LABEL,
  COORDINATION_OVERHEAD,
  ESTIMATE_LIMITS,
  buildEstimateReadout,
  formatPlanDuration,
} from "@/lib/wiki-estimates";
import type { Estimate, EstimateCoordination } from "@/types/wiki-estimates";

type PhaseDraft = { id: string; name: string; effort: string; maxDevs: string };

type Draft = {
  title: string;
  summary: string;
  startDate: string;
  teamSizes: number[];
  recommendedTeam: number | null;
  coordination: EstimateCoordination;
  contingencyPct: number;
  phases: PhaseDraft[];
};

const CONTINGENCY_OPTIONS = [0, 10, 20, 30, 50];
const TEAM_CHOICES = Array.from({ length: ESTIMATE_LIMITS.maxTeam }, (_, i) => i + 1);

let phaseSeq = 0;
function newPhaseId(): string {
  phaseSeq += 1;
  return `ph-${Date.now().toString(36)}-${phaseSeq}`;
}

/** The phases a new estimate starts with — a typical build, so the preview has a shape. */
function starterPhases(): PhaseDraft[] {
  return [
    { id: newPhaseId(), name: "Discovery", effort: "5", maxDevs: "1" },
    { id: newPhaseId(), name: "Design", effort: "10", maxDevs: "2" },
    { id: newPhaseId(), name: "Build", effort: "40", maxDevs: "" },
    { id: newPhaseId(), name: "Testing & launch", effort: "10", maxDevs: "2" },
  ];
}

function toDraft(estimate: Estimate | null): Draft {
  if (!estimate) {
    return {
      title: "",
      summary: "",
      startDate: "",
      teamSizes: [1, 2, 3, 4],
      recommendedTeam: 2,
      coordination: "TYPICAL",
      contingencyPct: 20,
      phases: starterPhases(),
    };
  }
  return {
    title: estimate.title,
    summary: estimate.summary ?? "",
    startDate: estimate.startDate ?? "",
    teamSizes: estimate.teamSizes,
    recommendedTeam: estimate.recommendedTeam,
    coordination: estimate.coordination,
    contingencyPct: estimate.contingencyPct,
    phases: estimate.phases.map((p) => ({
      id: p.id,
      name: p.name,
      effort: String(p.effortDays),
      maxDevs: p.maxDevs ? String(p.maxDevs) : "",
    })),
  };
}

function parseEffort(value: string): number {
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? n : Number.NaN;
}

/** The draft as the engine sees it — for the live preview. Unparseable rows are skipped. */
function asEstimate(draft: Draft): Estimate {
  return {
    id: "draft",
    title: draft.title,
    summary: null,
    startDate: draft.startDate || null,
    teamSizes: draft.teamSizes,
    recommendedTeam: draft.recommendedTeam,
    coordination: draft.coordination,
    contingencyPct: draft.contingencyPct,
    phases: draft.phases.map((p) => ({
      id: p.id,
      name: p.name,
      effortDays: parseEffort(p.effort),
      maxDevs: p.maxDevs ? Number(p.maxDevs) : null,
    })),
    orderKey: 0,
    updatedAt: new Date().toISOString(),
  };
}

/** What the form would refuse to send, in words. Empty when it can be saved. */
function problems(draft: Draft): string[] {
  const out: string[] = [];
  if (!draft.title.trim()) out.push("Give the estimate a title.");
  if (draft.teamSizes.length === 0) out.push("Pick at least one team size to compare.");
  const rows = draft.phases.filter((p) => p.name.trim() || p.effort.trim());
  if (rows.length === 0) out.push("Add at least one phase.");
  for (const p of rows) {
    const effort = parseEffort(p.effort);
    if (!p.name.trim()) out.push("Every phase needs a name.");
    else if (!(effort > 0)) out.push(`“${p.name.trim()}” needs its effort in days.`);
    else if (effort > ESTIMATE_LIMITS.maxEffortDays)
      out.push(`“${p.name.trim()}” is over ${ESTIMATE_LIMITS.maxEffortDays} days.`);
  }
  return [...new Set(out)];
}

export function WikiEstimatesEditor({
  slug,
  estimate,
  onClose,
  onSaved,
}: {
  slug: string;
  estimate: Estimate | null;
  onClose: () => void;
  onSaved: (estimateId: string | null) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(estimate));
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = useSaveWikiEstimate(slug);
  const remove = useDeleteWikiEstimate(slug);
  const busy = save.isPending || remove.isPending;

  const today = useMemo(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  }, []);
  const preview = useMemo(() => buildEstimateReadout(asEstimate(draft), today), [draft, today]);
  const issues = problems(draft);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const setPhase = (id: string, patch: Partial<PhaseDraft>) =>
    setDraft((d) => ({ ...d, phases: d.phases.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));

  const movePhase = (index: number, by: -1 | 1) =>
    setDraft((d) => {
      const next = [...d.phases];
      const target = index + by;
      if (target < 0 || target >= next.length) return d;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...d, phases: next };
    });

  const toggleTeam = (n: number) =>
    setDraft((d) => {
      const has = d.teamSizes.includes(n);
      if (!has && d.teamSizes.length >= ESTIMATE_LIMITS.maxTeamSizes) return d;
      const teamSizes = has ? d.teamSizes.filter((x) => x !== n) : [...d.teamSizes, n].sort((a, b) => a - b);
      return {
        ...d,
        teamSizes,
        recommendedTeam: d.recommendedTeam && teamSizes.includes(d.recommendedTeam) ? d.recommendedTeam : null,
      };
    });

  async function submit() {
    setError(null);
    if (issues.length > 0) {
      setError(issues[0]);
      return;
    }
    try {
      const input = {
        title: draft.title.trim(),
        summary: draft.summary.trim() || null,
        startDate: draft.startDate || null,
        teamSizes: draft.teamSizes,
        recommendedTeam: draft.recommendedTeam,
        coordination: draft.coordination,
        contingencyPct: draft.contingencyPct,
        phases: draft.phases
          .filter((p) => p.name.trim() || p.effort.trim())
          .map((p) => ({
            id: p.id,
            name: p.name.trim(),
            effortDays: parseEffort(p.effort),
            maxDevs: p.maxDevs ? Number(p.maxDevs) : null,
          })),
      };
      const saved = await save.mutateAsync({ estimateId: estimate?.id ?? null, input });
      // A new estimate is the last one in order — open the page on it.
      onSaved(estimate?.id ?? saved?.estimates?.at(-1)?.id ?? null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the estimate.");
    }
  }

  async function destroy() {
    if (!estimate) return;
    setError(null);
    try {
      await remove.mutateAsync(estimate.id);
      onSaved(null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the estimate.");
    }
  }

  // 16px on phones: iOS Safari zooms the page when a smaller field takes focus.
  const field = "app-input text-base sm:text-sm";

  return (
    <Modal
      open
      onClose={onClose}
      title={estimate ? "EDIT ESTIMATE" : "NEW ESTIMATE"}
      panelClassName="app-dialog-fixed w-full max-w-4xl"
    >
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[minmax(0,300px)_minmax(0,1fr)] md:overflow-visible">
        {/* ── assumptions ─────────────────────────────────────────────────── */}
        <div className="space-y-4 border-[var(--border-1)] p-5 md:min-h-0 md:overflow-y-auto md:border-r">
          <label className="block">
            <span className="app-field-label">Title</span>
            <input
              className={field}
              value={draft.title}
              maxLength={120}
              placeholder="e.g. Version 1 build"
              onChange={(e) => set("title", e.target.value)}
            />
          </label>

          <label className="block">
            <span className="app-field-label">Summary</span>
            <textarea
              className="app-input min-h-[72px] py-2 text-base leading-6 sm:text-sm"
              value={draft.summary}
              maxLength={600}
              placeholder="What this covers, in a sentence or two."
              onChange={(e) => set("summary", e.target.value)}
            />
          </label>

          <label className="block">
            <span className="app-field-label">Start date</span>
            <DatePicker value={draft.startDate} onChange={(next) => set("startDate", next)} />
            <span className="mt-1 block text-[12px] text-[var(--text-4)]">
              Leave blank if it isn&rsquo;t agreed — the page will say so.
            </span>
          </label>

          <div>
            <span className="app-field-label">Team sizes to compare</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5" style={{ fontFamily: MONO }}>
              {TEAM_CHOICES.map((n) => {
                const on = draft.teamSizes.includes(n);
                return (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleTeam(n)}
                    className={`h-8 w-8 rounded-[6px] border text-[12px] transition ${
                      on
                        ? "border-[var(--brand-700)] bg-[var(--brand-50)] font-semibold text-[var(--brand-700)]"
                        : "border-[var(--border-1)] text-[var(--text-3)] hover:bg-[var(--surface-1)]"
                    }`}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
            <span className="mt-1 block text-[12px] text-[var(--text-4)]">
              Up to {ESTIMATE_LIMITS.maxTeamSizes} — one calendar row each.
            </span>
          </div>

          <label className="block">
            <span className="app-field-label">Open on</span>
            <select
              className="app-select text-base sm:text-sm"
              value={draft.recommendedTeam ?? ""}
              onChange={(e) => set("recommendedTeam", e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">The smallest team</option>
              {draft.teamSizes.map((n) => (
                <option key={n} value={n}>
                  {n} developer{n === 1 ? "" : "s"} (recommended)
                </option>
              ))}
            </select>
          </label>

          <div>
            <span className="app-field-label">Coordination overhead</span>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              {(Object.keys(COORDINATION_LABEL) as EstimateCoordination[]).map((c) => {
                const on = draft.coordination === c;
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set("coordination", c)}
                    className={`rounded-[6px] border px-2 py-1.5 text-center transition ${
                      on
                        ? "border-[var(--brand-700)] bg-[var(--brand-50)] text-[var(--brand-700)]"
                        : "border-[var(--border-1)] text-[var(--text-3)] hover:bg-[var(--surface-1)]"
                    }`}
                  >
                    <span className="block text-[12px] font-semibold">{COORDINATION_LABEL[c]}</span>
                    <span className="block text-[10px]" style={{ fontFamily: MONO }}>
                      {Math.round(COORDINATION_OVERHEAD[c] * 100)}% / dev
                    </span>
                  </button>
                );
              })}
            </div>
            <span className="mt-1 block text-[12px] text-[var(--text-4)]">
              What each extra developer costs in handover and review.
            </span>
          </div>

          <label className="block">
            <span className="app-field-label">Contingency</span>
            <select
              className="app-select text-base sm:text-sm"
              value={draft.contingencyPct}
              onChange={(e) => set("contingencyPct", Number(e.target.value))}
            >
              {CONTINGENCY_OPTIONS.map((pct) => (
                <option key={pct} value={pct}>
                  {pct === 0 ? "None" : `${pct}%`}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* ── phases ──────────────────────────────────────────────────────── */}
        {/* ⚠️ `min-h-0` only from md. On a phone the columns stack in ONE scroller, and a
            min-h-0 grid item lets its auto row shrink below its content — the phase list
            then drew straight over the team-size chips (seen at 375px). */}
        <div className="flex flex-col md:min-h-0">
          <div className="space-y-2 p-5 md:min-h-0 md:flex-1 md:overflow-y-auto">
            <div className="flex items-baseline justify-between gap-2">
              <span className="app-field-label">Phases, in order</span>
              <span className="text-[11px] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
                {draft.phases.length}/{ESTIMATE_LIMITS.maxPhases}
              </span>
            </div>
            <p className="text-[12px] text-[var(--text-4)]">
              Effort is in developer-days: one person, one day. &ldquo;Up to&rdquo; is the most
              people the phase can usefully use.
            </p>

            {draft.phases.map((p, i) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center gap-2 rounded-[6px] border border-[var(--border-1)] p-2"
              >
                <input
                  className={`${field} min-w-[160px] flex-1`}
                  value={p.name}
                  maxLength={80}
                  placeholder="Phase name"
                  aria-label={`Phase ${i + 1} name`}
                  onChange={(e) => setPhase(p.id, { name: e.target.value })}
                />
                <label className="flex items-center gap-1.5">
                  <input
                    className={`${field} w-[76px]`}
                    inputMode="decimal"
                    value={p.effort}
                    placeholder="0"
                    aria-label={`Phase ${i + 1} effort in developer-days`}
                    onChange={(e) => setPhase(p.id, { effort: e.target.value })}
                  />
                  <span className="text-[11px] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
                    DAYS
                  </span>
                </label>
                <select
                  className="app-select-compact w-[104px] text-base sm:text-sm"
                  value={p.maxDevs}
                  aria-label={`Phase ${i + 1} most developers`}
                  onChange={(e) => setPhase(p.id, { maxDevs: e.target.value })}
                >
                  <option value="">Any team</option>
                  {TEAM_CHOICES.map((n) => (
                    <option key={n} value={n}>
                      Up to {n}
                    </option>
                  ))}
                </select>
                <span className="ml-auto flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => movePhase(i, -1)}
                    disabled={i === 0}
                    aria-label={`Move ${p.name || "phase"} up`}
                    className="app-button app-button-tertiary app-button-icon-sm disabled:opacity-30"
                  >
                    <ArrowUpIcon className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => movePhase(i, 1)}
                    disabled={i === draft.phases.length - 1}
                    aria-label={`Move ${p.name || "phase"} down`}
                    className="app-button app-button-tertiary app-button-icon-sm disabled:opacity-30"
                  >
                    <ArrowDownIcon className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((d) => ({ ...d, phases: d.phases.filter((x) => x.id !== p.id) }))
                    }
                    aria-label={`Remove ${p.name || "phase"}`}
                    className="app-button app-button-tertiary app-button-icon-sm"
                  >
                    <XMarkIcon className="h-3.5 w-3.5" />
                  </button>
                </span>
              </div>
            ))}

            {draft.phases.length < ESTIMATE_LIMITS.maxPhases && (
              <button
                type="button"
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    phases: [...d.phases, { id: newPhaseId(), name: "", effort: "", maxDevs: "" }],
                  }))
                }
                className="block w-full rounded-[6px] border border-dashed border-[var(--border-2)] px-3 py-2 text-left text-[13px] text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
              >
                + Add a phase
              </button>
            )}
          </div>

        </div>
      </div>

      {/* Pinned at every width: what the phases add up to, for every team compared. */}
      <div className="shrink-0 border-t border-[var(--border-1)] bg-[var(--surface-1)] px-5 py-3">
        <p
          className="text-[10px] tracking-[0.12em] text-[var(--text-4)] uppercase"
          style={{ fontFamily: MONO }}
        >
          Preview{preview.totalEffortDays > 0 ? ` · ${Math.round(preview.totalEffortDays * 10) / 10} developer-days` : ""}
        </p>
        {preview.plans.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1" style={{ fontFamily: MONO }}>
            {preview.plans.map((plan) => (
              <span key={plan.devs} className="text-[12px] whitespace-nowrap text-[var(--text-2)]">
                <span className="font-semibold">{plan.devs}</span> dev{plan.devs === 1 ? "" : "s"} ·{" "}
                {formatPlanDuration(plan)}
                {plan.noFasterThan !== null && (
                  <span className="text-[var(--text-4)]"> (no faster)</span>
                )}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-[12px] text-[var(--text-4)]">
            Add a phase with its effort to see the timelines.
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[var(--border-1)] px-5 py-3">
        <div className="min-w-0">
          {error ? (
            <p className="text-[12px] text-[var(--danger-500)]" role="alert">
              {error}
            </p>
          ) : estimate ? (
            confirmDelete ? (
              <span className="inline-flex items-center gap-2 text-[12px] text-[var(--danger-500)]">
                Delete this estimate?
                <button
                  type="button"
                  className="app-button app-button-link app-button-xs text-[var(--danger-500)]"
                  onClick={() => void destroy()}
                  disabled={busy}
                >
                  Delete
                </button>
                <button
                  type="button"
                  className="app-button app-button-link app-button-xs"
                  onClick={() => setConfirmDelete(false)}
                >
                  Keep
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="app-button app-button-link app-button-xs text-[var(--danger-500)]"
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
              >
                Delete estimate
              </button>
            )
          ) : null}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="app-button app-button-secondary app-button-xs"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="app-button app-button-primary app-button-xs"
            onClick={() => void submit()}
            disabled={busy}
          >
            {save.isPending ? "Saving…" : estimate ? "Save estimate" : "Add estimate"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
