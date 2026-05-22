"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, SparklesIcon, PlayIcon, LockClosedIcon, PlusIcon, TrashIcon, ChevronUpIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import { useStudy, useGeneratePlan, useSavePlan, useRunStudy, useStudyStream } from "@/hooks/use-study";
import { BUILT_IN_PERSONAS, PERSONA_COLORS } from "@/config/study-personas";
import { cn } from "@/lib/format";
import type { StudyRecord, StudyPlanQuestionRecord } from "@/server/study";
import type { SessionTranscript } from "@/server/study-agents/types";
import { StudyReport } from "./study-report";

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_TONE: Record<string, string> = {
  DRAFT: "bg-[var(--surface-1)] text-[var(--text-3)] border border-[var(--border-2)]",
  PLAN_GENERATING: "bg-amber-50 text-amber-700 border border-amber-200",
  PLAN_READY: "bg-blue-50 text-blue-700 border border-blue-200",
  RUNNING: "bg-amber-50 text-amber-700 border border-amber-200",
  COMPLETED: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  FAILED: "bg-red-50 text-red-700 border border-red-200",
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PLAN_GENERATING: "Generating plan…",
  PLAN_READY: "Plan ready",
  RUNNING: "Running",
  COMPLETED: "Completed",
  FAILED: "Failed",
};

// ── Persona avatar row ────────────────────────────────────────────────────────

function PersonaRow({ ids }: { ids: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ids.map((id) => {
        const p = BUILT_IN_PERSONAS.find((x) => x.id === id);
        if (!p) return null;
        const colors = PERSONA_COLORS[p.color] ?? PERSONA_COLORS.violet;
        return (
          <span key={id} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium", colors.bg, colors.text, colors.border)}>
            {p.initials} {p.name}
          </span>
        );
      })}
    </div>
  );
}

// ── Plan editor ───────────────────────────────────────────────────────────────

function PlanEditor({ study, onSaved }: { study: StudyRecord; onSaved: () => void }) {
  const { mutateAsync: savePlan, isPending: saving } = useSavePlan(study.id);
  const [questions, setQuestions] = useState<StudyPlanQuestionRecord[]>(study.plan?.questions ?? []);
  const notes = study.plan?.notes ?? "";

  function updateQuestion(i: number, text: string) {
    setQuestions((prev) => prev.map((q, j) => j === i ? { ...q, text } : q));
  }

  function removeQuestion(i: number) {
    setQuestions((prev) => prev.filter((_, j) => j !== i));
  }

  function addQuestion() {
    setQuestions((prev) => [...prev, { id: "", text: "", personaIds: study.selectedPersonaIds, turnType: "SINGLE", orderIndex: prev.length, rationale: null }]);
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
              <button type="button" onClick={() => moveQuestion(i, -1)} disabled={i === 0} className="rounded p-0.5 text-[var(--text-4)] hover:text-[var(--text-2)] disabled:opacity-30">
                <ChevronUpIcon className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => moveQuestion(i, 1)} disabled={i === questions.length - 1} className="rounded p-0.5 text-[var(--text-4)] hover:text-[var(--text-2)] disabled:opacity-30">
                <ChevronDownIcon className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex min-w-0 flex-1 items-start gap-2">
              <span className="mt-2.5 w-5 shrink-0 text-center text-xs text-[var(--text-4)]">{i + 1}</span>
              <textarea
                rows={2}
                className="app-input flex-1 resize-none text-sm"
                value={q.text}
                onChange={(e) => updateQuestion(i, e.target.value)}
                placeholder="Interview question…"
              />
            </div>
            <button type="button" onClick={() => removeQuestion(i)} className="mt-2 rounded-[6px] p-1.5 text-[var(--text-4)] hover:bg-red-50 hover:text-red-500">
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <button type="button" onClick={addQuestion} className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-[var(--border-2)] py-2.5 text-sm text-[var(--text-3)] transition hover:border-[var(--brand-700)] hover:text-[var(--brand-700)]">
        <PlusIcon className="h-4 w-4" /> Add question
      </button>

      <div className="flex items-center justify-between border-t border-[var(--border-2)] pt-4">
        <button type="button" onClick={() => handleSave("DRAFT")} disabled={saving} className="rounded-[10px] border border-[var(--border-2)] px-4 py-2 text-sm font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-50">
          Save draft
        </button>
        <button type="button" onClick={() => handleSave("LOCKED")} disabled={saving || questions.length === 0} className="inline-flex items-center gap-2 rounded-[10px] bg-[var(--brand-700)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40">
          <LockClosedIcon className="h-4 w-4" />
          Lock plan
        </button>
      </div>
    </div>
  );
}

// ── Session progress cards ─────────────────────────────────────────────────────

