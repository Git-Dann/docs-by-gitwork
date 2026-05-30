"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, BuildingOffice2Icon } from "@heroicons/react/24/outline";
import { useCreateStudy, useStudyPersonas } from "@/hooks/use-study";
import { useClientList } from "@/hooks/use-proposals";
import { PERSONA_COLORS } from "@/config/study-personas";
import { cn } from "@/lib/format";
import { Button } from "@/components/ui/button";

type SessionMode = "ONE_ON_ONE" | "GROUP";

function BriefScore({ title, problem, goals }: { title: string; problem: string; goals: string[] }) {
  const titleScore = Math.min(title.length / 60, 1) * 30;
  const problemScore = Math.min(problem.length / 200, 1) * 50;
  const goalScore = Math.min(goals.filter((g) => g.trim()).length / 3, 1) * 20;
  const total = Math.round(titleScore + problemScore + goalScore);
  const color = total >= 75 ? "bg-emerald-500" : total >= 40 ? "bg-amber-500" : "bg-[var(--border-2)]";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-4)]">
          BRIEF QUALITY
        </span>
        <span className="font-mono text-[11px] font-semibold text-[var(--text-2)]">
          {total}%
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-1)]">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${total}%` }} />
      </div>
    </div>
  );
}

const STEPS = ["Brief", "Mode", "Personas", "Client", "Review"];

