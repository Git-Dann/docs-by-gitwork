"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircleIcon, ArrowRightIcon, ArrowLeftIcon } from "@heroicons/react/24/outline";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/format";

// ─── Types matching the public API payload ────────────────────────────────────

type SessionStatus = "IN_PROGRESS" | "SUBMITTED" | "LINKED";

type SessionStringFields = {
  contactFirstName: string | null;
  contactLastName: string | null;
  contactEmail: string | null;
  contactRole: string | null;
  contactPhone: string | null;
  invoiceEmail: string | null;
  companyName: string | null;
  legalCompanyName: string | null;
  companyNumber: string | null;
  vatNumber: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  county: string | null;
  postcode: string | null;
  country: string | null;
  billingAddressLine1: string | null;
  billingAddressLine2: string | null;
  billingCity: string | null;
  billingCounty: string | null;
  billingPostcode: string | null;
  billingCountry: string | null;
  productName: string | null;
  productUrl: string | null;
  productDescription: string | null;
  projectGoals: string | null;
};

type StringFieldKey = keyof SessionStringFields;

type SessionFields = SessionStringFields & {
  billingDiffers: boolean;
};

type BankSummary = {
  onFile: boolean;
  currency: string | null;
  accountNumberLast4: string | null;
};

export type OnboardingSession = {
  status: SessionStatus;
  currentStep: number;
  fields: SessionFields;
  bank: BankSummary;
  submittedAt: string | null;
};

type BankInput = {
  accountHolder: string;
  bankName: string;
  sortCode: string;
  accountNumber: string;
  iban: string;
  swiftBic: string;
  currency: string;
};

const STEPS = [
  { key: "welcome", title: "Welcome" },
  { key: "you", title: "About you" },
  { key: "company", title: "Company & billing" },
  { key: "product", title: "Your product" },
  { key: "goals", title: "What you're hoping for" },
  { key: "bank", title: "Bank details" },
  { key: "review", title: "Review & submit" },
] as const;

const COUNTRY_DEFAULT = "United Kingdom";

// Strip out the null-vs-string awkwardness for inputs.
function s(value: string | null | undefined): string {
  return value ?? "";
}

// Format a UK sort code as the client types: digits only, grouped as XX-XX-XX.
function formatSortCode(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 6);
  return digits.replace(/(\d{2})(?=\d)/g, "$1-");
}

