"use client";

/**
 * The Launchpad wiki section — one component for both audiences.
 *
 * `mode: "internal"` is the Gitwork team in `/app/portal/[slug]/wiki`, writing by
 * client slug; `mode: "public"` is the client on their own share link, writing by
 * token. One component rather than two, so the two views can never tell different
 * stories about what is outstanding — the defect §42.4 had to fix retroactively when
 * Care's two UIs disagreed.
 */

import { useCallback, useMemo, useState } from "react";
import { ChevronRightIcon, RocketLaunchIcon } from "@heroicons/react/24/outline";
import { useToast } from "@/components/ui/toast";
import {
  enabledModulesOf,
  isModuleEnabled,
  outstandingSummary,
  trackedItems,
} from "@/lib/launchpad/structure";
import { isFieldVisible } from "@/lib/onboarding/structure";
import { fieldIdSet } from "@/lib/launchpad/structure";
import {
  useApproveLaunchpadDoc,
  useApprovePublicLaunchpadDoc,
  useSaveLaunchpadAnswers,
  useSavePublicLaunchpadAnswers,
  useSetLaunchpadModules,
  useUpdateLaunchpadDoc,
  useUpdateLaunchpadItem,
  useUpdatePublicLaunchpadDoc,
  useUpdatePublicLaunchpadItem,
} from "@/hooks/use-launchpad";
import { LaunchpadFieldRenderer } from "./launchpad-field";
import { LaunchpadDocPanel } from "./launchpad-doc-panel";
import type { OnboardingAnswerValue, OnboardingFieldDef } from "@/types/onboarding";
import type { LaunchpadDTO, LaunchpadDocKey, LaunchpadFieldDef } from "@/types/launchpad";
import type { LaunchpadDocPatch, LaunchpadItemPatch } from "@/lib/api";

const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";

// ─── Progress readout ─────────────────────────────────────────────────────────

function ProgressPanel({ launchpad }: { launchpad: LaunchpadDTO }) {
  const { completeness } = launchpad;
  const summary = outstandingSummary(completeness, 4);
  const done = completeness.needed === 0 && completeness.total > 0;

  return (
    <section className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label" style={{ fontFamily: MONO }}>
          <span className="widget-header__label--number">01</span>
          {" // LAUNCHPAD"}
        </span>
        <span className="widget-header__right" style={{ fontFamily: MONO }}>
          {completeness.provided + completeness.na} / {completeness.total} RESOLVED
        </span>
      </div>
      <div className="p-4 sm:p-5">
        {/**
         * Leads with the INSTRUCTION, not the statistic.
         *
         * This was two 40px figures side by side ("0%" and "3"), which told a client
         * the score without telling them the task — and "0%" as the first thing on the
         * page reads as failure rather than as a starting point. The figure is still
         * here, as the count inside the sentence and as the bar; it just isn't the
         * headline any more.
         */}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p
            className="text-[28px] leading-tight text-[var(--text-1)]"
            style={{ fontFamily: "var(--font-display), Georgia, serif" }}
          >
            {done ? (
              "Everything's in."
            ) : completeness.total === 0 ? (
              "Nothing needed yet."
            ) : (
              <>
                {completeness.needed} thing{completeness.needed === 1 ? "" : "s"} still to
                send us
              </>
            )}
          </p>
          <span className="widget-data-label text-[var(--text-4)]">
            {completeness.provided + completeness.na} of {completeness.total} done
          </span>
        </div>

        {summary ? (
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-2)]">{summary}</p>
        ) : done ? (
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-3)]">
            Thanks — nothing here is holding the build up.
          </p>
        ) : null}

        <div className="mt-4 widget-progress" aria-hidden="true">
          <div
            className="widget-progress__fill"
            style={{ width: `${completeness.percent}%` }}
          />
        </div>
      </div>
    </section>
  );
}

// ─── Detail fields (collapsed) ────────────────────────────────────────────────

/**
 * The plain inputs of a module — company details, contacts, a credential channel —
 * behind a disclosure.
 *
 * These are NOT counted in completeness (only `checklist_item`s are), so ten of them
 * with always-on helper text was most of the page's height while contributing nothing
 * to the figure the header reports. Collapsed by default; the summary carries the
 * signal so nothing is actually hidden — "4 still blank" in warning tone is what tells
 * a client to open it.
 */
