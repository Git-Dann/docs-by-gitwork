"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeftIcon,
  ArrowTopRightOnSquareIcon,
  BuildingOffice2Icon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClipboardDocumentCheckIcon,
  LockClosedIcon,
  PlayIcon,
  PlusIcon,
  SparklesIcon,
  TrashIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";
import {
  useStudy,
  useGeneratePlan,
  useSavePlan,
  useRunStudy,
  useStudyStream,
  useUpdateStudy,
} from "@/hooks/use-study";
import { useClientList } from "@/hooks/use-proposals";
import { BUILT_IN_PERSONAS, PERSONA_COLORS } from "@/config/study-personas";
import { cn } from "@/lib/format";
import { Button } from "@/components/ui/button";
import type { StudyRecord, StudyPlanQuestionRecord } from "@/server/study";
import type { SessionTranscript } from "@/server/study-agents/types";
import { StudyReport } from "./study-report";

// ── Status (rounded-[4px], not full pill — per DESIGN.md) ─────────────────────

const STATUS_TONE: Record<string, string> = {
  DRAFT: "bg-[var(--surface-1)] text-[var(--text-3)] border border-[var(--border-2)]",
  PLAN_GENERATING: "bg-amber-50 text-amber-700 border border-amber-200",
  PLAN_READY: "bg-[var(--mist)] text-[var(--brand-700)] border border-[var(--mist-border)]",
  RUNNING: "bg-amber-50 text-amber-700 border border-amber-200",
  COMPLETED: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  FAILED: "bg-red-50 text-red-700 border border-red-200",
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PLAN_GENERATING: "Generating plan",
  PLAN_READY: "Plan ready",
  RUNNING: "Running",
  COMPLETED: "Completed",
  FAILED: "Failed",
};

function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[4px] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em]",
        STATUS_TONE[status] ?? STATUS_TONE.DRAFT,
      )}
    >
      {status === "RUNNING" || status === "PLAN_GENERATING" ? (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
      ) : null}
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

// ── Plan editor ──────────────────────────────────────────────────────────────

