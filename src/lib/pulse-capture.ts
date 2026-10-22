/**
 * The unlock form on the public scanner: name, business, email, and agreement to the
 * terms. One rule, used by the widget, the shareable report page and the enquiry
 * endpoint, so the form cannot accept something the server then rejects.
 *
 * ⚠️ What is typed here is put in an email Gitwork sends to the address typed here. With
 * no rules, anyone could make Foundry send a stranger a Gitwork-branded email that opens
 * "Hi http://phishing.example". So a name or business may not carry a link, an email
 * address, markup, or invisible characters (zero-width and bidirectional overrides, which
 * can make text read differently from what it is).
 *
 * Framework-free on purpose — it is imported by client components and API routes.
 */

export const CAPTURE_LIMITS = { name: 80, business: 120, email: 254 } as const;

// Company terms live on gitwork.co.uk (Foundry's own /terms and /privacy redirect there).
export const TERMS_URL = "https://gitwork.co.uk/terms";
export const PRIVACY_URL = "https://gitwork.co.uk/privacy";

export interface CaptureInput {
  name?: unknown;
  business?: unknown;
  email?: unknown;
  termsAccepted?: unknown;
}

export type CaptureField = "name" | "business" | "email" | "terms";

export type CaptureResult =
  | { ok: true; value: { name: string; business: string; email: string } }
  | { ok: false; error: string; field: CaptureField };

// Control characters, zero-width characters and bidirectional overrides.
// eslint-disable-next-line no-control-regex
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F­​-‏‪-‮⁠-⁩﻿]/g;

function clean(v: unknown): string {
  return typeof v === "string" ? v.replace(INVISIBLE, "").replace(/\s+/g, " ").trim() : "";
}

