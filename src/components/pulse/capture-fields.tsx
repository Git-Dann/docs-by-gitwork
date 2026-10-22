"use client";

import { CAPTURE_LIMITS, PRIVACY_URL, TERMS_URL } from "@/lib/pulse-capture";

/**
 * The unlock form's fields — name, business, email and the terms checkbox — shared by
 * the scanner widget and the shareable report page, which both draw it on the navy
 * gate card. The rules behind it live in lib/pulse-capture.ts.
 */
export interface CaptureValues {
  name: string;
  business: string;
  email: string;
  termsAccepted: boolean;
}

export const EMPTY_CAPTURE: CaptureValues = { name: "", business: "", email: "", termsAccepted: false };

/** True once every field is filled and the terms are ticked. */
export function captureComplete(v: CaptureValues): boolean {
  return Boolean(v.name.trim() && v.business.trim() && v.email.trim() && v.termsAccepted);
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

export function CaptureFields({
  values,
  onChange,
  onSubmit,
  disabled,
  idPrefix,
  describedBy,
}: {
  values: CaptureValues;
  onChange: (next: CaptureValues) => void;
  onSubmit: () => void;
  disabled: boolean;
  idPrefix: string;
  describedBy?: string;
}) {
  const set = (patch: Partial<CaptureValues>) => onChange({ ...values, ...patch });
  const enter = (e: React.KeyboardEvent) => { if (e.key === "Enter") onSubmit(); };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
        <input
          type="text"
          autoComplete="name"
          placeholder="Your name"
          aria-label="Your name"
          maxLength={CAPTURE_LIMITS.name}
          value={values.name}
          onChange={(e) => set({ name: e.target.value })}
          onKeyDown={enter}
          disabled={disabled}
          aria-describedby={describedBy}
          style={FIELD}
        />
        <input
          type="text"
          autoComplete="organization"
          placeholder="Business name"
          aria-label="Business name"
          maxLength={CAPTURE_LIMITS.business}
          value={values.business}
          onChange={(e) => set({ business: e.target.value })}
          onKeyDown={enter}
          disabled={disabled}
          aria-describedby={describedBy}
          style={FIELD}
        />
      </div>
      <input
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="you@company.com"
        aria-label="Your email address"
        maxLength={CAPTURE_LIMITS.email}
        value={values.email}
        onChange={(e) => set({ email: e.target.value })}
        onKeyDown={enter}
        disabled={disabled}
        aria-describedby={describedBy}
        style={FIELD}
      />
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
