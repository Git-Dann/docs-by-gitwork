"use client";

import { useState } from "react";
import { CAPTURE_LIMITS, PRIVACY_URL, TERMS_URL, captureFieldErrors, parseCapture, suggestEmail, type CaptureField } from "@/lib/pulse-capture";

/**
 * The unlock form's fields — name, business, email and the terms checkbox — shared by
 * the scanner widget and the shareable report page, which both draw it on the navy
 * gate card. The rules behind it live in lib/pulse-capture.ts, and the server applies
 * the same ones, so nothing the form accepts is then refused.
 */
export interface CaptureValues {
  name: string;
  business: string;
  email: string;
  termsAccepted: boolean;
}

export const EMPTY_CAPTURE: CaptureValues = { name: "", business: "", email: "", termsAccepted: false };

/** True once every field is valid and the terms are ticked: the same rule the server applies. */
export function captureComplete(v: CaptureValues): boolean {
  return parseCapture(v).ok;
}

const FIELD: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "12px 14px",
  border: "1px solid rgba(255,255,255,0.25)",
  borderRadius: 10,
  // 16px, not smaller: iOS Safari zooms the viewport when a smaller field takes focus.
  fontSize: 16,
  outline: "none",
  background: "rgba(255,255,255,0.06)",
  color: "white",
};
const FIELD_INVALID: React.CSSProperties = { ...FIELD, border: "1px solid #f87171" };
const ERROR: React.CSSProperties = { margin: "4px 2px 0", fontSize: 12.5, color: "#fca5a5", lineHeight: 1.4 };

export function CaptureFields({
  values,
  onChange,
  onSubmit,
  disabled,
  idPrefix,
  describedBy,
  showAllErrors = false,
}: {
  values: CaptureValues;
  onChange: (next: CaptureValues) => void;
  onSubmit: () => void;
  disabled: boolean;
  idPrefix: string;
  describedBy?: string;
  /** Set after a submit attempt, so every field says what is wrong, not only ones left. */
  showAllErrors?: boolean;
}) {
  // A field's problem shows once the visitor has left it, never while they are typing
  // the first character of it.
  const [touched, setTouched] = useState<Partial<Record<CaptureField, boolean>>>({});
  const [triedEnter, setTriedEnter] = useState(false);
  const errors = captureFieldErrors(values);
  const show = (f: CaptureField) => (showAllErrors || triedEnter || touched[f]) && errors[f];
  const set = (patch: Partial<CaptureValues>) => onChange({ ...values, ...patch });
  const leave = (f: CaptureField) => () => setTouched((t) => ({ ...t, [f]: true }));
  const enter = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter") return;
    if (parseCapture(values).ok) onSubmit();
    else setTriedEnter(true);
  };
  const suggestion = errors.email ? null : suggestEmail(values.email);
  const ids = (f: CaptureField) => [show(f) ? `${idPrefix}-${f}-error` : null, describedBy].filter(Boolean).join(" ") || undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
        <div>
          <input
            type="text"
            autoComplete="name"
            placeholder="Your name"
            aria-label="Your name"
            maxLength={CAPTURE_LIMITS.name}
            value={values.name}
            onChange={(e) => set({ name: e.target.value })}
            onBlur={leave("name")}
            onKeyDown={enter}
            disabled={disabled}
            aria-invalid={show("name") ? true : undefined}
            aria-describedby={ids("name")}
            style={show("name") ? FIELD_INVALID : FIELD}
          />
          {show("name") && <p id={`${idPrefix}-name-error`} style={ERROR}>{errors.name}</p>}
        </div>
        <div>
          <input
            type="text"
            autoComplete="organization"
            placeholder="Business name"
            aria-label="Business name"
            maxLength={CAPTURE_LIMITS.business}
            value={values.business}
            onChange={(e) => set({ business: e.target.value })}
            onBlur={leave("business")}
            onKeyDown={enter}
            disabled={disabled}
            aria-invalid={show("business") ? true : undefined}
            aria-describedby={ids("business")}
            style={show("business") ? FIELD_INVALID : FIELD}
          />
          {show("business") && <p id={`${idPrefix}-business-error`} style={ERROR}>{errors.business}</p>}
        </div>
      </div>
      <div>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="you@company.com"
          aria-label="Your email address"
          maxLength={CAPTURE_LIMITS.email}
          value={values.email}
          onChange={(e) => set({ email: e.target.value })}
          onBlur={leave("email")}
          onKeyDown={enter}
          disabled={disabled}
          aria-invalid={show("email") ? true : undefined}
          aria-describedby={ids("email")}
          style={show("email") ? FIELD_INVALID : FIELD}
        />
        {show("email") && <p id={`${idPrefix}-email-error`} style={ERROR}>{errors.email}</p>}
        {suggestion && (
          <p style={{ ...ERROR, color: "#d1d5db" }}>
            Did you mean{" "}
            <button
              type="button"
              onClick={() => set({ email: suggestion })}
              style={{ background: "none", border: 0, padding: 0, color: "white", textDecoration: "underline", cursor: "pointer", font: "inherit" }}
            >
              {suggestion}
            </button>
            ?
          </p>
        )}
      </div>
      <label
        htmlFor={`${idPrefix}-terms`}
        style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12.5, color: "#d1d5db", lineHeight: 1.5, cursor: "pointer" }}
      >
        <input
          id={`${idPrefix}-terms`}
          type="checkbox"
          checked={values.termsAccepted}
          onChange={(e) => set({ termsAccepted: e.target.checked })}
          disabled={disabled}
          aria-invalid={show("terms") ? true : undefined}
          aria-describedby={ids("terms")}
          style={{ marginTop: 3, width: 16, height: 16, flexShrink: 0, accentColor: "#6B52FF" }}
        />
        <span>
          I agree to Gitwork&apos;s{" "}
          <a href={TERMS_URL} target="_blank" rel="noopener noreferrer" style={{ color: "white", textDecoration: "underline" }}>
            terms and conditions
          </a>{" "}
          and{" "}
          <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" style={{ color: "white", textDecoration: "underline" }}>
            privacy policy
          </a>
          , and to being emailed my report.
        </span>
      </label>
      {show("terms") && <p id={`${idPrefix}-terms-error`} style={ERROR}>{errors.terms}</p>}
    </div>
  );
}

