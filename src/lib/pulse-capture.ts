/**
 * The unlock form on the public scanner: name, business, email, and agreement to the
 * terms. One rule, used by the widget, the shareable report page and the enquiry
 * endpoint, so the form cannot accept something the server then rejects.
 *
 * Framework-free on purpose — it is imported by client components and API routes.
 */

export const CAPTURE_LIMITS = { name: 120, business: 160, email: 200 } as const;

// Company terms live on gitwork.co.uk (Foundry's own /terms and /privacy redirect there).
export const TERMS_URL = "https://gitwork.co.uk/terms";
export const PRIVACY_URL = "https://gitwork.co.uk/privacy";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface CaptureInput {
  name?: unknown;
  business?: unknown;
  email?: unknown;
  termsAccepted?: unknown;
}

export type CaptureResult =
  | { ok: true; value: { name: string; business: string; email: string } }
  | { ok: false; error: string };

function clean(v: unknown): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
}

export function parseCapture(input: CaptureInput): CaptureResult {
  const name = clean(input.name);
  const business = clean(input.business);
  const email = clean(input.email).toLowerCase();
  if (!name) return { ok: false, error: "Enter your name." };
  if (name.length > CAPTURE_LIMITS.name) return { ok: false, error: "That name is too long." };
  if (!business) return { ok: false, error: "Enter your business name." };
  if (business.length > CAPTURE_LIMITS.business) return { ok: false, error: "That business name is too long." };
  if (!EMAIL_RE.test(email) || email.length > CAPTURE_LIMITS.email) {
    return { ok: false, error: "Enter a valid email address." };
  }
  // Strictly `true`: a stray "yes" or 1 from a hand-rolled client is not agreement.
  if (input.termsAccepted !== true) {
    return { ok: false, error: "Please agree to the terms and conditions to continue." };
  }
  return { ok: true, value: { name, business, email } };
}