// A link with a scheme or "www.": refused in both fields.
const LINK_EXPLICIT = /(?:[a-z][a-z0-9+.-]*:\/\/|\bwww\.)/i;
// Anything domain-shaped too. Only for the NAME, which is what the visitor's email opens
// with ("Hi …"); a business may well be called "Monday.com", and the business is never
// put in an email sent to the address typed.
const LINK = /(?:[a-z][a-z0-9+.-]*:\/\/|\bwww\.|\b[a-z0-9-]+\.(?:com|net|org|io|co|uk|me|app|dev|xyz|ru|cn|info|biz|top|site|online|link|click|ly|gg|ai)\b)/i;
const MARKUP = /[<>{}[\]\\|`]/;
const HAS_LETTER = /\p{L}/u;

/**
 * An email address a person actually has: no spaces, one @, a local part without leading,
 * trailing or doubled dots, and a domain of real-looking labels ending in a letters-only
 * top-level domain (or a punycode one). Stricter than RFC 5322 on purpose: the RFC allows
 * quoted local parts and IP-literal domains that no visitor types and some mail servers
 * refuse, and a bounce here is a lost lead.
 */
const LOCAL = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const TLD = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

export function isValidEmail(raw: string): boolean {
  const email = raw.trim().toLowerCase();
  if (email.length === 0 || email.length > CAPTURE_LIMITS.email) return false;
  const at = email.lastIndexOf("@");
  if (at <= 0 || email.indexOf("@") !== at) return false;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length > 64 || !LOCAL.test(local)) return false;
  const labels = domain.split(".");
  if (labels.length < 2) return false;
  if (!labels.slice(0, -1).every((l) => LABEL.test(l))) return false;
  return TLD.test(labels[labels.length - 1]);
}

// The typos people actually make on the big providers. A suggestion only: never applied for them.
const DOMAIN_TYPOS: Record<string, string> = {
  "gmial.com": "gmail.com", "gmai.com": "gmail.com", "gamil.com": "gmail.com", "gnail.com": "gmail.com",
  "gmail.co": "gmail.com", "gmail.con": "gmail.com", "gmail.cm": "gmail.com", "gmaill.com": "gmail.com",
  "googlemail.co": "googlemail.com",
  "hotmial.com": "hotmail.com", "hotmai.com": "hotmail.com", "hotmail.co": "hotmail.co.uk", "hotmail.con": "hotmail.com",
  "outlok.com": "outlook.com", "outlook.co": "outlook.com", "outlook.con": "outlook.com",
  "yahooo.com": "yahoo.com", "yaho.com": "yahoo.com", "yahoo.co": "yahoo.co.uk",
  "icloud.co": "icloud.com", "iclod.com": "icloud.com",
};

/** "you@gmail.com" when the domain typed is a known typo of a big provider, else null. */
export function suggestEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at <= 0) return null;
  const fix = DOMAIN_TYPOS[email.slice(at + 1)];
  return fix ? `${email.slice(0, at)}@${fix}` : null;
}

function checkText(v: string, what: "name" | "business"): string | null {
  const label = what === "name" ? "your name" : "your business name";
  if (!v) return `Enter ${label}.`;
  if (v.length > CAPTURE_LIMITS[what]) return `That ${what === "name" ? "name" : "business name"} is too long.`;
  if (!HAS_LETTER.test(v)) return `Enter ${label} in letters.`;
  if (v.includes("@")) return `Enter ${label} here, and your email address below.`;
  if (LINK_EXPLICIT.test(v) || (what === "name" && LINK.test(v))) return `Enter ${label} without a web address.`;
  if (MARKUP.test(v)) return `Enter ${label} without symbols like < > { } [ ].`;
  if (what === "name" && /\d{3,}/.test(v)) return "Enter your name without numbers.";
  return null;
}

export function parseCapture(input: CaptureInput): CaptureResult {
  const name = clean(input.name);
  const business = clean(input.business);
  const email = clean(input.email).toLowerCase();
  const nameError = checkText(name, "name");
  if (nameError) return { ok: false, error: nameError, field: "name" };
  const businessError = checkText(business, "business");
  if (businessError) return { ok: false, error: businessError, field: "business" };
  if (!isValidEmail(email)) {
    return { ok: false, error: email ? "Enter a valid email address, like you@company.com." : "Enter your email address.", field: "email" };
  }
  // Strictly `true`: a stray "yes" or 1 from a hand-rolled client is not agreement.
  if (input.termsAccepted !== true) {
    return { ok: false, error: "Please agree to the terms and conditions to continue.", field: "terms" };
  }
  return { ok: true, value: { name, business, email } };
}

/** Every field's problem at once, for the form to show beside each field. */
export function captureFieldErrors(input: CaptureInput): Partial<Record<CaptureField, string>> {
  const out: Partial<Record<CaptureField, string>> = {};
  const name = checkText(clean(input.name), "name");
  if (name) out.name = name;
  const business = checkText(clean(input.business), "business");
  if (business) out.business = business;
  const email = clean(input.email);
  if (!isValidEmail(email)) out.email = email ? "Enter a valid email address, like you@company.com." : "Enter your email address.";
  if (input.termsAccepted !== true) out.terms = "Please agree to the terms and conditions to continue.";
  return out;
}

/**
 * True when the hidden honeypot field looks filled by a bot rather than by the browser.
 *
 * ⚠️ Browsers autofill hidden fields. The honeypot used to be named "company", beside the
 * real "Business name" field, and Chrome (which ignores autocomplete="off") filled it with
 * the visitor's company, so a real person using autofill was refused as a bot. The field
 * is now named so no autofill heuristic matches it, and as a second line, a honeypot whose
 * value is one the visitor also typed into a real field is autofill, not a bot. Turnstile
 * is what actually stops bots; the honeypot only catches the crudest.
 */
export function honeypotTripped(honeypot: unknown, realFields: unknown[]): boolean {
  const hp = typeof honeypot === "string" ? honeypot.trim().toLowerCase() : "";
  if (!hp) return false;
  return !realFields.some((v) => typeof v === "string" && v.trim().toLowerCase() === hp);
}