function DetailFields({
  fields,
  answers,
  setAnswer,
  patchItem,
  busy,
  audience,
}: {
  fields: LaunchpadFieldDef[];
  answers: LaunchpadDTO["answers"];
  setAnswer: (id: string, value: OnboardingAnswerValue) => void;
  patchItem: (itemId: string, patch: LaunchpadItemPatch) => void;
  busy: boolean;
  audience: "client" | "team";
}) {
  const answerable = fields.filter((f) => f.type !== "static");
  const filled = answerable.filter((f) => {
    const v = answers[f.id];
    return typeof v === "string" ? v.trim() !== "" : v != null && v !== false;
  }).length;
  const blank = answerable.length - filled;
  // Open on first render when there is something to do, so a client with blanks isn't
  // asked to go hunting — but closed once it is done, which is the common case after
  // prefill.
  const [open, setOpen] = useState(blank > 0 && blank === answerable.length);

  return (
    <div className="rounded-[10px] border border-[var(--border-1)] bg-[var(--surface-1)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <ChevronRightIcon
          className={`h-3.5 w-3.5 shrink-0 text-[var(--text-4)] transition-transform ${open ? "rotate-90" : ""}`}
        />
        <span className="min-w-0 flex-1 text-sm font-medium text-[var(--text-2)]">
          Your details
        </span>
        <span
          className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide ${
            blank > 0 ? "text-[var(--warning-500)]" : "text-[var(--text-4)]"
          }`}
          style={{ fontFamily: MONO }}
        >
          {blank > 0 ? `${blank} still blank` : `all ${answerable.length} filled in`}
        </span>
      </button>

      {open ? (
        <div className="grid grid-cols-1 gap-4 border-t border-[var(--border-1)] p-3 sm:grid-cols-2">
          {fields.map((field) => (
            <div
              key={field.id}
              className={field.config?.width === "half" ? "" : "sm:col-span-2"}
            >
              <LaunchpadFieldRenderer
                field={field}
                answers={answers}
                itemState={undefined}
                setAnswer={setAnswer}
                patchItem={patchItem}
                readOnly={busy}
                audience={audience}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ─── Module toggles (internal only) ───────────────────────────────────────────

function ModuleToggles({
  launchpad,
  onToggle,
  busy,
}: {
  launchpad: LaunchpadDTO;
  onToggle: (next: string[]) => void;
  busy: boolean;
}) {
  const toggleable = launchpad.structure.modules.filter((m) => !m.alwaysOn);
  if (toggleable.length === 0) return null;

  return (
    <section className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label" style={{ fontFamily: MONO }}>
          <span className="widget-header__label--number">02</span>
          {" // WHAT THIS PROJECT NEEDS"}
        </span>
      </div>
      <div className="p-4 sm:p-5">
        <p className="mb-3 text-xs text-[var(--text-3)]">
          Switch on only what this engagement actually involves. A module that is off is not
          counted against the client.
        </p>
        <div className="flex flex-wrap gap-2">
          {toggleable.map((module) => {
            const on = launchpad.enabledModules.includes(module.id);
            return (
              <button
                key={module.id}
                type="button"
                disabled={busy}
                aria-pressed={on}
                onClick={() =>
                  onToggle(
                    on
                      ? launchpad.enabledModules.filter((id) => id !== module.id)
                      : [...launchpad.enabledModules, module.id],
                  )
                }
                className={[
                  "rounded-[6px] border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition disabled:opacity-50",
                  on
                    ? "border-[var(--brand-300)] bg-[var(--surface-brand)] text-[var(--brand-800)]"
                    : "border-[var(--border-1)] bg-[var(--surface-1)] text-[var(--text-4)] hover:text-[var(--text-2)]",
                ].join(" ")}
                style={{ fontFamily: MONO }}
              >
                {module.title}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── The section ──────────────────────────────────────────────────────────────

export function LaunchpadSection({
  launchpad: initial,
  slug,
  token,
  mode,
}: {
  launchpad: LaunchpadDTO;
  slug: string;
  token?: string;
  mode: "internal" | "public";
}) {
  const isInternal = mode === "internal";
  const toast = useToast();

  /**
   * The public view holds the returned DTO locally — there is no React Query cache
   * behind a server-rendered token page, and every write returns the whole payload
   * so completeness and the item list stay in step with one another. The internal
   * view re-reads from the invalidated wiki query instead.
   */
  const [local, setLocal] = useState<LaunchpadDTO>(initial);
  const launchpad = isInternal ? initial : local;

  const updateItemInternal = useUpdateLaunchpadItem(slug);
  const updateItemPublic = useUpdatePublicLaunchpadItem(token ?? "");
  const answersInternal = useSaveLaunchpadAnswers(slug);
  const answersPublic = useSavePublicLaunchpadAnswers(token ?? "");
  const docInternal = useUpdateLaunchpadDoc(slug);
  const docPublic = useUpdatePublicLaunchpadDoc(token ?? "");
  const approveInternal = useApproveLaunchpadDoc(slug);
  const approvePublic = useApprovePublicLaunchpadDoc(token ?? "");
  const setModules = useSetLaunchpadModules(slug);

  const busy =
    updateItemInternal.isPending ||
    updateItemPublic.isPending ||
    answersInternal.isPending ||
    answersPublic.isPending ||
    docInternal.isPending ||
    docPublic.isPending ||
    approveInternal.isPending ||
    approvePublic.isPending ||
    setModules.isPending;

  /** One error path for every write — a silent failure on a checklist is worse than
   *  on most surfaces, because the client believes they have told us something. */
  const report = useCallback(
    (err: unknown) => {
      const message =
        err instanceof Error ? err.message : "Something went wrong — please try again.";
      toast.error(message);
    },
    [toast],
  );

  const applyResult = useCallback(
    (result: { launchpad: LaunchpadDTO }) => {
      if (!isInternal) setLocal(result.launchpad);
    },
    [isInternal],
  );

  const patchItem = useCallback(
    (itemId: string, patch: LaunchpadItemPatch) => {
      const run = isInternal
        ? updateItemInternal.mutateAsync({ itemId, patch })
        : updateItemPublic.mutateAsync({ itemId, patch });
      run.then(applyResult).catch(report);
    },
    [isInternal, updateItemInternal, updateItemPublic, applyResult, report],
  );

  const setAnswer = useCallback(
    (id: string, value: OnboardingAnswerValue) => {
      const run = isInternal
        ? answersInternal.mutateAsync({ [id]: value })
        : answersPublic.mutateAsync({ [id]: value });
      run.then(applyResult).catch(report);
    },
    [isInternal, answersInternal, answersPublic, applyResult, report],
  );

  const patchDoc = useCallback(
    (docKey: LaunchpadDocKey, patch: LaunchpadDocPatch) => {
      const run = isInternal
        ? docInternal.mutateAsync({ docKey, patch })
        : docPublic.mutateAsync({ docKey, patch });
      run.then(applyResult).catch(report);
    },
    [isInternal, docInternal, docPublic, applyResult, report],
  );

  const approveDoc = useCallback(
    (docKey: LaunchpadDocKey, approved: boolean) => {
      const run = isInternal
        ? approveInternal.mutateAsync({ docKey, approved })
        : approvePublic.mutateAsync({ docKey, approved });
      run
        .then((result) => {
          applyResult(result);
          toast.success(approved ? "Marked as approved." : "Approval withdrawn.");
        })
        .catch(report);
    },
    [isInternal, approveInternal, approvePublic, applyResult, report, toast],
  );

  const itemStates = useMemo(
    () => new Map(launchpad.items.map((i) => [i.itemId, i])),
    [launchpad.items],
  );

  const knownIds = useMemo(() => fieldIdSet(launchpad.structure), [launchpad.structure]);
  const modules = enabledModulesOf(launchpad.structure, launchpad.enabledModules);

  if (!launchpad.assigned) {
    return (
      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label" style={{ fontFamily: MONO }}>
            <span className="widget-header__label--number">01</span>
            {" // LAUNCHPAD"}
          </span>
        </div>
        <div className="flex flex-col items-center gap-3 p-10 text-center">
          <RocketLaunchIcon className="h-8 w-8 text-[var(--text-4)]" />
          <p className="text-sm text-[var(--text-3)]">
            {isInternal
              ? "No Launchpad set up for this client yet. Switching the section on assigns the default template."
              : "Your Launchpad is being set up. We'll let you know the moment it's ready."}
          </p>
        </div>
      </section>
    );
  }

  // Docs are numbered after the checklist modules, continuing one sequence across
  // the whole screen — the numbering is per screen, not per column (§42.14).
  const docStartIndex = (isInternal ? 3 : 2) + modules.length;

  return (
    <div className="space-y-3">
      {/* Two short cards side by side from xl. Below that they stack — the module
          toggles wrap to three rows on a narrow column and would squeeze the
          progress readout's stat figures. */}
      <div
        className={
          isInternal ? "grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : ""
        }
      >
        <ProgressPanel launchpad={launchpad} />

        {isInternal ? (
          <ModuleToggles
            launchpad={launchpad}
            busy={busy}
            onToggle={(next) => {
              setModules.mutateAsync(next).catch(report);
            }}
          />
        ) : null}
      </div>

      {modules.map((module, moduleIndex) => {
        const number = (isInternal ? 3 : 2) + moduleIndex;
        const visible = module.fields.filter((field) =>
          isFieldVisible(
            field as unknown as OnboardingFieldDef,
            launchpad.answers,
            knownIds,
          ),
        );
        const checklist = visible.filter((f) => f.type === "checklist_item");
        const inputs = visible.filter(
          (f) => f.type !== "checklist_item" && f.type !== "legal_doc",
        );
        const moduleItems = trackedItems(
          { modules: [module] },
          [module.id, ...launchpad.enabledModules],
          launchpad.answers,
        );
        const resolved = moduleItems.filter((f) => {
          const status = itemStates.get(f.id)?.status ?? "NEEDED";
          return status === "PROVIDED" || status === "NA";
        }).length;

        if (visible.length === 0) return null;

        return (
          <section key={module.id} className="widget-card">
            <div className="widget-header">
              <span className="widget-header__label" style={{ fontFamily: MONO }}>
                <span className="widget-header__label--number">
                  {String(number).padStart(2, "0")}
                </span>
                {` // ${module.title.toUpperCase()}`}
              </span>
              {moduleItems.length > 0 ? (
                <span className="widget-header__right" style={{ fontFamily: MONO }}>
                  {resolved} / {moduleItems.length}
                </span>
              ) : null}
            </div>
            <div className="space-y-4 p-4 sm:p-5">
              {module.blurb ? (
                <p className="text-xs leading-relaxed text-[var(--text-3)]">{module.blurb}</p>
              ) : null}

              {/**
               * ⚠️ REQUIREMENTS FIRST, details second — this order is the whole point
               * of the page and it shipped the wrong way round.
               *
               * Foundations carries 3 tracked requirements and 10 plain inputs, and the
               * inputs came first — so a client landed on ten form fields that do NOT
               * move the completeness figure, with the 3 things the header is actually
               * counting buried in ninth position. The number and the content disagreed
               * about what the page was for, which is why it read as heavy and unclear
               * rather than merely long.
               *
               * Two-up from xl. Not lg: a requirement card carries a label, a helper,
               * the three-way status picker AND a link field on one row, and below
               * ~1280 the picker wraps under the label. `items-start` so a card with a
               * long helper doesn't stretch its neighbour.
               */}
              {checklist.length > 0 ? (
                <div className="grid items-start gap-2 xl:grid-cols-2">
                  {checklist.map((field) => (
                    <LaunchpadFieldRenderer
                      key={field.id}
                      field={field}
                      answers={launchpad.answers}
                      itemState={itemStates.get(field.id)}
                      setAnswer={setAnswer}
                      patchItem={patchItem}
                      readOnly={false}
                      audience={isInternal ? "team" : "client"}
                    />
                  ))}
                </div>
              ) : null}

              {/* The plain inputs, behind a disclosure. Collapsed by default with a
                  filled-count summary, so the height they cost is opt-in but the signal
                  ("4 still blank") is not hidden. */}
              {inputs.length > 0 ? (
                <DetailFields
                  fields={inputs}
                  answers={launchpad.answers}
                  setAnswer={setAnswer}
                  patchItem={patchItem}
                  busy={busy}
                  audience={isInternal ? "team" : "client"}
                />
              ) : null}
            </div>
          </section>
        );
      })}

      {launchpad.docs.map((doc, i) => (
        <LaunchpadDocPanel
          key={doc.docKey}
          doc={doc}
          index={docStartIndex + i}
          busy={busy}
          readOnly={false}
          onPatch={(patch) => patchDoc(doc.docKey, patch)}
          onApprove={(approved) => approveDoc(doc.docKey, approved)}
        />
      ))}
    </div>
  );
}

/** Re-exported so callers don't need to know which file the guard lives in. */
export { isModuleEnabled };
