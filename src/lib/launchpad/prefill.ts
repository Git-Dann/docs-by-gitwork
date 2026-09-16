/**
 * Prefill — the ALLOW-LIST of client data a Launchpad template may read.
 *
 * ⚠️ This exists because template JSON is operator-editable. If `prefillKey`
 * resolved straight to a column name, editing a template in Settings would be a
 * way to read anything on the client record — including the encrypted bank
 * details — and surface it on a page a client user can open. So a template names a
 * KEY, and this module decides what that key is allowed to mean.
 *
 * Pure and Prisma-free: the server fetches the row and hands the flat shape in, so
 * the mapping itself is unit-testable with no database.
 *
 * Prefill is STRICTLY only-if-present. A missing value leaves the field blank and
 * manual — Launchpad never depends on onboarding having been used, and a client who
 * never went through it must not see a half-populated form implying we already hold
 * details we do not.
 */

export const PREFILL_KEYS = [
  "clientName",
  "website",
  "legalCompanyName",
  "companyNumber",
  "vatNumber",
  "primaryContactName",
  "primaryContactEmail",
  "invoiceEmail",
  "registeredAddress",
] as const;

export type PrefillKey = (typeof PREFILL_KEYS)[number];

export function isPrefillKey(value: unknown): value is PrefillKey {
  return typeof value === "string" && (PREFILL_KEYS as readonly string[]).includes(value);
}

/**
 * The flat shape the server assembles from `WorkspaceClient` and — only if one
 * exists — its `ClientOnboarding` row. Every field is nullable by design: the whole
 * contract is "use it if it's there".
 */
export interface PrefillSource {
  clientName: string | null;
  website: string | null;
  legalCompanyName: string | null;
  companyNumber: string | null;
  vatNumber: string | null;
  primaryContactName: string | null;
  primaryContactEmail: string | null;
  invoiceEmail: string | null;
  registeredAddress: string | null;
}

export const EMPTY_PREFILL: PrefillSource = {
  clientName: null,
  website: null,
  legalCompanyName: null,
  companyNumber: null,
  vatNumber: null,
  primaryContactName: null,
  primaryContactEmail: null,
  invoiceEmail: null,
  registeredAddress: null,
};

/** Join the address columns into the single multi-line block a legal doc prints.
 *  Returns null when there is nothing to join, so the field stays blank rather
 *  than rendering an address made of commas. */
export function composeAddress(parts: {
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  county?: string | null;
  postcode?: string | null;
  country?: string | null;
}): string | null {
  const lines = [
    parts.addressLine1,
    parts.addressLine2,
    parts.city,
    parts.county,
    parts.postcode,
    parts.country,
  ]
    .map((p) => p?.trim())
    .filter((p): p is string => Boolean(p));
  return lines.length > 0 ? lines.join(", ") : null;
}

/**
 * Resolve one key. Returns null for an unknown key — so a template naming
 * something outside the allow-list prefills nothing rather than leaking a column.
 */
export function resolvePrefill(key: string, source: PrefillSource): string | null {
  if (!isPrefillKey(key)) return null;
  const value = source[key];
  return value?.trim() ? value.trim() : null;
}

/**
 * Prefer the client record, fall back to an onboarding row. The client record wins
 * because it is the live one — an onboarding row is a snapshot of what they told us
 * at sign-up, which may since have been corrected in Portal.
 */
export function firstPresent(...values: (string | null | undefined)[]): string | null {
  for (const value of values) {
    if (value && value.trim()) return value.trim();
  }
  return null;
}
