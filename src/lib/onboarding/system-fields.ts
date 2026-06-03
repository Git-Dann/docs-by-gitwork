/**
 * System-field catalog — the canonical built-in onboarding fields.
 *
 * A *system field* persists to a real column on `ClientOnboarding` (keyed by
 * `systemKey`, which also equals the field's `id`) and — for most of them — maps
 * into `WorkspaceClient` when the onboarding is materialised. The builder offers
 * these under "Client details"; custom (free) questions live in the `answers` JSON
 * instead.
 *
 * `SYSTEM_TEXT_COLUMNS` is the server's write allow-list: an autosave answer is
 * only routed to a column if its field's `systemKey` is in here (booleans + bank
 * are handled separately). This replaces the old hard-coded `AUTOSAVABLE_FIELDS`.
 */

import type { OnboardingFieldDef } from "@/types/onboarding";

/** Every string column on ClientOnboarding the public flow may write to. */
export const SYSTEM_TEXT_COLUMNS = [
  "contactFirstName",
  "contactLastName",
  "contactEmail",
  "contactRole",
  "contactPhone",
  "invoiceEmail",
  "companyName",
  "legalCompanyName",
  "companyNumber",
  "vatNumber",
  "addressLine1",
  "addressLine2",
  "city",
  "county",
  "postcode",
  "country",
  "billingAddressLine1",
  "billingAddressLine2",
  "billingCity",
  "billingCounty",
  "billingPostcode",
  "billingCountry",
  "productName",
  "productUrl",
  "productDescription",
  "projectGoals",
] as const;

export type SystemTextColumn = (typeof SYSTEM_TEXT_COLUMNS)[number];

/** The one boolean system column (the billing-address-differs toggle). */
export const SYSTEM_BOOLEAN_COLUMNS = ["billingDiffers"] as const;

const TEXT_COLUMN_SET: ReadonlySet<string> = new Set(SYSTEM_TEXT_COLUMNS);
const BOOLEAN_COLUMN_SET: ReadonlySet<string> = new Set(SYSTEM_BOOLEAN_COLUMNS);

export function isSystemTextColumn(key: string | undefined | null): key is SystemTextColumn {
  return typeof key === "string" && TEXT_COLUMN_SET.has(key);
}
export function isSystemBooleanColumn(key: string | undefined | null): boolean {
  return typeof key === "string" && BOOLEAN_COLUMN_SET.has(key);
}

/** Palette sub-group a system field belongs to (for "Client details" grouping). */
export type SystemFieldGroup = "contact" | "company" | "address" | "billing" | "product" | "bank";

export const SYSTEM_FIELD_GROUPS: { key: SystemFieldGroup; label: string }[] = [
  { key: "contact", label: "Contact" },
  { key: "company", label: "Company" },
  { key: "address", label: "Registered address" },
  { key: "billing", label: "Billing address" },
  { key: "product", label: "Product" },
  { key: "bank", label: "Bank details" },
];

/** A catalog entry — a field def template (id is filled in as the systemKey when used). */
export type SystemFieldEntry = Omit<OnboardingFieldDef, "id"> & {
  systemKey: string;
  group: SystemFieldGroup;
  /** Soft-required: the builder warns if removed (materialise still falls back gracefully). */
  recommendedRequired?: boolean;
};

/**
 * The catalog, keyed by systemKey. Copy is lifted verbatim from the original
 * hand-written onboarding flow so the default form reproduces today's wording.
 */