function PlanEditor({ study, onSaved }: { study: StudyRecord; onSaved: () => void }) {
  const { mutateAsync: savePlan, isPending: saving } = useSavePlan(study.id);
  const [questions, setQuestions] = useState<StudyPlanQuestionRecord[]>(study.plan?.questions ?? []);
  const notes = study.plan?.notes ?? "";

  function updateQuestion(i: number, text: string) {
    setQuestions((prev) => prev.map((q, j) => (j === i ? { ...q, text } : q)));
  }

  function removeQuestion(i: number) {
    setQuestions((prev) => prev.filter((_, j) => j !== i));
  }

  function addQuestion() {
    setQuestions((prev) => [
      ...prev,
      {
        id: "",
        text: "",
        personaIds: study.selectedPersonaIds,
        turnType: "SINGLE",
        orderIndex: prev.length,
        rationale: null,
      },
    ]);
  }

  function moveQuestion(i: number, dir: -1 | 1) {
    const next = [...questions];
    const target = i + dir;
    if (target < 0 || target >= next.length) return;
    [next[i], next[target]] = [next[target], next[i]];
    setQuestions(next.map((q, j) => ({ ...q, orderIndex: j })));
  }

  async function handleSave(status: "DRAFT" | "LOCKED") {
    await savePlan({
      questions: questions.map((q) => ({ ...q, rationale: q.rationale ?? undefined })),
      notes,
      status,
    });
    onSaved();
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {questions.map((q, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="flex shrink-0 flex-col gap-0.5 pt-2">
              <button
                type="button"
                onClick={() => moveQuestion(i, -1)}
                disabled={i === 0}
                className="rounded-[4px] p-0.5 text-[var(--text-4)] hover:text-[var(--text-2)] disabled:opacity-30"
              >
                <ChevronUpIcon className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => moveQuestion(i, 1)}
                disabled={i === questions.length - 1}
                className="rounded-[4px] p-0.5 text-[var(--text-4)] hover:text-[var(--text-2)] disabled:opacity-30"
              >
                <ChevronDownIcon className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex min-w-0 flex-1 items-start gap-2">
              <span className="mt-2.5 w-6 shrink-0 text-center font-mono text-[11px] font-medium text-[var(--text-4)]">
                {i + 1}
              </span>
              <textarea
                rows={2}
                className="app-input flex-1 resize-none text-sm"
                value={q.text}
                onChange={(e) => updateQuestion(i, e.target.value)}
                placeholder="Interview question…"
              />
            </div>
            <button
              type="button"
              onClick={() => removeQuestion(i)}
              className="mt-2 rounded-[6px] p-1.5 text-[var(--text-4)] hover:bg-red-50 hover:text-red-500"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addQuestion}
        className="flex w-full items-center justify-center gap-2 rounded-[6px] border border-dashed border-[var(--border-2)] py-2.5 text-sm text-[var(--text-3)] transition hover:border-[var(--brand-700)] hover:text-[var(--brand-700)]"
      >
        <PlusIcon className="h-4 w-4" /> Add question
      </button>

      <div className="flex items-center justify-between border-t border-[var(--border-2)] pt-4">
        <Button
          type="button"
          variant="secondary"
          size="md"
          onClick={() => handleSave("DRAFT")}
          loading={saving}
        >
          Save draft
        </Button>
        <Button
          type="button"
          variant="primary"
          size="md"
          onClick={() => handleSave("LOCKED")}
          loading={saving}
          disabled={questions.length === 0}
          leadingIcon={<LockClosedIcon className="h-4 w-4" />}
        >
          Lock plan
        </Button>
      </div>
    </div>
  );
}

// ── Session card ─────────────────────────────────────────────────────────────

function SessionCard({ session, index }: { session: StudyRecord["sessions"][number]; index: number }) {
  const transcript = session.transcriptData as SessionTranscript | null;
  const p = BUILT_IN_PERSONAS.find((x) => x.id === session.personaId);
  const colors = PERSONA_COLORS[p?.color ?? "violet"] ?? PERSONA_COLORS.violet;
  const turnCount = transcript?.turns?.length ?? 0;
  const numberLabel = String(index + 1).padStart(2, "0");
  return (
    <article className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">{numberLabel}</span>
          {" // SESSION"}
        </span>
        <StatusChip status={session.status} />
      </div>
      <div className="flex items-center gap-3 px-5 py-4">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
            colors.bg,
            colors.text,
          )}
        >
          {p?.initials ?? session.personaName[0]}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[var(--text-1)]">{session.personaName}</p>
          {session.status === "RUNNING" && turnCount > 0 && (
            <p className="mt-0.5 text-[11px] text-[var(--text-4)]">
              {turnCount} question{turnCount !== 1 ? "s" : ""} answered
            </p>
          )}
          {session.status === "COMPLETED" && turnCount > 0 && (
            <p className="mt-0.5 text-[11px] text-[var(--text-4)]">
              {turnCount} response{turnCount !== 1 ? "s" : ""} captured
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

// ── Tab Pill ─────────────────────────────────────────────────────────────────

function TabPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[13px] font-medium transition",
        active
          ? "bg-[var(--surface-0)] text-[var(--text-1)] shadow-sm"
          : "text-[var(--text-3)] hover:text-[var(--text-1)]",
      )}
    >
      {children}
    </button>
  );
}

// ── Client picker (link/unlink study to Portal client) ───────────────────────