export function OnboardingFlow({
  token,
  initialSession,
}: {
  token: string;
  initialSession: OnboardingSession;
}) {
  const [step, setStep] = useState(initialSession.currentStep);
  const [fields, setFields] = useState<SessionFields>(initialSession.fields);
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
  const [submittedAt, setSubmittedAt] = useState<string | null>(
    initialSession.submittedAt,
  );
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedHint, setSavedHint] = useState(false);
  const savedHintTimer = useRef<number | null>(null);

  const readOnly = status !== "IN_PROGRESS";

  const setField = (key: StringFieldKey) => (value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  };

  const setBillingDiffers = (value: boolean) => {
    setFields((prev) => ({ ...prev, billingDiffers: value }));
  };

  const setBank = (key: keyof BankInput) => (value: string) => {
    setBankInput((prev) => ({ ...prev, [key]: value }));
  };

  const flashSaved = useCallback(() => {
    setSavedHint(true);
    if (savedHintTimer.current) window.clearTimeout(savedHintTimer.current);
    savedHintTimer.current = window.setTimeout(() => setSavedHint(false), 1600);
  }, []);

  useEffect(() => () => {
    if (savedHintTimer.current) window.clearTimeout(savedHintTimer.current);
  }, []);

  // Persist non-bank fields + currentStep. Caller decides when (Next button etc.)
  const autosave = useCallback(
    async (overrides?: { currentStep?: number; fields?: Partial<SessionFields> }) => {
      if (readOnly) return true;
      setSaving(true);
      setError(null);
      try {
        const payload = {
          ...(overrides?.fields ?? fields),
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
    [fields, readOnly, step, token, flashSaved],
  );

  const persistBank = useCallback(async () => {
    if (readOnly) return true;
    // Only send fields the user actually typed in this session (so an empty
    // input doesn't clobber a previous submission).
    const payload: Record<string, string | null> = {};
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
      // Clear the form so it doesn't show plaintext after a refresh.
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

  const goTo = async (nextStep: number) => {
    if (nextStep === step) return;
    // Save when leaving a step. Bank step uses its own endpoint.
    if (!readOnly) {
      const ok = STEPS[step].key === "bank"
        ? (await persistBank()) && (await autosave({ currentStep: nextStep }))
        : await autosave({ currentStep: nextStep });
      if (!ok) return;
    }
    setStep(nextStep);
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  const next = () => goTo(Math.min(step + 1, STEPS.length - 1));
  const back = () => goTo(Math.max(step - 1, 0));

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      // Final autosave so the server has the latest field values too.
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

  // Cross-step "can I advance?" rules.
  const canAdvance = (() => {
    if (readOnly) return true;
    switch (STEPS[step].key) {
      case "welcome":
        return true;
      case "you":
        return Boolean(fields.contactFirstName?.trim() && fields.contactEmail?.trim());
      case "company":
        return Boolean(fields.companyName?.trim());
      case "product":
        return true; // product fields are optional during onboarding
      case "goals":
        return true;
      case "bank":
        return true; // bank step is optional — client can finish without it
      case "review":
        return true;
      default:
        return true;
    }
  })();

  // ─── Step 0 — Welcome (2-column landing) ─────────────────────────────────

  if (step === 0) {
    return (
      <div className="flex min-h-screen flex-col bg-[var(--surface-canvas)] md:h-screen md:flex-row md:overflow-hidden">
        {/* Left — full-bleed image / placeholder */}
        <div className="relative h-56 w-full overflow-hidden sm:h-64 md:h-full md:w-1/2 md:flex-shrink-0">
          {/* Swap this gradient for a real hero by dropping an image into
              /public/onboarding-hero.jpg and uncommenting the Image below. */}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(135deg, var(--brand-400) 0%, var(--brand-700) 46%, var(--brand-900) 100%)",
            }}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/onboarding-hero.jpg"
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-300"
            onLoad={(e) => {
              (e.target as HTMLImageElement).style.opacity = "1";
            }}
            onError={(e) => {
              // Hero asset hasn't been provided yet — fall back to the
              // gradient layer beneath. Don't surface the error to the user.
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
          <div className="absolute inset-0 bg-black/20" aria-hidden />
          <div className="relative z-10 flex h-full flex-col justify-between p-8 text-white md:p-12">
            <div className="flex items-center gap-2 font-mono text-[11px] font-semibold tracking-[0.18em] uppercase">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-white/90" />
              Gitwork
            </div>
            <div>
              <p className="font-mono text-[11px] font-semibold tracking-[0.18em] uppercase opacity-80">
                Welcome
              </p>
              <h1
                className="mt-3 font-display text-3xl leading-tight md:text-5xl"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Let&apos;s get to know your project.
              </h1>
            </div>
          </div>
        </div>

        {/* Right — copy + CTA */}
        <div className="flex flex-1 items-center justify-center bg-[var(--surface-canvas)] px-6 py-12 md:px-12">
          <div className="w-full max-w-md space-y-7">
            <div className="space-y-2">
              <p className="font-mono text-[11px] font-semibold tracking-[0.18em] uppercase text-[var(--text-4)]">
                Onboarding · ~3 mins
              </p>
              <h2 className="text-2xl font-semibold text-[var(--text-1)]">
                A quick walk-through of who you are and what you&apos;re building.
              </h2>
            </div>
            <ul className="space-y-3 text-sm leading-relaxed text-[var(--text-3)]">
              <li className="flex gap-2">
                <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-700)]" />
                Save and resume anytime — your answers are stored against this private link.
              </li>
              <li className="flex gap-2">
                <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-700)]" />
                Bank details are encrypted at rest. Only Gitwork staff can see them.
              </li>
              <li className="flex gap-2">
                <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-700)]" />
                Once you submit, our team will review your details and get back to you shortly.
              </li>
            </ul>
            {readOnly ? (
              <div className="rounded-[10px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {status === "LINKED"
                  ? "Your client account is being set up — Gitwork is taking it from here."
                  : `Submitted${
                      submittedAt
                        ? ` on ${new Date(submittedAt).toLocaleDateString()}`
                        : ""
                    }. We'll be in touch shortly.`}
              </div>
            ) : (
              <Button
                onClick={() => goTo(1)}
                variant="primary"
                className="app-button-lg w-full"
              >
                Get started
                <ArrowRightIcon className="ml-1 h-4 w-4" />
              </Button>
            )}
            {error && (
              <p className="text-sm text-[var(--danger-500)]">{error}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Steps 1..6 — Wizard ────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)]">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/foundry-logo.png"
              alt="Foundry"
              width={28}
              height={28}
              className="rounded-md"
            />
            <span className="text-sm font-semibold text-[var(--text-2)]">
              Gitwork onboarding
            </span>
          </div>
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]">
            Step {step} of {STEPS.length - 1}
          </span>
        </div>

        {/* Stepper */}
        <section className="widget-card mb-5">
          <div className="widget-header">
            <span className="widget-header__label">
              <span className="widget-header__label--number">0{step}</span>
              {" // "}
              {STEPS[step].title.toUpperCase()}
            </span>
            <span
              className="widget-header__status"
              aria-live="polite"
            >
              {readOnly
                ? "READ ONLY"
                : saving
                  ? "SAVING…"
                  : savedHint
                    ? "SAVED ✓"
                    : "AUTOSAVED"}
            </span>
          </div>
          <div className="px-5 py-3">
            <div className="flex items-center gap-1">
              {STEPS.slice(1).map((s, i) => {
                const idx = i + 1;
                const reached = idx <= step;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => idx < step && goTo(idx)}
                    disabled={idx >= step || readOnly}
                    className={cn(
                      "h-1.5 flex-1 rounded-full transition",
                      reached ? "bg-[var(--brand-700)]" : "bg-[var(--border-2)]",
                      idx < step && !readOnly && "cursor-pointer hover:bg-[var(--brand-800)]",
                    )}
                    aria-label={`Go to step ${idx}: ${s.title}`}
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

            {STEPS[step].key === "you" && (
              <StepYou fields={fields} setField={setField} readOnly={readOnly} />
            )}
            {STEPS[step].key === "company" && (
              <StepCompany
                fields={fields}
                setField={setField}
                setBillingDiffers={setBillingDiffers}
                readOnly={readOnly}
              />
            )}
            {STEPS[step].key === "product" && (
              <StepProduct fields={fields} setField={setField} readOnly={readOnly} />
            )}
            {STEPS[step].key === "goals" && (
              <StepGoals fields={fields} setField={setField} readOnly={readOnly} />
            )}
            {STEPS[step].key === "bank" && (
              <StepBank
                bankInput={bankInput}
                setBank={setBank}
                bankSummary={bankSummary}
                readOnly={readOnly}
              />
            )}
            {STEPS[step].key === "review" && (
              <StepReview
                fields={fields}
                bankSummary={bankSummary}
                onEditStep={(i) => goTo(i)}
                readOnly={readOnly}
              />
            )}
          </div>
        </section>

        {/* Nav */}
        <div className="mt-5 flex items-center justify-between gap-3">
          <Button
            variant="secondary"
            onClick={back}
            disabled={saving || submitting}
            className="app-button-md"
          >
            <ArrowLeftIcon className="mr-1 h-4 w-4" />
            Back
          </Button>
          {error && (
            <p className="flex-1 text-center text-sm text-[var(--danger-500)]">
              {error}
            </p>
          )}
          {STEPS[step].key === "review" ? (
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

// ─── Field primitives ─────────────────────────────────────────────────────────

function Field({
  label,
  children,
  hint,
  required,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  required?: boolean;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="app-field-label">
        {label}
        {required && <span className="ml-1 text-[var(--danger-500)]">*</span>}
      </span>
      {children}
      {hint && <span className="app-field-hint">{hint}</span>}
    </label>
  );
}

type TextInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "onChange" | "value" | "readOnly"
> & {
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
};

function TextInput({ value, onChange, readOnly, ...rest }: TextInputProps) {
  return (
    <input
      // text-base (16px) on mobile stops iOS Safari zooming in on focus;
      // back to 14px from sm: up. Taller min-height = comfortable mobile taps.
      className="app-input text-base sm:text-sm min-h-[46px] sm:min-h-[36px]"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={readOnly}
      {...rest}
    />
  );
}

type TextAreaProps = Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  "onChange" | "value" | "readOnly"
> & {
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
};

function TextArea({ value, onChange, readOnly, ...rest }: TextAreaProps) {
  return (
    <textarea
      className="app-textarea text-base sm:text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={readOnly}
      {...rest}
    />
  );
}

// ─── Step components ──────────────────────────────────────────────────────────

function StepYou({
  fields,
  setField,
  readOnly,
}: {
  fields: SessionFields;
  setField: (k: StringFieldKey) => (v: string) => void;
  readOnly: boolean;
}) {
  return (
    <>
      <p className="text-sm text-[var(--text-3)]">
        Who&apos;s the primary contact for this project? Everything we send goes here first.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="First name" required>
          <TextInput
            value={s(fields.contactFirstName)}
            onChange={setField("contactFirstName")}
            readOnly={readOnly}
            placeholder="Jane"
            autoComplete="given-name"
          />
        </Field>
        <Field label="Last name">
          <TextInput
            value={s(fields.contactLastName)}
            onChange={setField("contactLastName")}
            readOnly={readOnly}
            placeholder="Smith"
            autoComplete="family-name"
          />
        </Field>
      </div>
      <Field label="Email" required>
        <TextInput
          type="email"
          inputMode="email"
          autoComplete="email"
          value={s(fields.contactEmail)}
          onChange={setField("contactEmail")}
          readOnly={readOnly}
          placeholder="jane@company.com"
        />
      </Field>
      <Field label="Your role">
        <TextInput
          autoComplete="organization-title"
          value={s(fields.contactRole)}
          onChange={setField("contactRole")}
          readOnly={readOnly}
          placeholder="Founder, CTO, Product lead…"
        />
      </Field>
      <Field label="Phone" hint="Optional. We'll only call if something's urgent.">
        <TextInput
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={s(fields.contactPhone)}
          onChange={setField("contactPhone")}
          readOnly={readOnly}
          placeholder="+44 7700 900000"
        />
      </Field>
    </>
  );
}

function StepCompany({
  fields,
  setField,
  setBillingDiffers,
  readOnly,
}: {
  fields: SessionFields;
  setField: (k: StringFieldKey) => (v: string) => void;
  setBillingDiffers: (v: boolean) => void;
  readOnly: boolean;
}) {
  return (
    <>
      <p className="text-sm text-[var(--text-3)]">
        Where invoices and contracts should be addressed. The legal name lines up with Companies House if you have one.
      </p>
      <Field label="Company name" required>
        <TextInput
          autoComplete="organization"
          value={s(fields.companyName)}
          onChange={setField("companyName")}
          readOnly={readOnly}
          placeholder="Acme Health"
        />
      </Field>
      <Field
        label="Registered (legal) name"
        hint="Only if it's different from the trading name above."
      >
        <TextInput
          value={s(fields.legalCompanyName)}
          onChange={setField("legalCompanyName")}
          readOnly={readOnly}
          placeholder="Acme Health Ltd"
        />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Company number">
          <TextInput
            value={s(fields.companyNumber)}
            onChange={setField("companyNumber")}
            readOnly={readOnly}
            placeholder="12345678"
          />
        </Field>
        <Field label="VAT number" hint="If you're VAT registered.">
          <TextInput
            value={s(fields.vatNumber)}
            onChange={setField("vatNumber")}
            readOnly={readOnly}
            placeholder="GB123456789"
          />
        </Field>
      </div>
      <Field
        label="Invoice email"
        hint="Which email should we send invoices to? Leave blank to use the contact email above."
      >
        <TextInput
          type="email"
          inputMode="email"
          autoComplete="email"
          value={s(fields.invoiceEmail)}
          onChange={setField("invoiceEmail")}
          readOnly={readOnly}
          placeholder="accounts@company.com"
        />
      </Field>

      {/* ── HQ / registered address ── */}
      <p className="pt-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]">
        Registered address
      </p>
      <Field label="Address">
        <TextInput
          autoComplete="address-line1"
          value={s(fields.addressLine1)}
          onChange={setField("addressLine1")}
          readOnly={readOnly}
          placeholder="20 Office Park"
        />
      </Field>
      <Field label="Address line 2">
        <TextInput
          autoComplete="address-line2"
          value={s(fields.addressLine2)}
          onChange={setField("addressLine2")}
          readOnly={readOnly}
        />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Town/City">
          <TextInput
            autoComplete="address-level2"
            value={s(fields.city)}
            onChange={setField("city")}
            readOnly={readOnly}
            placeholder="Manchester"
          />
        </Field>
        <Field label="County">
          <TextInput
            autoComplete="address-level1"
            value={s(fields.county)}
            onChange={setField("county")}
            readOnly={readOnly}
            placeholder="Greater Manchester"
          />
        </Field>
        <Field label="Postcode">
          <TextInput
            autoComplete="postal-code"
            value={s(fields.postcode)}
            onChange={setField("postcode")}
            readOnly={readOnly}
            placeholder="M1 1AA"
          />
        </Field>
        <Field label="Country">
          <TextInput
            autoComplete="country-name"
            value={s(fields.country) || COUNTRY_DEFAULT}
            onChange={setField("country")}
            readOnly={readOnly}
          />
        </Field>
      </div>

      {/* ── Billing address toggle ── */}
      <label className="flex items-start gap-2.5 pt-1">
        <input
          type="checkbox"
          className="app-checkbox mt-0.5"
          checked={fields.billingDiffers}
          onChange={(e) => setBillingDiffers(e.target.checked)}
          disabled={readOnly}
        />
        <span className="text-sm text-[var(--text-2)]">
          Our billing address is different from our registered address
        </span>
      </label>

      {fields.billingDiffers && (
        <div className="space-y-4 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-4">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]">
            Billing address
          </p>
          <Field label="Address">
            <TextInput
              value={s(fields.billingAddressLine1)}
              onChange={setField("billingAddressLine1")}
              readOnly={readOnly}
              placeholder="Finance Dept, 1 High Street"
            />
          </Field>
          <Field label="Address line 2">
            <TextInput
              value={s(fields.billingAddressLine2)}
              onChange={setField("billingAddressLine2")}
              readOnly={readOnly}
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Town/City">
              <TextInput
                value={s(fields.billingCity)}
                onChange={setField("billingCity")}
                readOnly={readOnly}
                placeholder="London"
              />
            </Field>
            <Field label="County">
              <TextInput
                value={s(fields.billingCounty)}
                onChange={setField("billingCounty")}
                readOnly={readOnly}
              />
            </Field>
            <Field label="Postcode">
              <TextInput
                value={s(fields.billingPostcode)}
                onChange={setField("billingPostcode")}
                readOnly={readOnly}
                placeholder="EC1A 1BB"
              />
            </Field>
            <Field label="Country">
              <TextInput
                value={s(fields.billingCountry) || COUNTRY_DEFAULT}
                onChange={setField("billingCountry")}
                readOnly={readOnly}
              />
            </Field>
          </div>
        </div>
      )}
    </>
  );
}

function StepProduct({
  fields,
  setField,
  readOnly,
}: {
  fields: SessionFields;
  setField: (k: StringFieldKey) => (v: string) => void;
  readOnly: boolean;
}) {
  return (
    <>
      <p className="text-sm text-[var(--text-3)]">
        Tell us about the product. If it&apos;s already live, drop the URL — we&apos;ll take a quick look. (We don&apos;t run any deep scans until you officially come on board.)
      </p>
      <Field label="Product name">
        <TextInput
          value={s(fields.productName)}
          onChange={setField("productName")}
          readOnly={readOnly}
          placeholder="Acme Health"
        />
      </Field>
      <Field label="Live URL" hint="If your product is already deployed somewhere.">
        <TextInput
          type="url"
          value={s(fields.productUrl)}
          onChange={setField("productUrl")}
          readOnly={readOnly}
          placeholder="https://acmehealth.com"
        />
      </Field>
      <Field
        label="Short description"
        hint="One paragraph — what does it do and who's it for?"
      >
        <TextArea
          value={s(fields.productDescription)}
          onChange={setField("productDescription")}
          readOnly={readOnly}
          rows={4}
          maxLength={2000}
        />
      </Field>
    </>
  );
}

function StepGoals({
  fields,
  setField,
  readOnly,
}: {
  fields: SessionFields;
  setField: (k: StringFieldKey) => (v: string) => void;
  readOnly: boolean;
}) {
  return (
    <>
      <p className="text-sm text-[var(--text-3)]">
        What are you hoping Gitwork can help with? Build it from scratch, take it from prototype to production, fix a particular pain point — whatever&apos;s most useful for us to know.
      </p>
      <Field label="In your own words">
        <TextArea
          value={s(fields.projectGoals)}
          onChange={setField("projectGoals")}
          readOnly={readOnly}
          rows={8}
        />
      </Field>
    </>
  );
}

function StepBank({
  bankInput,
  setBank,
  bankSummary,
  readOnly,
}: {
  bankInput: BankInput;
  setBank: (k: keyof BankInput) => (v: string) => void;
  bankSummary: BankSummary;
  readOnly: boolean;
}) {
  return (
    <>
      <div className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-3 text-xs leading-relaxed text-[var(--text-3)]">
        Bank details are <strong>encrypted at rest</strong>. We use them to set up invoicing on
        your project. Only Gitwork staff (Dan and Harry) can see them.
      </div>
      {bankSummary.onFile && (
        <div className="rounded-[10px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          We&apos;ve got your bank details on file
          {bankSummary.accountNumberLast4
            ? ` (••••${bankSummary.accountNumberLast4})`
            : ""}
          . Re-enter below to overwrite them, or leave blank to keep what you sent.
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Account holder name">
          <TextInput
            value={bankInput.accountHolder}
            onChange={setBank("accountHolder")}
            readOnly={readOnly}
            placeholder="Acme Health Ltd"
          />
        </Field>
        <Field label="Bank name">
          <TextInput
            value={bankInput.bankName}
            onChange={setBank("bankName")}
            readOnly={readOnly}
            placeholder="Barclays"
          />
        </Field>
        <Field label="Sort code">
          <TextInput
            value={bankInput.sortCode}
            onChange={(v) => setBank("sortCode")(formatSortCode(v))}
            readOnly={readOnly}
            placeholder="20-00-00"
            autoComplete="off"
            inputMode="numeric"
            maxLength={8}
          />
        </Field>
        <Field label="Account number">
          <TextInput
            value={bankInput.accountNumber}
            onChange={setBank("accountNumber")}
            readOnly={readOnly}
            placeholder="12345678"
            autoComplete="off"
            inputMode="numeric"
          />
        </Field>
        <Field
          label="IBAN"
          hint="For international clients only."
        >
          <TextInput
            value={bankInput.iban}
            onChange={setBank("iban")}
            readOnly={readOnly}
            placeholder="GB29 NWBK 6016 1331 9268 19"
            autoComplete="off"
          />
        </Field>
        <Field label="SWIFT / BIC">
          <TextInput
            value={bankInput.swiftBic}
            onChange={setBank("swiftBic")}
            readOnly={readOnly}
            placeholder="NWBKGB2L"
            autoComplete="off"
          />
        </Field>
      </div>
      <Field label="Currency" hint="ISO code (GBP, USD, EUR…).">
        <TextInput
          value={bankInput.currency}
          onChange={setBank("currency")}
          readOnly={readOnly}
          placeholder="GBP"
          maxLength={3}
        />
      </Field>
    </>
  );
}

function StepReview({
  fields,
  bankSummary,
  onEditStep,
  readOnly,
}: {
  fields: SessionFields;
  bankSummary: BankSummary;
  onEditStep: (idx: number) => void;
  readOnly: boolean;
}) {
  const contactName = [fields.contactFirstName, fields.contactLastName].filter(Boolean).join(" ");
  const rows: Array<{ stepIdx: number; label: string; value: string }> = [
    { stepIdx: 1, label: "Contact", value: [contactName, fields.contactEmail].filter(Boolean).join(" · ") },
    { stepIdx: 2, label: "Company", value: [fields.companyName, fields.invoiceEmail ? `invoices → ${fields.invoiceEmail}` : null].filter(Boolean).join(" · ") || "—" },
    { stepIdx: 3, label: "Product", value: [fields.productName, fields.productUrl].filter(Boolean).join(" — ") || "—" },
    { stepIdx: 4, label: "Goals", value: fields.projectGoals ? `${fields.projectGoals.slice(0, 80)}${fields.projectGoals.length > 80 ? "…" : ""}` : "—" },
    {
      stepIdx: 5,
      label: "Bank",
      value: bankSummary.onFile
        ? `On file${bankSummary.accountNumberLast4 ? ` (••••${bankSummary.accountNumberLast4})` : ""}`
        : "Not provided",
    },
  ];
  return (
    <>
      <p className="text-sm text-[var(--text-3)]">
        Quick check before you send. Tap a section to edit.
      </p>
      <ul className="divide-y divide-[var(--border-3)] rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)]">
        {rows.map((row) => (
          <li
            key={row.label}
            className="flex items-center justify-between gap-3 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-4)]">
                {row.label}
              </p>
              <p className="truncate text-sm text-[var(--text-2)]">{row.value || "—"}</p>
            </div>
            {!readOnly && (
              <button
                type="button"
                onClick={() => onEditStep(row.stepIdx)}
                className="app-button app-button-tertiary app-button-xs"
              >
                Edit
              </button>
            )}
          </li>
        ))}
      </ul>
      {!readOnly && (
        <>
          <div className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-3 text-xs leading-relaxed text-[var(--text-3)]">
            Your service agreement and welcome pack are sent separately once we&apos;ve reviewed
            this — nothing to sign here.
          </div>
          <p className="text-xs leading-relaxed text-[var(--text-4)]">
            By submitting, you confirm the answers above are accurate and you&apos;re happy for
            Gitwork to use them to set up your engagement. You&apos;ll still be able to make changes
            via this link until we move you to active workflow.
          </p>
        </>
      )}
    </>
  );
}