export const SYSTEM_FIELDS: Record<string, SystemFieldEntry> = {
  // ── Contact ──────────────────────────────────────────────────────────
  contactFirstName: {
    systemKey: "contactFirstName", group: "contact", type: "short_text",
    label: "First name", placeholder: "Jane", required: true, recommendedRequired: true,
    config: { width: "half", maxLength: 60 },
  },
  contactLastName: {
    systemKey: "contactLastName", group: "contact", type: "short_text",
    label: "Last name", placeholder: "Smith", config: { width: "half", maxLength: 60 },
  },
  contactEmail: {
    systemKey: "contactEmail", group: "contact", type: "email",
    label: "Email", placeholder: "jane@company.com", required: true, recommendedRequired: true,
  },
  contactRole: {
    systemKey: "contactRole", group: "contact", type: "short_text",
    label: "Your role", placeholder: "Founder, CTO, Product lead…",
  },
  contactPhone: {
    systemKey: "contactPhone", group: "contact", type: "phone",
    label: "Phone", hint: "Optional. We'll only call if something's urgent.",
    placeholder: "+44 7700 900000",
  },
  // ── Company ──────────────────────────────────────────────────────────
  companyName: {
    systemKey: "companyName", group: "company", type: "short_text",
    label: "Company name", placeholder: "Acme Health", required: true, recommendedRequired: true,
  },
  legalCompanyName: {
    systemKey: "legalCompanyName", group: "company", type: "short_text",
    label: "Registered (legal) name", hint: "Only if it's different from the trading name above.",
    placeholder: "Acme Health Ltd",
  },
  companyNumber: {
    systemKey: "companyNumber", group: "company", type: "short_text",
    label: "Company number", placeholder: "12345678",
    config: { width: "half", maxLength: 10, transform: "alnum_upper" },
  },
  vatNumber: {
    systemKey: "vatNumber", group: "company", type: "short_text",
    label: "VAT number", hint: "If you're VAT registered.", placeholder: "GB123456789",
    config: { width: "half", maxLength: 15, transform: "upper" },
  },
  invoiceEmail: {
    systemKey: "invoiceEmail", group: "company", type: "email",
    label: "Invoice email",
    hint: "Which email should we send invoices to? Leave blank to use the contact email above.",
    placeholder: "accounts@company.com",
  },
  // ── Registered address ───────────────────────────────────────────────
  addressLine1: {
    systemKey: "addressLine1", group: "address", type: "short_text",
    label: "Address", placeholder: "20 Office Park",
  },
  addressLine2: {
    systemKey: "addressLine2", group: "address", type: "short_text", label: "Address line 2",
  },
  city: {
    systemKey: "city", group: "address", type: "short_text",
    label: "Town/City", placeholder: "Manchester", config: { width: "half" },
  },
  county: {
    systemKey: "county", group: "address", type: "short_text",
    label: "County", placeholder: "Greater Manchester", config: { width: "half" },
  },
  postcode: {
    systemKey: "postcode", group: "address", type: "short_text",
    label: "Postcode", placeholder: "M1 1AA", config: { width: "half", maxLength: 10, transform: "upper" },
  },
  country: {
    systemKey: "country", group: "address", type: "short_text",
    label: "Country", config: { width: "half", default: "United Kingdom" },
  },
  // ── Billing address (shown when billingDiffers is on) ─────────────────
  billingDiffers: {
    systemKey: "billingDiffers", group: "billing", type: "checkbox",
    label: "Our billing address is different from our registered address",
  },
  billingAddressLine1: {
    systemKey: "billingAddressLine1", group: "billing", type: "short_text",
    label: "Address", placeholder: "Finance Dept, 1 High Street",
    showIf: { fieldId: "billingDiffers", equals: true },
  },
  billingAddressLine2: {
    systemKey: "billingAddressLine2", group: "billing", type: "short_text", label: "Address line 2",
    showIf: { fieldId: "billingDiffers", equals: true },
  },
  billingCity: {
    systemKey: "billingCity", group: "billing", type: "short_text",
    label: "Town/City", placeholder: "London", config: { width: "half" },
    showIf: { fieldId: "billingDiffers", equals: true },
  },
  billingCounty: {
    systemKey: "billingCounty", group: "billing", type: "short_text",
    label: "County", config: { width: "half" },
    showIf: { fieldId: "billingDiffers", equals: true },
  },
  billingPostcode: {
    systemKey: "billingPostcode", group: "billing", type: "short_text",
    label: "Postcode", placeholder: "EC1A 1BB", config: { width: "half" },
    showIf: { fieldId: "billingDiffers", equals: true },
  },
  billingCountry: {
    systemKey: "billingCountry", group: "billing", type: "short_text",
    label: "Country", config: { width: "half", default: "United Kingdom" },
    showIf: { fieldId: "billingDiffers", equals: true },
  },
  // ── Product ──────────────────────────────────────────────────────────
  productName: {
    systemKey: "productName", group: "product", type: "short_text",
    label: "Product name", placeholder: "Acme Health",
  },
  productUrl: {
    systemKey: "productUrl", group: "product", type: "url",
    label: "Live URL", hint: "If your product is already deployed somewhere.",
    placeholder: "https://acmehealth.com",
  },
  productDescription: {
    systemKey: "productDescription", group: "product", type: "long_text",
    label: "Short description", hint: "One paragraph — what does it do and who's it for?",
    config: { rows: 4, maxLength: 2000 },
  },
  projectGoals: {
    systemKey: "projectGoals", group: "product", type: "long_text",
    label: "In your own words", config: { rows: 8, maxLength: 5000 },
  },
  // ── Bank ─────────────────────────────────────────────────────────────
  bankDetails: {
    systemKey: "bankDetails", group: "bank", type: "bank_details",
    label: "Bank details",
  },
};

/** Build a concrete field def from a catalog entry (id := systemKey). */
export function systemFieldDef(systemKey: string): OnboardingFieldDef | null {
  const entry = SYSTEM_FIELDS[systemKey];
  if (!entry) return null;
  const def: OnboardingFieldDef = {
    id: entry.systemKey,
    type: entry.type,
    label: entry.label,
    systemKey: entry.systemKey,
  };
  if (entry.hint !== undefined) def.hint = entry.hint;
  if (entry.placeholder !== undefined) def.placeholder = entry.placeholder;
  if (entry.required !== undefined) def.required = entry.required;
  if (entry.options !== undefined) def.options = entry.options;
  if (entry.config !== undefined) def.config = entry.config;
  if (entry.showIf !== undefined) def.showIf = entry.showIf;
  return def;
}

/** systemKeys flagged as soft-required, for the builder's "don't remove" warning. */
export const RECOMMENDED_REQUIRED_KEYS = Object.values(SYSTEM_FIELDS)
  .filter((f) => f.recommendedRequired)
  .map((f) => f.systemKey);