function ClientLinker({ study }: { study: StudyRecord }) {
  const { mutateAsync: update, isPending } = useUpdateStudy(study.id);
  const { data: clientsData } = useClientList();
  const manualClients = (clientsData?.clients ?? []).filter((c) => c.source === "MANUAL");
  const [editing, setEditing] = useState(false);

  async function save(workspaceClientId: string | null) {
    await update({ workspaceClientId });
    setEditing(false);
  }

  if (study.workspaceClientName && !editing) {
    return (
      <div className="flex items-center gap-2">
        <Link
          href={`/app/clients/${study.workspaceClientSlug}`}
          className="inline-flex items-center gap-1.5 rounded-[4px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2 py-1 text-[11px] font-medium text-[var(--text-2)] transition hover:border-[var(--brand-200)] hover:text-[var(--brand-700)]"
        >
          <BuildingOffice2Icon className="h-3.5 w-3.5" />
          {study.workspaceClientName}
          <ArrowTopRightOnSquareIcon className="h-3 w-3" />
        </Link>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-[11px] text-[var(--text-4)] hover:text-[var(--text-2)]"
        >
          Change
        </button>
      </div>
    );
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1.5 rounded-[4px] border border-dashed border-[var(--border-2)] px-2 py-1 text-[11px] font-medium text-[var(--text-4)] transition hover:border-[var(--brand-700)] hover:text-[var(--brand-700)]"
      >
        <BuildingOffice2Icon className="h-3.5 w-3.5" />
        Link to a Portal client
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <select
        className="app-input h-8 max-w-[14rem] text-xs"
        disabled={isPending}
        defaultValue={study.workspaceClientId ?? ""}
        onChange={(e) => void save(e.target.value || null)}
      >
        <option value="">No client</option>
        {manualClients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="text-[11px] text-[var(--text-4)] hover:text-[var(--text-2)]"
      >
        Cancel
      </button>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function StudyDetail({ studyId }: { studyId: string }) {
  const { data: study, isLoading, refetch } = useStudy(studyId);
  const { mutateAsync: generatePlan, isPending: generating } = useGeneratePlan(studyId);
  const { mutateAsync: runStudy, isPending: starting } = useRunStudy(studyId);
  const { mutateAsync: savePlan } = useSavePlan(studyId);
  const [activeTab, setActiveTab] = useState<"plan" | "sessions" | "report">("plan");

  useStudyStream(studyId, () => refetch());

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)]" />
        ))}
      </div>
    );
  }

  if (!study) return <p className="text-sm text-red-600">Study not found.</p>;

  const planLocked = study.plan?.status === "LOCKED";
  const canRun = planLocked && study.selectedPersonaIds.length > 0 && study.status !== "RUNNING" && study.status !== "COMPLETED";
  const showReport = study.status === "COMPLETED" && !!study.report;
  const showSessions = study.sessions.length > 0;

  const tabs = [
    { id: "plan" as const, label: "Plan", icon: ClipboardDocumentCheckIcon, count: study.plan?.questions.length ?? 0 },
    ...(showSessions
      ? [{ id: "sessions" as const, label: "Sessions", icon: UsersIcon, count: study.sessions.length }]
      : []),
    ...(showReport
      ? [{ id: "report" as const, label: "Report", icon: SparklesIcon, count: 0 }]
      : []),
  ];

  async function unlockPlan() {
    if (!study?.plan) return;
    await savePlan({
      questions: study.plan.questions.map((q) => ({
        id: q.id,
        text: q.text,
        personaIds: q.personaIds,
        turnType: q.turnType,
        orderIndex: q.orderIndex,
        rationale: q.rationale ?? undefined,
      })),
      notes: study.plan.notes ?? undefined,
      status: "DRAFT",
    });
    refetch();
  }

  return (
    <div className="space-y-5">
      {/* Back link */}
      <Link
        href="/app/study"
        className="inline-flex items-center gap-1.5 text-xs text-[var(--text-4)] hover:text-[var(--text-2)]"
      >
        <ArrowLeftIcon className="h-3.5 w-3.5" /> All studies
      </Link>

      {/* 01 // STUDY BRIEF */}
      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label">
            <span className="widget-header__label--number">01</span>
            {" // STUDY BRIEF"}
          </span>
          <div className="flex items-center gap-2">
            <StatusChip status={study.status} />
            {canRun && (
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => runStudy()}
                loading={starting}
                leadingIcon={!starting ? <PlayIcon className="h-3.5 w-3.5" /> : null}
              >
                {starting ? "Starting…" : "Run study"}
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div>
            <h1
              className="text-3xl leading-none tracking-[-0.03em] text-[var(--text-1)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {study.title}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--text-3)]">{study.problemStatement}</p>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-[var(--border-2)] pt-4">
            <div>
              <p className="widget-data-label mb-1">Mode</p>
              <p className="text-sm font-medium text-[var(--text-1)]">
                {study.sessionMode === "GROUP" ? "Group discussion" : "1-on-1 interviews"}
              </p>
            </div>
            <div>
              <p className="widget-data-label mb-1">Personas</p>
              <p className="text-sm font-medium text-[var(--text-1)]">
                {study.selectedPersonaIds.length} selected
              </p>
            </div>
            <div>
              <p className="widget-data-label mb-1">Goals</p>
              <p className="text-sm font-medium text-[var(--text-1)]">
                {study.researchGoals.length} defined
              </p>
            </div>
            <div className="ml-auto">
              <p className="widget-data-label mb-1">Portal client</p>
              <ClientLinker study={study} />
            </div>
          </div>

          {study.researchGoals.length > 0 && (
            <div className="border-t border-[var(--border-2)] pt-4">
              <p className="widget-data-label mb-2">Research goals</p>
              <ul className="space-y-1.5">
                {study.researchGoals.map((goal, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand-700)]" />
                    <p className="text-sm text-[var(--text-2)]">{goal}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      {/* 02 // PERSONAS */}
      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label">
            <span className="widget-header__label--number">02</span>
            {" // PERSONAS"}
          </span>
          <span className="widget-header__status">{study.selectedPersonaIds.length} SELECTED</span>
        </div>
        <div className="flex flex-wrap gap-2 px-5 py-4">
          {study.selectedPersonaIds.map((id) => {
            const p = BUILT_IN_PERSONAS.find((x) => x.id === id);
            if (!p) return null;
            const colors = PERSONA_COLORS[p.color] ?? PERSONA_COLORS.violet;
            return (
              <span
                key={id}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-[6px] border px-2.5 py-1 text-xs font-medium",
                  colors.bg,
                  colors.text,
                  colors.border,
                )}
              >
                <span
                  className={cn(
                    "flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-semibold",
                    colors.bg,
                    colors.text,
                  )}
                >
                  {p.initials}
                </span>
                {p.name}
              </span>
            );
          })}
        </div>
      </section>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] p-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <TabPill key={tab.id} active={activeTab === tab.id} onClick={() => setActiveTab(tab.id)}>
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
              {tab.count > 0 && (
                <span
                  className={cn(
                    "rounded-[4px] px-1.5 py-0.5 font-mono text-[10px] font-semibold",
                    activeTab === tab.id
                      ? "bg-[var(--mist)] text-[var(--brand-700)]"
                      : "bg-[var(--surface-2)] text-[var(--text-4)]",
                  )}
                >
                  {tab.count}
                </span>
              )}
            </TabPill>
          );
        })}
      </div>

      {/* Plan tab */}
      {activeTab === "plan" && (
        <section className="widget-card">
          <div className="widget-header">
            <span className="widget-header__label">
              <span className="widget-header__label--number">03</span>
              {" // RESEARCH PLAN"}
            </span>
            {planLocked && (
              <span className="inline-flex items-center gap-1 rounded-[4px] border border-[var(--mist-border)] bg-[var(--mist)] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--brand-700)]">
                <LockClosedIcon className="h-3 w-3" /> Locked
              </span>
            )}
          </div>

          <div className="px-6 py-5">
            {!study.plan && study.status === "PLAN_GENERATING" && (
              <div className="flex items-center gap-3 py-8 text-center">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--brand-700)] border-t-transparent" />
                <p className="text-sm text-[var(--text-3)]">Generating your research plan with AI…</p>
              </div>
            )}

            {!study.plan && study.status !== "PLAN_GENERATING" && (
              <div className="py-12 text-center">
                <SparklesIcon className="mx-auto mb-3 h-8 w-8 text-[var(--text-4)]" />
                <p className="mb-4 text-sm text-[var(--text-3)]">
                  Generate a research plan based on your brief and personas.
                </p>
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  onClick={() => generatePlan()}
                  loading={generating}
                  leadingIcon={!generating ? <SparklesIcon className="h-4 w-4" /> : null}
                >
                  {generating ? "Generating…" : "Generate plan with AI"}
                </Button>
              </div>
            )}

            {study.plan && study.plan.status !== "LOCKED" && (
              <PlanEditor study={study} onSaved={() => refetch()} />
            )}

            {study.plan?.status === "LOCKED" && (
              <div className="space-y-2">
                {study.plan.questions.map((q, i) => (
                  <div
                    key={q.id}
                    className="flex items-start gap-3 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3.5"
                  >
                    <span className="mt-0.5 w-6 shrink-0 text-center font-mono text-[11px] font-medium text-[var(--text-4)]">
                      {i + 1}
                    </span>
                    <p className="text-sm text-[var(--text-1)]">{q.text}</p>
                  </div>
                ))}
                {study.status !== "RUNNING" && study.status !== "COMPLETED" && (
                  <button
                    type="button"
                    onClick={() => void unlockPlan()}
                    className="mt-2 text-xs text-[var(--text-4)] hover:text-[var(--text-2)]"
                  >
                    Edit plan
                  </button>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Sessions tab */}
      {activeTab === "sessions" && (
        <div className="grid gap-4 sm:grid-cols-2">
          {study.sessions.map((s, i) => (
            <SessionCard key={s.id} session={s} index={i} />
          ))}
        </div>
      )}

      {/* Report tab */}
      {activeTab === "report" && study.report && <StudyReport report={study.report} />}
    </div>
  );
}
