"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon } from "@heroicons/react/24/outline";
import { useCreateStudy, useStudyPersonas } from "@/hooks/use-study";
import { PERSONA_COLORS } from "@/config/study-personas";
import { cn } from "@/lib/format";

type SessionMode = "ONE_ON_ONE" | "GROUP";

function BriefScore({ title, problem, goals }: { title: string; problem: string; goals: string[] }) {
  const titleScore = Math.min(title.length / 60, 1) * 30;
  const problemScore = Math.min(problem.length / 200, 1) * 50;
  const goalScore = Math.min(goals.filter((g) => g.trim()).length / 3, 1) * 20;
  const total = Math.round(titleScore + problemScore + goalScore);
  const color = total >= 75 ? "bg-emerald-500" : total >= 40 ? "bg-amber-500" : "bg-[var(--border-2)]";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-[var(--text-4)]">
        <span>Brief quality</span>
        <span className="font-medium text-[var(--text-2)]">{total}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-1)]">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${total}%` }} />
      </div>
    </div>
  );
}

const STEPS = ["Brief", "Mode", "Personas", "Review"];

export function StudyWizard() {
  const router = useRouter();
  const { data: personas } = useStudyPersonas();
  const { mutateAsync: createStudy, isPending } = useCreateStudy();

  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [problemStatement, setProblemStatement] = useState("");
  const [goals, setGoals] = useState(["", "", ""]);
  const [sessionMode, setSessionMode] = useState<SessionMode>("ONE_ON_ONE");
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<string[]>([]);

  const filledGoals = goals.filter((g) => g.trim());

  const canAdvance = [
    title.trim() && problemStatement.trim() && filledGoals.length > 0,
    true, // mode always selected
    selectedPersonaIds.length > 0,
    true,
  ];

  function togglePersona(id: string) {
    setSelectedPersonaIds((prev) => prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]);
  }

  async function handleCreate() {
    const study = await createStudy({
      title: title.trim(),
      problemStatement: problemStatement.trim(),
      researchGoals: filledGoals,
      sessionMode,
      selectedPersonaIds,
    });
    router.push(`/app/study/${study.id}`);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      {/* Stepper */}
      <div className="flex items-center gap-0">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center">
            <button
              type="button"
              onClick={() => i < step && setStep(i)}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition",
                i === step ? "bg-[var(--brand-700)] text-white" : i < step ? "bg-emerald-100 text-emerald-700" : "bg-[var(--surface-1)] text-[var(--text-4)]",
              )}
            >
              {i < step ? <CheckIcon className="h-4 w-4" /> : i + 1}
            </button>
            <span className={cn("ml-2 text-sm font-medium", i === step ? "text-[var(--text-1)]" : "text-[var(--text-4)]")}>{s}</span>
            {i < STEPS.length - 1 && <div className="mx-4 h-px w-12 bg-[var(--border-2)]" />}
          </div>
        ))}
      </div>

      {/* Step 0 — Brief */}
      {step === 0 && (
        <div className="app-card space-y-5 p-6">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">Study title</label>
            <input className="app-input" placeholder="e.g. Onboarding flow evaluation" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">Problem statement</label>
            <textarea rows={3} className="app-input resize-none" placeholder="What problem are you trying to understand? Be specific." value={problemStatement} onChange={(e) => setProblemStatement(e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">Research goals</label>
            {goals.map((g, i) => (
              <input key={i} className="app-input mb-2" placeholder={`Goal ${i + 1}…`} value={g} onChange={(e) => setGoals((prev) => { const next = [...prev]; next[i] = e.target.value; return next; })} />
            ))}
          </div>
          <BriefScore title={title} problem={problemStatement} goals={goals} />
        </div>
      )}

      {/* Step 1 — Mode */}
      {step === 1 && (
        <div className="app-card space-y-4 p-6">
          <p className="text-sm font-medium text-[var(--text-2)]">How should personas be interviewed?</p>
          <div className="grid grid-cols-2 gap-4">
            {(["ONE_ON_ONE", "GROUP"] as SessionMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setSessionMode(mode)}
                className={cn(
                  "rounded-[10px] border p-5 text-left transition",
                  sessionMode === mode ? "border-[var(--brand-700)] bg-[var(--mist)]" : "border-[var(--border-2)] hover:bg-[var(--surface-1)]",
                )}
              >
                <p className="text-sm font-semibold text-[var(--text-1)]">{mode === "ONE_ON_ONE" ? "1-on-1 interviews" : "Group discussion"}</p>
                <p className="mt-1 text-xs text-[var(--text-3)]">
                  {mode === "ONE_ON_ONE" ? "Each persona is interviewed separately — deeper individual responses." : "All personas in one session — they challenge and build on each other."}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2 — Personas */}
      {step === 2 && (
        <div className="app-card space-y-4 p-6">
          <p className="text-sm font-medium text-[var(--text-2)]">Select personas to interview <span className="text-[var(--text-4)]">({selectedPersonaIds.length} selected)</span></p>
          <div className="grid grid-cols-2 gap-3">
            {(personas ?? []).map((p) => {
              const selected = selectedPersonaIds.includes(p.id);
              const colors = PERSONA_COLORS[p.color] ?? PERSONA_COLORS.violet;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => togglePersona(p.id)}
                  className={cn(
                    "flex items-start gap-3 rounded-[10px] border p-3.5 text-left transition",
                    selected ? "border-[var(--brand-700)] bg-[var(--mist)]" : "border-[var(--border-2)] hover:bg-[var(--surface-1)]",
                  )}
                >
                  <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold", colors.bg, colors.text)}>
                    {p.initials}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--text-1)]">{p.name}</p>
                    <p className="text-[11px] text-[var(--text-3)]">{p.description}</p>
                    <span className={cn("mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold", colors.bg, colors.text)}>
                      {p.techComfort} tech
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 3 — Review */}
      {step === 3 && (
        <div className="app-card space-y-4 p-6">
          <p className="text-sm font-semibold text-[var(--text-1)]">Ready to create</p>
          <div className="space-y-2 rounded-[10px] bg-[var(--surface-1)] p-4 text-sm">
            <div className="flex gap-3"><span className="w-32 shrink-0 text-[var(--text-4)]">Title</span><span className="text-[var(--text-1)]">{title}</span></div>
            <div className="flex gap-3"><span className="w-32 shrink-0 text-[var(--text-4)]">Mode</span><span className="text-[var(--text-1)]">{sessionMode === "GROUP" ? "Group discussion" : "1-on-1 interviews"}</span></div>
            <div className="flex gap-3"><span className="w-32 shrink-0 text-[var(--text-4)]">Personas</span><span className="text-[var(--text-1)]">{selectedPersonaIds.length} selected</span></div>
            <div className="flex gap-3"><span className="w-32 shrink-0 text-[var(--text-4)]">Goals</span><span className="text-[var(--text-1)]">{filledGoals.length} defined</span></div>
          </div>
          <p className="text-xs text-[var(--text-4)]">You can generate the research plan and run sessions after creating the study.</p>
        </div>
      )}

      {/* Nav buttons */}
      <div className="flex justify-between">
        <button type="button" onClick={() => step > 0 ? setStep(step - 1) : undefined} className={cn("rounded-[10px] border border-[var(--border-2)] px-4 py-2 text-sm font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]", step === 0 && "opacity-0 pointer-events-none")}>
          Back
        </button>
        {step < STEPS.length - 1 ? (
          <button type="button" onClick={() => canAdvance[step] && setStep(step + 1)} disabled={!canAdvance[step]} className="rounded-[10px] bg-[var(--brand-700)] px-5 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40">
            Continue
          </button>
        ) : (
          <button type="button" onClick={handleCreate} disabled={isPending} className="rounded-[10px] bg-[var(--brand-700)] px-5 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40">
            {isPending ? "Creating…" : "Create study"}
          </button>
        )}
      </div>
    </div>
  );
}
