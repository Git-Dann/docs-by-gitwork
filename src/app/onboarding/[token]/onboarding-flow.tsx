"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircleIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/24/outline";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/format";
import { fieldIdSet, isFieldVisible } from "@/lib/onboarding/structure";
import type {
  OnboardingAnswers,
  OnboardingAnswerValue,
  OnboardingFieldDef,
  OnboardingFormStructure,
} from "@/types/onboarding";
import {
  FieldRenderer,
  type BankInput,
  type BankSummary,
} from "@/components/onboarding/field-renderer";

// ─── Types matching the public API payload ────────────────────────────────────

type SessionStatus = "IN_PROGRESS" | "SUBMITTED" | "LINKED";

export type OnboardingSession = {
  status: SessionStatus;
  currentStep: number;
  structure: OnboardingFormStructure;
  fields: Record<string, string | null>;
  answers: OnboardingAnswers;
  bank: BankSummary;
  submittedAt: string | null;
};

/** Compact one-line summary of a field's answer for the review screen. */
function fieldSummary(field: OnboardingFieldDef, answers: OnboardingAnswers): string {
  const raw = answers[field.id];
  if (field.type === "checkbox") return raw === true ? field.label : "";
  if (field.type === "multiselect") {
    const arr = Array.isArray(raw) ? raw : [];
    return arr.map((v) => field.options?.find((o) => o.id === v)?.label ?? String(v)).join(", ");
  }
  if (field.type === "select") {
    if (raw == null || raw === "") return "";
    return field.options?.find((o) => o.id === raw)?.label ?? String(raw);
  }
  return typeof raw === "string" ? raw.trim() : "";
}