export function StudyWizard() {
  const router = useRouter();
  const { data: personas } = useStudyPersonas();
  const { data: clientsData } = useClientList();
  const { mutateAsync: createStudy, isPending } = useCreateStudy();

  const manualClients = (clientsData?.clients ?? []).filter((c) => c.source === "MANUAL");

  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [problemStatement, setProblemStatement] = useState("");
  const [goals, setGoals] = useState(["", "", ""]);
  const [sessionMode, setSessionMode] = useState<SessionMode>("ONE_ON_ONE");
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<string[]>([]);
  const [workspaceClientId, setWorkspaceClientId] = useState<string | null>(null);

  const filledGoals = goals.filter((g) => g.trim());

  const canAdvance = [
    title.trim() && problemStatement.trim() && filledGoals.length > 0,
    true,
    selectedPersonaIds.length > 0,
    true, // client step is optional
    true,
  ];

  function togglePersona(id: string) {
    setSelectedPersonaIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  async function handleCreate() {
    const study = await createStudy({
      title: title.trim(),
      problemStatement: problemStatement.trim(),
      researchGoals: filledGoals,
      sessionMode,
      selectedPersonaIds,
      workspaceClientId,
    } as Parameters<typeof createStudy>[0] & { workspaceClientId: string | null });
    router.push(`/app/study/${study.id}`);
  }

  const selectedClient = manualClients.find((c) => c.id === workspaceClientId);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {/* 00 // STEPPER */}
      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label">
            <span className="widget-header__label--number">00</span>
            {" // NEW STUDY"}
          </span>
          <span className="widget-header__status">
            STEP {step + 1} OF {STEPS.length}
          </span>
        </div>
        <div className="flex items-center gap-0 overflow-x-auto px-5 py-4">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center">
              <button
                type="button"
                onClick={() => i < step && setStep(i)}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition",
                  i === step
                    ? "bg-[var(--brand-700)] text-white"
                    : i < step
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-[var(--surface-1)] text-[var(--text-4)]",
                )}
              >
                {i < step ? <CheckIcon className="h-4 w-4" /> : i + 1}
              </button>
              <span
                className={cn(
                  "ml-2 text-sm font-medium whitespace-nowrap",
                  i === step ? "text-[var(--text-1)]" : "text-[var(--text-4)]",
                )}
              >
                {s}
              </span>
              {i < STEPS.length - 1 && <div className="mx-3 h-px w-8 bg-[var(--border-2)]" />}
            </div>
          ))}
        </div>
      </section>

      {/* Step 0 — Brief */}
      {step === 0 && (
        <section className="widget-card">
          <div className="widget-header">
            <span className="widget-header__label">
              <span className="widget-header__label--number">01</span>
              {" // BRIEF"}
            </span>
          </div>
          <div className="space-y-5 px-6 py-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">Study title</label>
              <input
                className="app-input"
                placeholder="e.g. Onboarding flow evaluation"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">Problem statement</label>
              <textarea
                rows={3}
                className="app-input resize-none"
                placeholder="What problem are you trying to understand? Be specific."
                value={problemStatement}
                onChange={(e) => setProblemStatement(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">Research goals</label>
              {goals.map((g, i) => (
                <input
                  key={i}
                  className="app-input mb-2"
                  placeholder={`Goal ${i + 1}…`}
                  value={g}
                  onChange={(e) =>
                    setGoals((prev) => {
                      const next = [...prev];
                      next[i] = e.target.value;
                      return next;
                    })
                  }
                />
              ))}
            </div>
            <BriefScore title={title} problem={problemStatement} goals={goals} />
          </div>
        </section>
      )}

      {/* Step 1 — Mode */}
      {step === 1 && (
        <section className="widget-card">
          <div className="widget-header">
            <span className="widget-header__label">
              <span className="widget-header__label--number">02</span>
              {" // INTERVIEW MODE"}
            </span>
          </div>
          <div className="space-y-4 px-6 py-5">
            <p className="text-sm font-medium text-[var(--text-2)]">How should personas be interviewed?</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(["ONE_ON_ONE", "GROUP"] as SessionMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setSessionMode(mode)}
                  className={cn(
                    "rounded-[10px] border p-5 text-left transition",
                    sessionMode === mode
                      ? "border-[var(--brand-700)] bg-[var(--mist)]"
                      : "border-[var(--border-2)] hover:bg-[var(--surface-1)]",
                  )}
                >
                  <p className="text-sm font-semibold text-[var(--text-1)]">
                    {mode === "ONE_ON_ONE" ? "1-on-1 interviews" : "Group discussion"}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-3)]">
                    {mode === "ONE_ON_ONE"
                      ? "Each persona is interviewed separately — deeper individual responses."
                      : "All personas in one session — they challenge and build on each other."}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Step 2 — Personas */}
      {step === 2 && (
        <section className="widget-card">
          <div className="widget-header">
            <span className="widget-header__label">
              <span className="widget-header__label--number">03</span>
              {" // PERSONAS"}
            </span>
            <span className="widget-header__status">{selectedPersonaIds.length} SELECTED</span>
          </div>
          <div className="space-y-4 px-6 py-5">
            <p className="text-sm font-medium text-[var(--text-2)]">Select personas to interview</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                      selected
                        ? "border-[var(--brand-700)] bg-[var(--mist)]"
                        : "border-[var(--border-2)] hover:bg-[var(--surface-1)]",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                        colors.bg,
                        colors.text,
                      )}
                    >
                      {p.initials}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[var(--text-1)]">{p.name}</p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-[var(--text-3)]">
                        {p.description}
                      </p>
                      <span
                        className={cn(
                          "mt-1.5 inline-block rounded-[4px] px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em]",
                          colors.bg,
                          colors.text,
                        )}
                      >
                        {p.techComfort} TECH
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Step 3 — Client */}
      {step === 3 && (
        <section className="widget-card">
          <div className="widget-header">
            <span className="widget-header__label">
              <span className="widget-header__label--number">04</span>
              {" // PORTAL CLIENT"}
            </span>
            <span className="widget-header__status">OPTIONAL</span>
          </div>
          <div className="space-y-4 px-6 py-5">
            <p className="text-sm text-[var(--text-3)]">
              Link this study to a Portal client so the report surfaces on their record. Skip if it&apos;s an internal study.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setWorkspaceClientId(null)}
                className={cn(
                  "rounded-[10px] border p-3 text-left transition",
                  workspaceClientId === null
                    ? "border-[var(--brand-700)] bg-[var(--mist)]"
                    : "border-[var(--border-2)] hover:bg-[var(--surface-1)]",
                )}
              >
                <p className="text-sm font-semibold text-[var(--text-1)]">No client (internal)</p>
                <p className="mt-0.5 text-[11px] text-[var(--text-3)]">Keep this study unattached.</p>
              </button>
              {manualClients.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setWorkspaceClientId(c.id)}
                  className={cn(
                    "flex items-center gap-3 rounded-[10px] border p-3 text-left transition",
                    workspaceClientId === c.id
                      ? "border-[var(--brand-700)] bg-[var(--mist)]"
                      : "border-[var(--border-2)] hover:bg-[var(--surface-1)]",
                  )}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)]">
                    {c.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.logoUrl} alt={c.name} className="h-full w-full object-cover" />
                    ) : (
                      <BuildingOffice2Icon className="h-4 w-4 text-[var(--text-4)]" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--text-1)]">{c.name}</p>
                    <p className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-4)]">
                      {c.proposalCount} DOC{c.proposalCount !== 1 ? "S" : ""}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Step 4 — Review */}
      {step === 4 && (
        <section className="widget-card">
          <div className="widget-header">
            <span className="widget-header__label">
              <span className="widget-header__label--number">05</span>
              {" // REVIEW"}
            </span>
          </div>
          <div className="space-y-4 px-6 py-5">
            <p
              className="text-3xl leading-none tracking-[-0.03em] text-[var(--text-1)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Ready to create
            </p>
            <dl className="space-y-2 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] p-4 text-sm">
              {[
                ["TITLE", title],
                ["MODE", sessionMode === "GROUP" ? "Group discussion" : "1-on-1 interviews"],
                ["PERSONAS", `${selectedPersonaIds.length} selected`],
                ["GOALS", `${filledGoals.length} defined`],
                ["CLIENT", selectedClient?.name ?? "None (internal)"],
              ].map(([label, value]) => (
                <div key={label} className="flex gap-3">
                  <dt className="w-32 shrink-0 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-4)]">
                    {label}
                  </dt>
                  <dd className="text-[var(--text-1)]">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-[var(--text-4)]">
              You can generate the research plan and run sessions after creating the study.
            </p>
          </div>
        </section>
      )}

      {/* Nav buttons */}
      <div className="flex justify-between">
        <div className={cn(step === 0 && "opacity-0 pointer-events-none")}>
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={() => (step > 0 ? setStep(step - 1) : undefined)}
          >
            Back
          </Button>
        </div>
        {step < STEPS.length - 1 ? (
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={() => canAdvance[step] && setStep(step + 1)}
            disabled={!canAdvance[step]}
          >
            Continue
          </Button>
        ) : (
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={handleCreate}
            loading={isPending}
          >
            {isPending ? "Creating…" : "Create study"}
          </Button>
        )}
      </div>
    </div>
  );
}