/**
 * The unlock card's words, shared by the widget and the /scan page so they can't drift.
 *
 * It used to lead with the held-back count ("Unlock 6 more findings"), which undersold
 * it: those are only the top-priority findings. Unlocking gets the full report, which
 * covers every check run on the site, so the heading names the report and the count of
 * checks says how much is in it.
 */
export function unlockCopy(lockedCount: number, measured: number): { heading: string; body: string } {
  const checks = measured > 0 ? `all ${measured} checks we ran` : "every check we ran";
  const findings = lockedCount > 0
    ? `${lockedCount} more finding${lockedCount === 1 ? "" : "s"} to fix, and the results of ${checks}, with the evidence for each.`
    : `The results of ${checks}, with the evidence for each.`;
  return {
    heading: "Unlock your full report",
    body: `${findings} Tell us who you are and we'll email it to you, at no charge.`,
  };
}

/** "A, B and C": an English list for short runs of area names. */
export function listAreas(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * What a visitor is told once they unlock. The report is not sent yet at that moment: a full
 * scan runs first, which usually takes a few minutes, and a first email from a new sender
 * often lands in spam or promotions. Saying both up front is what stops "it never came".
 */
export const UNLOCKED_HEADING = "Unlocked. Your full report is on its way.";
export function deliveryNote(site: string, email?: string | null): string {
  const to = email?.trim() ? ` to ${email.trim()}` : "";
  return `We're running a full scan of ${site} and will email your report${to}. It usually arrives within a few minutes, but can take up to an hour. If it isn't in your inbox, check your spam or promotions folder.`;
}
