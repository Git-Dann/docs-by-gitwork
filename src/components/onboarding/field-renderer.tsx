"use client";

import type { OnboardingAnswers, OnboardingAnswerValue, OnboardingFieldDef } from "@/types/onboarding";

// ─── Bank types (managed by the flow, rendered by the bank_details field) ──────

export type BankInput = {
  accountHolder: string;
  bankName: string;
  sortCode: string;
  accountNumber: string;
  iban: string;
  swiftBic: string;
  currency: string;
};

export type BankSummary = {
  onFile: boolean;
  currency: string | null;
  accountNumberLast4: string | null;
};

export interface BankFieldProps {
  input: BankInput;
  setBank: (key: keyof BankInput) => (value: string) => void;
  summary: BankSummary;
}

// ─── Field primitives ─────────────────────────────────────────────────────────

export function Field({
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

export function TextInput({ value, onChange, readOnly, ...rest }: TextInputProps) {
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

export function TextArea({ value, onChange, readOnly, ...rest }: TextAreaProps) {
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

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Strip null/undefined for input values. */
function str(value: OnboardingAnswerValue | undefined): string {
  return typeof value === "string" ? value : "";
}

function formatSortCode(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 6);
  return digits.replace(/(\d{2})(?=\d)/g, "$1-");
}
function digitsOnly(value: string, max: number): string {
  return value.replace(/\D/g, "").slice(0, max);
}
function alnumUpper(value: string, max: number): string {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, max);
}

/** Apply a system field's input guard + max length as the client types. */
function transformInput(value: string, def: OnboardingFieldDef): string {
  let v = value;
  const t = def.config?.transform;
  if (t === "upper") v = v.toUpperCase();
  else if (t === "alnum_upper") v = v.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const max = def.config?.maxLength;
  if (typeof max === "number") v = v.slice(0, max);
  return v;
}

/** Preserve browser autofill hints for known system fields. */
const AUTOCOMPLETE_BY_SYSTEM_KEY: Record<string, string> = {
  contactFirstName: "given-name",
  contactLastName: "family-name",
  contactEmail: "email",
  contactRole: "organization-title",
  contactPhone: "tel",
  companyName: "organization",
  invoiceEmail: "email",
  companyNumber: "off",
  vatNumber: "off",
  addressLine1: "address-line1",
  addressLine2: "address-line2",
  city: "address-level2",
  county: "address-level1",
  postcode: "postal-code",
  country: "country-name",
};

const UK_BANKS = [
  "Barclays", "HSBC", "Lloyds Bank", "NatWest", "Santander", "Halifax",
  "Nationwide", "TSB", "The Co-operative Bank", "Metro Bank", "Monzo",
  "Starling Bank", "Revolut", "Royal Bank of Scotland", "Bank of Scotland",
  "Virgin Money", "Tide", "Wise", "Allied Irish Bank", "Bank of Ireland",
  "Clydesdale Bank", "Coutts", "First Direct", "Cynergy Bank",
];

// ─── Bank sub-form (the one "bank_details" field expands into this) ────────────

function BankFields({ input, setBank, summary, readOnly }: BankFieldProps & { readOnly: boolean }) {
  return (
    <div className="space-y-5">
      <div className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-3 text-xs leading-relaxed text-[var(--text-3)]">
        Bank details are <strong>encrypted at rest</strong>. We use them to set up invoicing on
        your project. Only Gitwork staff can see them.
      </div>
      <datalist id="uk-banks">
        {UK_BANKS.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>
      {summary.onFile && (
        <div className="rounded-[10px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          We&apos;ve got your bank details on file
          {summary.accountNumberLast4 ? ` (••••${summary.accountNumberLast4})` : ""}
          . Re-enter below to overwrite them, or leave blank to keep what you sent.
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Account holder name">
          <TextInput
            value={input.accountHolder}
            onChange={setBank("accountHolder")}
            readOnly={readOnly}
            placeholder="Acme Health Ltd"
            autoComplete="off"
            maxLength={70}
          />
        </Field>
        <Field label="Bank name">
          <TextInput
            value={input.bankName}
            onChange={setBank("bankName")}
            readOnly={readOnly}
            placeholder="Barclays"
            list="uk-banks"
            autoComplete="off"
            maxLength={60}
          />
        </Field>
        <Field label="Sort code">
          <TextInput
            value={input.sortCode}
            onChange={(v) => setBank("sortCode")(formatSortCode(v))}
            readOnly={readOnly}
            placeholder="20-00-00"
            autoComplete="off"
            inputMode="numeric"
            maxLength={8}
          />
        </Field>
        <Field label="Account number" hint="8 digits.">
          <TextInput
            value={input.accountNumber}
            onChange={(v) => setBank("accountNumber")(digitsOnly(v, 8))}
            readOnly={readOnly}
            placeholder="12345678"
            autoComplete="off"
            inputMode="numeric"
            maxLength={8}
          />
        </Field>
        <Field label="IBAN" hint="For international clients only.">
          <TextInput
            value={input.iban}
            onChange={(v) => setBank("iban")(alnumUpper(v, 34))}
            readOnly={readOnly}
            placeholder="GB29NWBK60161331926819"
            autoComplete="off"
            maxLength={34}
          />
        </Field>
        <Field label="SWIFT / BIC">
          <TextInput
            value={input.swiftBic}
            onChange={(v) => setBank("swiftBic")(alnumUpper(v, 11))}
            readOnly={readOnly}
            placeholder="NWBKGB2L"
            autoComplete="off"
            maxLength={11}
          />
        </Field>
      </div>
      <Field label="Currency" hint="ISO code (GBP, USD, EUR…).">
        <TextInput
          value={input.currency}
          onChange={(v) => setBank("currency")(v.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 3))}
          readOnly={readOnly}
          placeholder="GBP"
          maxLength={3}
        />
      </Field>
    </div>
  );
}

// ─── The field renderer ────────────────────────────────────────────────────────

export interface FieldRendererProps {
  field: OnboardingFieldDef;
  answers: OnboardingAnswers;
  setAnswer: (id: string, value: OnboardingAnswerValue) => void;
  readOnly: boolean;
  bank: BankFieldProps;
}

export function FieldRenderer({ field, answers, setAnswer, readOnly, bank }: FieldRendererProps) {
  const value = answers[field.id];
  const set = (v: OnboardingAnswerValue) => setAnswer(field.id, v);
  const autoComplete = field.systemKey ? AUTOCOMPLETE_BY_SYSTEM_KEY[field.systemKey] : undefined;
  const maxLength = field.config?.maxLength;

  switch (field.type) {
    case "static":
      return (
        <div className="space-y-1.5">
          {field.label ? (
            <p className="pt-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]">
              {field.label}
            </p>
          ) : null}
          {field.config?.body ? (
            <p className="text-sm leading-relaxed text-[var(--text-3)]">{field.config.body}</p>
          ) : null}
        </div>
      );

    case "bank_details":
      return <BankFields {...bank} readOnly={readOnly} />;

    case "checkbox":
      return (
        <label className="flex items-start gap-2.5 pt-1">
          <input
            type="checkbox"
            className="app-checkbox mt-0.5"
            checked={value === true}
            onChange={(e) => set(e.target.checked)}
            disabled={readOnly}
          />
          <span className="text-sm text-[var(--text-2)]">{field.label}</span>
        </label>
      );

    case "long_text":
      return (
        <Field label={field.label} hint={field.hint} required={field.required}>
          <TextArea
            value={str(value)}
            onChange={(v) => set(maxLength ? v.slice(0, maxLength) : v)}
            readOnly={readOnly}
            placeholder={field.placeholder}
            rows={field.config?.rows ?? 5}
            maxLength={maxLength}
          />
        </Field>
      );

    case "select":
      return (
        <Field label={field.label} hint={field.hint} required={field.required}>
          <select
            className="app-input text-base sm:text-sm min-h-[46px] sm:min-h-[36px]"
            value={str(value)}
            onChange={(e) => set(e.target.value || null)}
            disabled={readOnly}
          >
            <option value="">Select…</option>
            {(field.options ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      );

    case "multiselect": {
      const selected = Array.isArray(value) ? value.map(String) : [];
      const toggle = (id: string) =>
        set(selected.includes(id) ? selected.filter((v) => v !== id) : [...selected, id]);
      return (
        <fieldset className="block space-y-1.5">
          <legend className="app-field-label">
            {field.label}
            {field.required && <span className="ml-1 text-[var(--danger-500)]">*</span>}
          </legend>
          <div className="space-y-2">
            {(field.options ?? []).map((o) => (
              <label key={o.id} className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  className="app-checkbox"
                  checked={selected.includes(o.id)}
                  onChange={() => toggle(o.id)}
                  disabled={readOnly}
                />
                <span className="text-sm text-[var(--text-2)]">{o.label}</span>
              </label>
            ))}
          </div>
          {field.hint && <span className="app-field-hint">{field.hint}</span>}
        </fieldset>
      );
    }

    default: {
      // short_text | email | phone | url | number
      const inputType =
        field.type === "email" ? "email"
        : field.type === "phone" ? "tel"
        : field.type === "url" ? "url"
        : "text";
      const inputMode =
        field.type === "email" ? "email"
        : field.type === "phone" ? "tel"
        : field.type === "number" ? "numeric"
        : undefined;
      return (
        <Field label={field.label} hint={field.hint} required={field.required}>
          <TextInput
            type={inputType}
            inputMode={inputMode}
            value={str(value) || field.config?.default || ""}
            onChange={(v) => set(transformInput(v, field))}
            readOnly={readOnly}
            placeholder={field.placeholder}
            autoComplete={autoComplete}
            list={field.config?.datalist === "uk-banks" ? "uk-banks" : undefined}
            maxLength={maxLength}
          />
        </Field>
      );
    }
  }
}

export { UK_BANKS };