export function OnboardingFlow({
  token,
  initialSession,
}: {
  token: string;
  initialSession: OnboardingSession;
}) {
  const structure = initialSession.structure;
  const steps = useMemo(() => structure.steps, [structure]);
  // Screens: 0 = welcome, 1..steps.length = wizard steps, steps.length + 1 = review.
  const lastIndex = steps.length + 1;

  const [step, setStep] = useState(() =>
    Math.max(0, Math.min(initialSession.currentStep, lastIndex)),
  );
  const [answers, setAnswers] = useState<OnboardingAnswers>(initialSession.answers);
  const [bankInput, setBankInput] = useState<BankInput>({
    accountHolder: "",
    bankName: "",
    sortCode: "",
    accountNumber: "",
    iban: "",
    swiftBic: "",
    currency: initialSession.bank.currency ?? "GBP",
  });
  const [bankSummary, setBankSummary] = useState<BankSummary>(initialSession.bank);
  const [status, setStatus] = useState<SessionStatus>(initialSession.status);
  const [submittedAt, setSubmittedAt] = useState<string | null>(initialSession.submittedAt);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedHint, setSavedHint] = useState(false);
  const savedHintTimer = useRef<number | null>(null);

  const readOnly = status !== "IN_PROGRESS";

  const idSet = useMemo(() => fieldIdSet(structure), [structure]);

  const setAnswer = (id: string, value: OnboardingAnswerValue) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  };

  const setBank = (key: keyof BankInput) => (value: string) => {
    setBankInput((prev) => ({ ...prev, [key]: value }));
  };

  const flashSaved = useCallback(() => {
    setSavedHint(true);
    if (savedHintTimer.current) window.clearTimeout(savedHintTimer.current);
    savedHintTimer.current = window.setTimeout(() => setSavedHint(false), 1600);
  }, []);

  useEffect(
    () => () => {
      if (savedHintTimer.current) window.clearTimeout(savedHintTimer.current);
    },
    [],
  );

  // Persist answers + currentStep. Caller decides when (Next button / debounce).
  const autosave = useCallback(
    async (overrides?: { currentStep?: number; answers?: OnboardingAnswers }) => {
      if (readOnly) return true;
      setSaving(true);
      setError(null);
      try {
        const payload = {
          answers: overrides?.answers ?? answers,
          currentStep: overrides?.currentStep ?? step,
        };
        const res = await fetch(`/api/onboarding/${token}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const { error: msg } = await res.json().catch(() => ({ error: "Save failed" }));
          throw new Error(msg ?? "Save failed");
        }
        flashSaved();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [answers, readOnly, step, token, flashSaved],
  );

  // Live autosave — persist ~1.2s after the client stops typing, so a half-filled
  // step survives leaving and coming back. Skipped on the welcome screen.
  const firstFieldsRender = useRef(true);
  useEffect(() => {
    if (readOnly || step === 0) return;
    if (firstFieldsRender.current) {
      firstFieldsRender.current = false;
      return;
    }
    const id = window.setTimeout(() => {
      void autosave({ currentStep: step });
    }, 1200);
    return () => window.clearTimeout(id);
  }, [answers, step, readOnly, autosave]);

  const persistBank = useCallback(async () => {
    if (readOnly) return true;
    const trimmed = {
      accountHolder: bankInput.accountHolder.trim(),
      bankName: bankInput.bankName.trim(),
      sortCode: bankInput.sortCode.trim(),
      accountNumber: bankInput.accountNumber.trim(),
      iban: bankInput.iban.trim(),
      swiftBic: bankInput.swiftBic.trim(),
      currency: bankInput.currency.trim().toUpperCase(),
    };
    if (Object.values(trimmed).every((v) => !v)) {
      // Nothing entered — skip the network round-trip.
      return true;
    }
    const payload: Record<string, string | null> = {};
    if (trimmed.accountHolder) payload.accountHolder = trimmed.accountHolder;
    if (trimmed.bankName) payload.bankName = trimmed.bankName;
    if (trimmed.sortCode) payload.sortCode = trimmed.sortCode;
    if (trimmed.accountNumber) payload.accountNumber = trimmed.accountNumber;
    if (trimmed.iban) payload.iban = trimmed.iban;
    if (trimmed.swiftBic) payload.swiftBic = trimmed.swiftBic;
    if (trimmed.currency) payload.currency = trimmed.currency;

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/onboarding/${token}/bank`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({ error: "Save failed" }));
        throw new Error(msg ?? "Save failed");
      }
      const json = (await res.json()) as { session: OnboardingSession };
      setBankSummary(json.session.bank);
      setBankInput({
        accountHolder: "",
        bankName: "",
        sortCode: "",
        accountNumber: "",
        iban: "",
        swiftBic: "",
        currency: trimmed.currency || "GBP",
      });
      flashSaved();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      return false;
    } finally {
      setSaving(false);
    }
  }, [bankInput, readOnly, token, flashSaved]);

  const currentStepDef = step >= 1 && step <= steps.length ? steps[step - 1] : null;
  const currentHasBank = Boolean(currentStepDef?.fields.some((f) => f.type === "bank_details"));

  const goTo = async (nextStep: number) => {
    if (nextStep === step) return;
    if (!readOnly) {
      const ok = currentHasBank
        ? (await persistBank()) && (await autosave({ currentStep: nextStep }))
        : await autosave({ currentStep: nextStep });
      if (!ok) return;
    }
    setStep(nextStep);
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  const next = () => goTo(Math.min(step + 1, lastIndex));
  const back = () => goTo(Math.max(step - 1, 0));

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const fieldsOk = await autosave({ currentStep: step });
      if (!fieldsOk) return;
      const res = await fetch(`/api/onboarding/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({ error: "Submit failed" }));
        throw new Error(msg ?? "Submit failed");
      }
      const json = (await res.json()) as { session: OnboardingSession };
      setStatus(json.session.status);
      setSubmittedAt(json.session.submittedAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  // Required-field gate for the current step (respects showIf visibility).
  const canAdvance = (() => {
    if (readOnly) return true;
    if (!currentStepDef) return true; // welcome / review
    return currentStepDef.fields.every((f) => {
      if (!f.required || !isFieldVisible(f, answers, idSet)) return true;
      const v = answers[f.id];
      if (f.type === "checkbox") return v === true;
      if (f.type === "multiselect") return Array.isArray(v) && v.length > 0;
      return typeof v === "string" ? v.trim().length > 0 : v != null;
    });
  })();

  const bankBundle = { input: bankInput, setBank, summary: bankSummary };
  const welcome = structure.welcome;

  // ─── Step 0 — Welcome (2-column landing) ─────────────────────────────────

  if (step === 0) {
    return (
      <div className="flex min-h-screen flex-col bg-[var(--surface-canvas)] md:h-screen md:flex-row md:overflow-hidden">
        {/* Left — DocumentCover-style hero (aligns with Docs proposals/reports) */}
        <div className="relative h-60 w-full overflow-hidden sm:h-72 md:h-full md:w-1/2 md:flex-shrink-0">
          <div
            aria-hidden
            className="absolute inset-0"
            style={{ background: "linear-gradient(140deg, #1D4ED8 0%, #1E3A8A 100%)" }}
          />
          <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-[340px] w-[340px] rounded-full border border-white/10" />
          <div aria-hidden className="pointer-events-none absolute -right-8 -top-8 h-[200px] w-[200px] rounded-full border border-white/[0.08]" />
          <div className="relative z-10 flex h-full flex-col justify-between p-8 text-white md:p-12">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
              Gitwork // Onboarding
            </p>
            <h1
              className="font-display text-3xl leading-[1.08] tracking-[-0.025em] md:text-5xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {welcome.heading}
            </h1>
            <p className="font-mono text-[11px] text-white/45">gitwork.co.uk</p>
          </div>
        </div>

        {/* Right — copy + CTA */}
        <div className="flex flex-1 items-center justify-center bg-[var(--surface-canvas)] px-6 py-12 md:px-12">
          <div className="w-full max-w-md space-y-7">
            <div className="space-y-2">
              {welcome.eyebrow ? (
                <p className="font-mono text-[11px] font-semibold tracking-[0.18em] uppercase text-[var(--text-4)]">
                  {welcome.eyebrow}
                </p>
              ) : null}
              {welcome.subheading ? (
                <h2 className="text-2xl font-semibold text-[var(--text-1)]">{welcome.subheading}</h2>
              ) : null}
            </div>
            {welcome.bullets.length > 0 && (
              <ul className="space-y-3 text-sm leading-relaxed text-[var(--text-3)]">
                {welcome.bullets.map((bullet, i) => (
                  <li key={i} className="flex gap-2">
                    <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-700)]" />
                    {bullet}
                  </li>
                ))}
              </ul>
            )}
            {readOnly ? (
              <div className="rounded-[10px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {status === "LINKED"
                  ? "Your client account is being set up — Gitwork is taking it from here."
                  : `Submitted${
                      submittedAt ? ` on ${new Date(submittedAt).toLocaleDateString()}` : ""
                    }. We'll be in touch shortly.`}
              </div>
            ) : (
              <Button onClick={() => goTo(1)} variant="primary" className="app-button-lg w-full">
                {welcome.ctaLabel || "Get started"}
                <ArrowRightIcon className="ml-1 h-4 w-4" />
              </Button>
            )}
            {error && <p className="text-sm text-[var(--danger-500)]">{error}</p>}
          </div>
        </div>
      </div>
    );
  }

  // ─── Steps 1..N + Review — Wizard ────────────────────────────────────────

  const isReview = step === lastIndex;
  const screenTitle = isReview ? "Review & submit" : currentStepDef?.title ?? "";
  const visibleFields = currentStepDef
    ? currentStepDef.fields.filter((f) => isFieldVisible(f, answers, idSet))
    : [];

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)]">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src="/foundry-logo.png" alt="Foundry" width={28} height={28} className="rounded-md" />
            <span className="text-sm font-semibold text-[var(--text-2)]">Gitwork onboarding</span>
          </div>
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]">
            Step {step} of {lastIndex}
          </span>
        </div>

        {/* Stepper */}
        <section className="widget-card mb-5">
          <div className="widget-header">
            <span className="widget-header__label">
              <span className="widget-header__label--number">{step < 10 ? `0${step}` : step}</span>
              {" // "}
              {screenTitle.toUpperCase()}
            </span>
            <span className="widget-header__status" aria-live="polite">
              {readOnly ? "READ ONLY" : saving ? "SAVING…" : savedHint ? "SAVED ✓" : "AUTOSAVED"}
            </span>
          </div>
          <div className="px-5 py-3">
            <div className="flex items-center gap-1">
              {Array.from({ length: lastIndex }, (_, i) => {
                const idx = i + 1;
                const reached = idx <= step;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => idx < step && goTo(idx)}
                    disabled={idx >= step || readOnly}
                    className={cn(
                      "h-1.5 flex-1 rounded-full transition",
                      reached ? "bg-[var(--brand-700)]" : "bg-[var(--border-2)]",
                      idx < step && !readOnly && "cursor-pointer hover:bg-[var(--brand-800)]",
                    )}
                    aria-label={`Go to step ${idx}`}
                  />
                );
              })}
            </div>
          </div>
        </section>

        {/* Step body */}
        <section className="widget-card">
          <div className="widget-body space-y-5">
            {readOnly && (
              <div className="rounded-[10px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {status === "LINKED"
                  ? "This onboarding is linked to your client record. To make changes, contact Gitwork."
                  : "Submitted — thanks! We've received your details and will be in touch shortly."}
              </div>
            )}

            {isReview ? (
              <ReviewScreen
                structure={structure}
                steps={steps}
                answers={answers}
                bankSummary={bankSummary}
                onEditStep={(idx) => goTo(idx)}
                readOnly={readOnly}
                token={token}
              />
            ) : currentStepDef ? (
              <>
                {currentStepDef.blurb ? (
                  <p className="text-sm text-[var(--text-3)]">{currentStepDef.blurb}</p>
                ) : null}
                <div className="flex flex-wrap gap-4">
                  {visibleFields.map((field) => (
                    <div
                      key={field.id}
                      className={field.config?.width === "half" ? "w-full sm:w-[calc(50%-0.5rem)]" : "w-full"}
                    >
                      <FieldRenderer
                        field={field}
                        answers={answers}
                        setAnswer={setAnswer}
                        readOnly={readOnly}
                        bank={bankBundle}
                      />
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </section>

        {/* Nav */}
        <div className="mt-5 flex items-center justify-between gap-3">
          <Button variant="secondary" onClick={back} disabled={saving || submitting} className="app-button-md">
            <ArrowLeftIcon className="mr-1 h-4 w-4" />
            Back
          </Button>
          {error && <p className="flex-1 text-center text-sm text-[var(--danger-500)]">{error}</p>}
          {isReview ? (
            !readOnly ? (
              <Button
                variant="primary"
                onClick={submit}
                disabled={submitting || saving || !canAdvance}
                className="app-button-md"
              >
                {submitting ? "Submitting…" : "Submit onboarding"}
              </Button>
            ) : null
          ) : (
            <Button
              variant="primary"
              onClick={next}
              disabled={!canAdvance || saving || submitting}
              className="app-button-md"
            >
              Next
              <ArrowRightIcon className="ml-1 h-4 w-4" />
            </Button>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-[var(--text-4)]">
          Your link &mdash; bookmark it to return any time before submission.
        </p>
      </div>
    </div>
  );
}

// ─── Review screen ──────────────────────────────────────────────────────────────

function ReviewScreen({
  structure,
  steps,
  answers,
  bankSummary,
  onEditStep,
  readOnly,
  token,
}: {
  structure: OnboardingFormStructure;
  steps: OnboardingFormStructure["steps"];
  answers: OnboardingAnswers;
  bankSummary: BankSummary;
  onEditStep: (idx: number) => void;
  readOnly: boolean;
  token: string;
}) {
  const ids = fieldIdSet(structure);
  const rows = steps.map((s, i) => {
    const screenIdx = i + 1;
    const bankField = s.fields.find((f) => f.type === "bank_details");
    let value: string;
    if (bankField) {
      value = bankSummary.onFile
        ? `On file${bankSummary.accountNumberLast4 ? ` (••••${bankSummary.accountNumberLast4})` : ""}`
        : "Not provided";
    } else {
      const parts = s.fields
        .filter((f) => f.type !== "static" && f.type !== "bank_details" && isFieldVisible(f, answers, ids))
        .map((f) => fieldSummary(f, answers))
        .filter(Boolean);
      value = parts.join(" · ");
      if (value.length > 90) value = `${value.slice(0, 90)}…`;
    }
    return { screenIdx, label: s.title, value: value || "—" };
  });

  const review = structure.review;

  return (
    <>
      {review.blurb ? <p className="text-sm text-[var(--text-3)]">{review.blurb}</p> : null}
      <ul className="divide-y divide-[var(--border-3)] rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)]">
        {rows.map((row) => (
          <li key={row.screenIdx} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-4)]">
                {row.label}
              </p>
              <p className="truncate text-sm text-[var(--text-2)]">{row.value}</p>
            </div>
            {!readOnly && (
              <button
                type="button"
                onClick={() => onEditStep(row.screenIdx)}
                className="app-button app-button-tertiary app-button-xs"
              >
                Edit
              </button>
            )}
          </li>
        ))}
      </ul>
      <a
        href={`/api/onboarding/${token}/pdf`}
        target="_blank"
        rel="noreferrer"
        className="app-button app-button-secondary app-button-sm w-full justify-center sm:w-auto"
      >
        <ArrowDownTrayIcon className="h-4 w-4" />
        Download a copy (PDF)
      </a>
      <p className="text-xs text-[var(--text-4)]">Your bank details are never included in the download.</p>
      {!readOnly && (
        <>
          {review.legal ? (
            <div className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-3 text-xs leading-relaxed text-[var(--text-3)]">
              {review.legal}
            </div>
          ) : null}
          {review.agreement ? (
            <p className="text-xs leading-relaxed text-[var(--text-4)]">{review.agreement}</p>
          ) : null}
        </>
      )}
    </>
  );
}