function SessionCard({ session }: { session: StudyRecord["sessions"][number] }) {
  const transcript = session.transcriptData as SessionTranscript | null;
  const p = BUILT_IN_PERSONAS.find((x) => x.id === session.personaId);
  const colors = PERSONA_COLORS[p?.color ?? "violet"] ?? PERSONA_COLORS.violet;
  const turnCount = transcript?.turns?.length ?? 0;

  return (
    <div className="app-card p-4">
      <div className="flex items-center gap-3">
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold", colors.bg, colors.text)}>
          {p?.initials ?? session.personaName[0]}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-[var(--text-1)]">{session.personaName}</p>
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold",
              session.status === "COMPLETED" ? "bg-emerald-50 text-emerald-700" :
              session.status === "RUNNING" ? "bg-amber-50 text-amber-700" :
              "bg-[var(--surface-1)] text-[var(--text-4)]"
            )}>
              {session.status === "RUNNING" && <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />}
              {session.status.toLowerCase()}
            </span>
          </div>
          {session.status === "RUNNING" && turnCount > 0 && (
            <p className="mt-0.5 text-[11px] text-[var(--text-4)]">{turnCount} question{turnCount !== 1 ? "s" : ""} answered</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function StudyDetail({ studyId }: { studyId: string }) {
  const { data: study, isLoading, refetch } = useStudy(studyId);
  const { mutateAsync: generatePlan, isPending: generating } = useGeneratePlan(studyId);
  const { mutateAsync: runStudy, isPending: starting } = useRunStudy(studyId);
  const [activeTab, setActiveTab] = useState<"plan" | "sessions" | "report">("plan");

  useStudyStream(studyId, () => refetch());

  if (isLoading) {
    return <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-[10px] bg-[var(--surface-1)]" />)}</div>;
  }

  if (!study) {
    return <p className="text-sm text-red-600">Study not found.</p>;
  }

  const planLocked = study.plan?.status === "LOCKED";
  const canRun = planLocked && study.selectedPersonaIds.length > 0 && study.status !== "RUNNING" && study.status !== "COMPLETED";
  const isRunning = study.status === "RUNNING";

  const tabs = [
    { id: "plan" as const, label: "Plan" },
    { id: "sessions" as const, label: `Sessions (${study.sessions.length})`, show: study.sessions.length > 0 },
    { id: "report" as const, label: "Report", show: study.status === "COMPLETED" && !!study.report },
  ].filter((t) => t.show !== false);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <Link href="/app/study" className="mb-2 inline-flex items-center gap-1.5 text-xs text-[var(--text-4)] hover:text-[var(--text-2)]">
            <ArrowLeftIcon className="h-3.5 w-3.5" /> All studies
          </Link>
          <h1 className="text-xl font-semibold text-[var(--text-1)]">{study.title}</h1>
          <p className="mt-1 text-sm text-[var(--text-3)]">{study.problemStatement}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold", STATUS_TONE[study.status] ?? STATUS_TONE.DRAFT)}>
            {isRunning && <span className="mr-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />}
            {STATUS_LABEL[study.status] ?? study.status}
          </span>
          {canRun && (
            <button type="button" onClick={() => runStudy()} disabled={starting} className="inline-flex items-center gap-2 rounded-[10px] bg-[var(--brand-700)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50">
              <PlayIcon className="h-4 w-4" />
              {starting ? "Starting…" : "Run study"}
            </button>
          )}
        </div>
      </div>

      {/* Personas row */}
      <PersonaRow ids={study.selectedPersonaIds} />

      {/* Tabs */}
      <div className="border-b border-[var(--border-2)]">
        <nav className="flex gap-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "border-b-2 px-4 py-2.5 text-sm font-medium transition",
                activeTab === tab.id ? "border-[var(--brand-700)] text-[var(--brand-700)]" : "border-transparent text-[var(--text-3)] hover:border-[var(--border-2)] hover:text-[var(--text-2)]",
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Plan tab */}
      {activeTab === "plan" && (
        <div className="app-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--text-2)]">Research plan</h2>
            {study.plan?.status === "LOCKED" && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--brand-200)] bg-[var(--mist)] px-2.5 py-1 text-[11px] font-semibold text-[var(--brand-700)]">
                <LockClosedIcon className="h-3 w-3" /> Locked
              </span>
            )}
          </div>

          {!study.plan && study.status === "PLAN_GENERATING" && (
            <div className="flex items-center gap-3 py-8 text-center">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--brand-700)] border-t-transparent" />
              <p className="text-sm text-[var(--text-3)]">Generating your research plan with AI…</p>
            </div>
          )}

          {!study.plan && study.status !== "PLAN_GENERATING" && (
            <div className="py-8 text-center">
              <SparklesIcon className="mx-auto mb-3 h-8 w-8 text-[var(--text-4)]" />
              <p className="mb-4 text-sm text-[var(--text-3)]">Generate a research plan based on your brief and personas.</p>
              <button
                type="button"
                onClick={() => generatePlan()}
                disabled={generating}
                className="inline-flex items-center gap-2 rounded-[10px] bg-[var(--brand-700)] px-5 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                <SparklesIcon className="h-4 w-4" />
                {generating ? "Generating…" : "Generate plan with AI"}
              </button>
            </div>
          )}

          {study.plan && study.plan.status !== "LOCKED" && (
            <PlanEditor study={study} onSaved={() => refetch()} />
          )}

          {study.plan?.status === "LOCKED" && (
            <div className="space-y-2">
              {study.plan.questions.map((q, i) => (
                <div key={q.id} className="flex items-start gap-3 rounded-[10px] bg-[var(--surface-1)] p-3.5">
                  <span className="mt-0.5 w-5 shrink-0 text-center text-xs font-medium text-[var(--text-4)]">{i + 1}</span>
                  <p className="text-sm text-[var(--text-1)]">{q.text}</p>
                </div>
              ))}
              <button type="button" onClick={() => {/* unlock */}} className="mt-2 text-xs text-[var(--text-4)] hover:text-[var(--text-2)]">
                Edit plan
              </button>
            </div>
          )}
        </div>
      )}

      {/* Sessions tab */}
      {activeTab === "sessions" && (
        <div className="space-y-3">
          {study.sessions.map((s) => <SessionCard key={s.id} session={s} />)}
        </div>
      )}

      {/* Report tab */}
      {activeTab === "report" && study.report && (
        <StudyReport report={study.report} />
      )}
    </div>
  );
}
