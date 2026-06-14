import { Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { encryptNullable, decryptNullable } from "@/lib/encryption";
import { slugifyClientName } from "@/lib/clients";
import { ensureBaseRecords } from "@/server/bootstrap";
import { getDefaultOnboardingForm } from "@/lib/onboarding/default-form";
import {
  SYSTEM_TEXT_COLUMNS,
  isSystemTextColumn,
  isSystemBooleanColumn,
} from "@/lib/onboarding/system-fields";
import { fieldIdSet, fieldsById, isFieldVisible, isFormStructure } from "@/lib/onboarding/structure";
import { collectsAnswer, validateAnswer } from "@/lib/onboarding/field-types";
import type { OnboardingAnswers, OnboardingFormStructure } from "@/types/onboarding";

const onboardings = (prisma as unknown as {
  clientOnboarding: Prisma.ClientOnboardingDelegate;
}).clientOnboarding;

const onboardingBankAccounts = (prisma as unknown as {
  clientOnboardingBankAccount: Prisma.ClientOnboardingBankAccountDelegate;
}).clientOnboardingBankAccount;

const clientBankAccounts = (prisma as unknown as {
  clientBankAccount: Prisma.ClientBankAccountDelegate;
}).clientBankAccount;

const workspaceClients = (prisma as unknown as {
  workspaceClient: Prisma.WorkspaceClientDelegate;
}).workspaceClient;

export type OnboardingPublicPayload = {
  status: "IN_PROGRESS" | "SUBMITTED" | "LINKED";
  currentStep: number;
  /** The form structure rendered by the public flow (snapshot, or in-code default). */
  structure: OnboardingFormStructure;
  /**
   * System text-column values keyed by column name. Kept for the admin list UI +
   * PDF filename (back-compat). Custom answers are NOT in here — see `answers`.
   */
  fields: Record<string, string | null>;
  /** Unified answer map keyed by field id: system columns + billingDiffers + custom JSON. */
  answers: OnboardingAnswers;
  bank: {
    onFile: boolean;
    currency: string | null;
    accountNumberLast4: string | null;
  };
  submittedAt: string | null;
};

// Lean admin record — omits the full form `structure` + `answers` map so the
// links list doesn't ship a snapshot per row. `fields` (system columns) is enough
// for the list UI; custom answers surface on the materialised client's notes.
export type OnboardingAdminRecord = Omit<OnboardingPublicPayload, "structure" | "answers"> & {
  id: string;
  accessToken: string;
  label: string | null;
  formId: string | null;
  workspaceClientId: string | null;
  createdAt: string;
  updatedAt: string;
  linkedAt: string | null;
  // Bank cipher columns + decrypted values are NEVER returned by the list
  // endpoint — only by the per-client reveal endpoint, which audits the read.
};

type OnboardingRow = Prisma.ClientOnboardingGetPayload<{
  include: { bankAccount: true };
}>;

function generateAccessToken(): string {
  // 32 url-safe characters — matches the entropy of the share-token pattern used elsewhere.
  return randomBytes(24).toString("base64url");
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** The structure a row renders from: its frozen snapshot, else the in-code default. */
function structureFor(row: { formSnapshot: Prisma.JsonValue | null }): OnboardingFormStructure {
  if (isFormStructure(row.formSnapshot)) {
    return row.formSnapshot as unknown as OnboardingFormStructure;
  }
  return getDefaultOnboardingForm();
}

/** System text columns as a record keyed by column name. */
function systemFieldsRecord(row: OnboardingRow): Record<string, string | null> {
  return SYSTEM_TEXT_COLUMNS.reduce(
    (acc, key) => {
      const value = row[key as keyof OnboardingRow] as string | null | undefined;
      acc[key] = value ?? null;
      return acc;
    },
    {} as Record<string, string | null>,
  );
}

/** Unified answer map keyed by field id: system columns + billingDiffers + custom JSON. */
function mergedAnswers(row: OnboardingRow): OnboardingAnswers {
  const custom = isPlainObject(row.answers) ? (row.answers as OnboardingAnswers) : {};
  return { ...systemFieldsRecord(row), billingDiffers: Boolean(row.billingDiffers), ...custom };
}

/** Labels of required, visible, unanswered fields — empty when the form is ready to submit. */
function missingRequiredLabels(row: OnboardingRow): string[] {
  const structure = structureFor(row);
  const answers = mergedAnswers(row);
  const ids = fieldIdSet(structure);
  const missing: string[] = [];
  for (const step of structure.steps) {
    for (const f of step.fields) {
      if (!f.required || f.type === "bank_details" || !collectsAnswer(f.type)) continue;
      if (!isFieldVisible(f, answers, ids)) continue;
      const v = answers[f.id];
      const ok =
        f.type === "checkbox"
          ? v === true
          : f.type === "multiselect"
            ? Array.isArray(v) && v.length > 0
            : typeof v === "string"
              ? v.trim().length > 0
              : v != null;
      if (!ok) missing.push(f.label || f.id);
    }
  }
  return missing;
}

function toPublicPayload(row: OnboardingRow): OnboardingPublicPayload {
  const fields = systemFieldsRecord(row);
  const answers = mergedAnswers(row);

  return {
    status: (row.status as "IN_PROGRESS" | "SUBMITTED" | "LINKED") ?? "IN_PROGRESS",
    currentStep: row.currentStep,
    structure: structureFor(row),
    fields,
    answers,
    bank: {
      onFile: Boolean(row.bankAccount),
      currency: row.bankAccount?.currency ?? null,
      accountNumberLast4: row.bankAccount?.accountNumberLast4 ?? null,
    },
    submittedAt: row.submittedAt?.toISOString() ?? null,
  };
}

function toAdminRecord(row: OnboardingRow): OnboardingAdminRecord {
  const pub = toPublicPayload(row);
  return {
    status: pub.status,
    currentStep: pub.currentStep,
    fields: pub.fields,
    bank: pub.bank,
    submittedAt: pub.submittedAt,
    id: row.id,
    accessToken: row.accessToken,
    label: row.label,
    formId: row.formId ?? null,
    workspaceClientId: row.workspaceClientId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    linkedAt: row.linkedAt?.toISOString() ?? null,
  };
}

/** Resolve which form to mint from: the explicit id (if live), else the default. */
async function resolveForm(
  formId?: string,
): Promise<{ id: string; steps: Prisma.JsonValue } | null> {
  if (formId) {
    const byId = await prisma.onboardingForm.findFirst({
      where: { id: formId, isArchived: false },
      select: { id: true, steps: true },
    });
    if (byId) return byId;
  }
  return prisma.onboardingForm.findFirst({
    where: { isArchived: false, isDefault: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, steps: true },
  });
}

export async function createOnboardingLink(input?: { label?: string; formId?: string }) {
  const { workspace } = await ensureBaseRecords();
  // Snapshot the form's structure onto the row so later edits to the form never
  // change a link that's already out. Falls back to the in-code default.
  const form = await resolveForm(input?.formId);
  const snapshot = (form?.steps ?? getDefaultOnboardingForm()) as unknown as Prisma.InputJsonValue;
  const accessToken = generateAccessToken();
  const row = await onboardings.create({
    data: {
      workspaceId: workspace.id,
      accessToken,
      label: input?.label?.trim() || null,
      formId: form?.id ?? null,
      formSnapshot: snapshot,
    },
    include: { bankAccount: true },
  });
  return toAdminRecord(row);
}

function splitContactName(value: string | null | undefined): { firstName: string | null; lastName: string | null } {
  const parts = value?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts.at(-1) ?? null };
}

export async function createOnboardingLinkForClient(input: {
  workspaceId: string;
  clientId: string;
  label?: string;
  formId?: string;
}): Promise<{ link: OnboardingAdminRecord; created: boolean }> {
  const client = await workspaceClients.findFirst({
    where: { id: input.clientId, workspaceId: input.workspaceId, hidden: false },
    select: {
      id: true,
      name: true,
      website: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      county: true,
      postcode: true,
      country: true,
      primaryContactName: true,
      primaryContactEmail: true,
      primaryContactPhone: true,
      invoiceEmail: true,
      legalCompanyName: true,
      companyNumber: true,
      vatNumber: true,
      billingAddressLine1: true,
      billingAddressLine2: true,
      billingCity: true,
      billingCounty: true,
      billingPostcode: true,
      billingCountry: true,
    },
  });
  if (!client) throw new Error("Client not found.");

  const existing = await onboardings.findFirst({
    where: {
      workspaceId: input.workspaceId,
      workspaceClientId: client.id,
      status: { in: ["IN_PROGRESS", "SUBMITTED"] },
    },
    include: { bankAccount: true },
    orderBy: { updatedAt: "desc" },
  });
  if (existing) return { link: toAdminRecord(existing), created: false };

  const form = await resolveForm(input.formId);
  const snapshot = (form?.steps ?? getDefaultOnboardingForm()) as unknown as Prisma.InputJsonValue;
  const accessToken = generateAccessToken();
  const contact = splitContactName(client.primaryContactName);
  const billingDiffers = Boolean(
    client.billingAddressLine1 ||
      client.billingAddressLine2 ||
      client.billingCity ||
      client.billingCounty ||
      client.billingPostcode ||
      client.billingCountry,
  );

  const row = await onboardings.create({
    data: {
      workspaceId: input.workspaceId,
      workspaceClientId: client.id,
      accessToken,
      label: input.label?.trim() || `${client.name} - onboarding`,
      formId: form?.id ?? null,
      formSnapshot: snapshot,
      companyName: client.name,
      legalCompanyName: client.legalCompanyName,
      companyNumber: client.companyNumber,
      vatNumber: client.vatNumber,
      contactFirstName: contact.firstName,
      contactLastName: contact.lastName,
      contactEmail: client.primaryContactEmail,
      contactPhone: client.primaryContactPhone,
      invoiceEmail: client.invoiceEmail,
      productUrl: client.website,
      addressLine1: client.addressLine1,
      addressLine2: client.addressLine2,
      city: client.city,
      county: client.county,
      postcode: client.postcode,
      country: client.country,
      billingDiffers,
      billingAddressLine1: client.billingAddressLine1,
      billingAddressLine2: client.billingAddressLine2,
      billingCity: client.billingCity,
      billingCounty: client.billingCounty,
      billingPostcode: client.billingPostcode,
      billingCountry: client.billingCountry,
    },
    include: { bankAccount: true },
  });

  return { link: toAdminRecord(row), created: true };
}

export async function listOnboardingLinks(options?: {
  includeLinked?: boolean;
}): Promise<{ links: OnboardingAdminRecord[] }> {
  const { workspace } = await ensureBaseRecords();
  const rows = await onboardings.findMany({
    where: {
      workspaceId: workspace.id,
      // Once a session has produced a client (on submit) it lives under
      // "Pending review", not here. The Onboarding-links tab is just links
      // that are still out / being filled in.
      ...(options?.includeLinked ? {} : { workspaceClientId: null }),
    },
    include: { bankAccount: true },
    orderBy: { updatedAt: "desc" },
  });
  return { links: rows.map(toAdminRecord) };
}

export async function getOnboardingByTokenPublic(
  token: string,
): Promise<OnboardingPublicPayload | null> {
  if (!token || token.length < 16) return null;
  const row = await onboardings.findUnique({
    where: { accessToken: token },
    include: { bankAccount: true },
  });
  if (!row) return null;
  return toPublicPayload(row);
}

export async function getOnboardingAdmin(
  id: string,
): Promise<OnboardingAdminRecord | null> {
  const row = await onboardings.findUnique({
    where: { id },
    include: { bankAccount: true },
  });
  if (!row) return null;
  return toAdminRecord(row);
}

/**
 * Reveals decrypted bank info for an authed Foundry user. Caller must be
 * authenticated by middleware. The plan calls for this to be audit-logged at
 * the call site — keep that responsibility with the API route, not here.
 */
export async function revealOnboardingBank(
  id: string,
): Promise<{
  accountHolder: string | null;
  bankName: string | null;
  sortCode: string | null;
  accountNumber: string | null;
  iban: string | null;
  swiftBic: string | null;
  currency: string | null;
} | null> {
  const row = await onboardings.findUnique({
    where: { id },
    include: { bankAccount: true },
  });
  if (!row?.bankAccount) return null;
  const b = row.bankAccount;
  return {
    accountHolder: decryptNullable(b.accountHolderCipher),
    bankName: decryptNullable(b.bankNameCipher),
    sortCode: decryptNullable(b.sortCodeCipher),
    accountNumber: decryptNullable(b.accountNumberCipher),
    iban: decryptNullable(b.ibanCipher),
    swiftBic: decryptNullable(b.swiftBicCipher),
    currency: b.currency,
  };
}

export async function autosaveOnboarding(
  token: string,
  input: {
    currentStep?: number;
    billingDiffers?: boolean;
    answers?: Record<string, unknown>;
  },
): Promise<OnboardingPublicPayload | null> {
  const row = await onboardings.findUnique({
    where: { accessToken: token },
    select: { id: true, status: true, answers: true, formSnapshot: true },
  });
  if (!row) return null;
  if (row.status === "LINKED") {
    // Once moved to workflow, the token is read-only.
    return getOnboardingByTokenPublic(token);
  }

  // Route each answer by its field definition (from the row's snapshot): system
  // fields write to their dedicated column, custom fields merge into `answers` JSON.
  // Only field ids present in the snapshot are honoured — a rogue key is ignored.
  const defs = fieldsById(structureFor(row));
  const data: Record<string, string | number | boolean | null | Prisma.InputJsonValue> = {};
  const custom: OnboardingAnswers = isPlainObject(row.answers)
    ? { ...(row.answers as OnboardingAnswers) }
    : {};
  let customTouched = false;

  if (input.answers) {
    for (const [id, raw] of Object.entries(input.answers)) {
      const def = defs.get(id);
      if (!def || !collectsAnswer(def.type) || def.type === "bank_details") continue;
      const { value } = validateAnswer(def, raw);
      if (isSystemBooleanColumn(def.systemKey)) {
        data.billingDiffers = Boolean(value);
      } else if (def.systemKey && isSystemTextColumn(def.systemKey)) {
        data[def.systemKey] = typeof value === "string" ? value : value == null ? null : String(value);
      } else {
        custom[id] = value;
        customTouched = true;
      }
    }
  }
  if (typeof input.billingDiffers === "boolean") {
    data.billingDiffers = input.billingDiffers;
  }
  if (typeof input.currentStep === "number") {
    data.currentStep = input.currentStep;
  }
  if (customTouched) {
    data.answers = custom as Prisma.InputJsonValue;
  }

  await onboardings.update({
    where: { id: row.id },
    data: data as Prisma.ClientOnboardingUpdateInput,
  });
  return getOnboardingByTokenPublic(token);
}

export type BankInput = {
  accountHolder?: string | null;
  bankName?: string | null;
  sortCode?: string | null;
  accountNumber?: string | null;
  iban?: string | null;
  swiftBic?: string | null;
  currency?: string | null;
};

function last4(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  return digits.slice(-4);
}

export async function saveOnboardingBank(
  token: string,
  input: BankInput,
): Promise<OnboardingPublicPayload | null> {
  const row = await onboardings.findUnique({
    where: { accessToken: token },
    select: { id: true, status: true },
  });
  if (!row) return null;
  if (row.status === "LINKED") {
    return getOnboardingByTokenPublic(token);
  }

  const accountNumberPlain = input.accountNumber?.trim() || null;
  const ibanPlain = input.iban?.trim() || null;
  await onboardingBankAccounts.upsert({
    where: { onboardingId: row.id },
    update: {
      accountHolderCipher: encryptNullable(input.accountHolder),
      bankNameCipher: encryptNullable(input.bankName),
      sortCodeCipher: encryptNullable(input.sortCode),
      accountNumberCipher: encryptNullable(accountNumberPlain),
      ibanCipher: encryptNullable(ibanPlain),
      swiftBicCipher: encryptNullable(input.swiftBic),
      currency: input.currency ?? null,
      accountNumberLast4: last4(accountNumberPlain) ?? last4(ibanPlain),
    },
    create: {
      onboardingId: row.id,
      accountHolderCipher: encryptNullable(input.accountHolder),
      bankNameCipher: encryptNullable(input.bankName),
      sortCodeCipher: encryptNullable(input.sortCode),
      accountNumberCipher: encryptNullable(accountNumberPlain),
      ibanCipher: encryptNullable(ibanPlain),
      swiftBicCipher: encryptNullable(input.swiftBic),
      currency: input.currency ?? null,
      accountNumberLast4: last4(accountNumberPlain) ?? last4(ibanPlain),
    },
  });
  return getOnboardingByTokenPublic(token);
}

/**
 * Render custom (non-system) answers as a short text block appended to the new
 * client's notes — custom questions don't map to a client column, so this is how
 * the operator sees them once the onboarding is materialised.
 */
function summariseCustomAnswers(row: OnboardingRow): string {
  if (!isPlainObject(row.answers)) return "";
  const answers = row.answers as OnboardingAnswers;
  const defs = fieldsById(structureFor(row));
  const lines: string[] = [];
  for (const [id, value] of Object.entries(answers)) {
    const def = defs.get(id);
    if (!def || def.systemKey) continue; // only custom fields
    if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) continue;
    let rendered: string;
    if (Array.isArray(value)) {
      rendered = value.map((v) => def.options?.find((o) => o.id === v)?.label ?? v).join(", ");
    } else if (typeof value === "boolean") {
      rendered = value ? "Yes" : "No";
    } else if (def.type === "select") {
      rendered = def.options?.find((o) => o.id === value)?.label ?? String(value);
    } else {
      rendered = String(value);
    }
    lines.push(`${def.label || id}: ${rendered}`);
  }
  return lines.length ? `Onboarding answers\n${lines.join("\n")}` : "";
}

/** Combine the project-goals free-text with any custom-answer summary into notes. */
function buildClientNotes(row: OnboardingRow): string | null {
  const parts = [row.projectGoals?.trim() || "", summariseCustomAnswers(row)].filter(Boolean);
  return parts.length ? parts.join("\n\n") : null;
}

/**
 * Materialise a Pending-review WorkspaceClient from a submitted onboarding row.
 * Creates the client (status = PENDING_REVIEW) from the captured answers and
 * copies the encrypted bank cipher across to ClientBankAccount. Does NOT mutate
 * the onboarding row — the caller links it. Returns the new client id + slug.
 */
async function materializePendingClient(
  row: OnboardingRow,
  workspaceId: string,
): Promise<{ id: string; slug: string }> {
  const contactName = [row.contactFirstName, row.contactLastName]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(" ");
  const companyName = row.companyName?.trim() || contactName || "New client";
  const baseSlug = slugifyClientName(companyName);
  let slug = baseSlug;
  for (let i = 2; i < 50; i++) {
    const exists = await workspaceClients.findUnique({
      where: { workspaceId_slug: { workspaceId, slug } },
      select: { id: true },
    });
    if (!exists) break;
    slug = `${baseSlug}-${i}`;
  }

  const client = await workspaceClients.create({
    data: {
      workspaceId,
      name: companyName,
      slug,
      website: row.productUrl || null,
      addressLine1: row.addressLine1,
      addressLine2: row.addressLine2,
      city: row.city,
      county: row.county,
      postcode: row.postcode,
      country: row.country,
      notes: buildClientNotes(row),
      primaryContactName: contactName || null,
      primaryContactEmail: row.contactEmail,
      primaryContactPhone: row.contactPhone,
      invoiceEmail: row.invoiceEmail,
      legalCompanyName: row.legalCompanyName,
      companyNumber: row.companyNumber,
      vatNumber: row.vatNumber,
      // Billing address only when the client said it differs from HQ.
      ...(row.billingDiffers
        ? {
            billingAddressLine1: row.billingAddressLine1,
            billingAddressLine2: row.billingAddressLine2,
            billingCity: row.billingCity,
            billingCounty: row.billingCounty,
            billingPostcode: row.billingPostcode,
            billingCountry: row.billingCountry,
          }
        : {}),
      status: "PENDING_REVIEW",
    },
  });

  if (row.bankAccount) {
    await clientBankAccounts.create({
      data: {
        clientId: client.id,
        accountHolderCipher: row.bankAccount.accountHolderCipher,
        bankNameCipher: row.bankAccount.bankNameCipher,
        sortCodeCipher: row.bankAccount.sortCodeCipher,
        accountNumberCipher: row.bankAccount.accountNumberCipher,
        ibanCipher: row.bankAccount.ibanCipher,
        swiftBicCipher: row.bankAccount.swiftBicCipher,
        currency: row.bankAccount.currency,
        accountNumberLast4: row.bankAccount.accountNumberLast4,
      },
    });
  }

  return { id: client.id, slug };
}

function optionalText(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

async function applyOnboardingToExistingClient(
  row: OnboardingRow,
  workspaceId: string,
  clientId: string,
): Promise<void> {
  const existing = await workspaceClients.findFirst({
    where: { id: clientId, workspaceId },
    select: { id: true, notes: true },
  });
  if (!existing) throw new Error("Linked client not found.");

  const contactName = [row.contactFirstName, row.contactLastName]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(" ");
  const notes = buildClientNotes(row);
  const billingPatch = row.billingDiffers
    ? {
        billingAddressLine1: optionalText(row.billingAddressLine1),
        billingAddressLine2: optionalText(row.billingAddressLine2),
        billingCity: optionalText(row.billingCity),
        billingCounty: optionalText(row.billingCounty),
        billingPostcode: optionalText(row.billingPostcode),
        billingCountry: optionalText(row.billingCountry),
      }
    : {};

  await workspaceClients.update({
    where: { id: existing.id },
    data: {
      name: optionalText(row.companyName),
      website: optionalText(row.productUrl),
      addressLine1: optionalText(row.addressLine1),
      addressLine2: optionalText(row.addressLine2),
      city: optionalText(row.city),
      county: optionalText(row.county),
      postcode: optionalText(row.postcode),
      country: optionalText(row.country),
      primaryContactName: optionalText(contactName),
      primaryContactEmail: optionalText(row.contactEmail),
      primaryContactPhone: optionalText(row.contactPhone),
      invoiceEmail: optionalText(row.invoiceEmail),
      legalCompanyName: optionalText(row.legalCompanyName),
      companyNumber: optionalText(row.companyNumber),
      vatNumber: optionalText(row.vatNumber),
      notes: notes ? [existing.notes, notes].filter(Boolean).join("\n\n") : undefined,
      ...billingPatch,
    },
  });

  if (row.bankAccount) {
    await clientBankAccounts.upsert({
      where: { clientId: existing.id },
      update: {
        accountHolderCipher: row.bankAccount.accountHolderCipher,
        bankNameCipher: row.bankAccount.bankNameCipher,
        sortCodeCipher: row.bankAccount.sortCodeCipher,
        accountNumberCipher: row.bankAccount.accountNumberCipher,
        ibanCipher: row.bankAccount.ibanCipher,
        swiftBicCipher: row.bankAccount.swiftBicCipher,
        currency: row.bankAccount.currency,
        accountNumberLast4: row.bankAccount.accountNumberLast4,
      },
      create: {
        clientId: existing.id,
        accountHolderCipher: row.bankAccount.accountHolderCipher,
        bankNameCipher: row.bankAccount.bankNameCipher,
        sortCodeCipher: row.bankAccount.sortCodeCipher,
        accountNumberCipher: row.bankAccount.accountNumberCipher,
        ibanCipher: row.bankAccount.ibanCipher,
        swiftBicCipher: row.bankAccount.swiftBicCipher,
        currency: row.bankAccount.currency,
        accountNumberLast4: row.bankAccount.accountNumberLast4,
      },
    });
  }
}

/**
 * Final submit. Validates the required answers, then materialises a
 * PENDING_REVIEW client so the submission lands in Portal immediately (under
 * "Pending review"). The onboarding row is linked to that client and goes
 * read-only. Dan/Harry later flip the client PENDING_REVIEW → ACTIVE.
 */
export async function submitOnboarding(
  token: string,
): Promise<OnboardingPublicPayload | null> {
  const { workspace } = await ensureBaseRecords();
  const row = await onboardings.findUnique({
    where: { accessToken: token },
    include: { bankAccount: true },
  });
  if (!row) return null;
  if (row.status === "SUBMITTED" || row.status === "LINKED") return getOnboardingByTokenPublic(token);

  // Enforce the form's own required fields (the wizard also gates this client-side).
  // Derived from the snapshot so custom forms work — not the old fixed 3-column check.
  const missing = missingRequiredLabels(row);
  if (missing.length > 0) {
    throw new Error(
      `Please complete the required field${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`,
    );
  }

  if (row.workspaceClientId) {
    await applyOnboardingToExistingClient(row, workspace.id, row.workspaceClientId);
    await onboardings.update({
      where: { id: row.id },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
      },
    });
    return getOnboardingByTokenPublic(token);
  }

  const client = await materializePendingClient(row, workspace.id);

  await onboardings.update({
    where: { id: row.id },
    data: {
      status: "SUBMITTED",
      submittedAt: new Date(),
      workspaceClientId: client.id,
    },
  });
  return getOnboardingByTokenPublic(token);
}

/**
 * Move a submitted onboarding to workflow: materialise a WorkspaceClient
 * (status = ACTIVE) from the captured answers, migrate the bank cipher to
 * ClientBankAccount, link the onboarding row, and mark it LINKED so the public
 * URL goes read-only.
 *
 * The plan calls for an intermediate PENDING_REVIEW step that's only visible in
 * Portal — that's covered by listPendingClients() in clients.ts. Here we jump
 * straight to ACTIVE once the operator has hit Move-to-workflow.
 */
export async function moveOnboardingToWorkflow(id: string): Promise<{ slug: string }> {
  const { workspace } = await ensureBaseRecords();
  const row = await onboardings.findUnique({
    where: { id },
    include: { bankAccount: true },
  });
  if (!row) throw new Error("Onboarding session not found.");
  // Idempotent — if this onboarding already produced a client (e.g. via submit),
  // return that client rather than creating a duplicate.
  if (row.workspaceClientId) {
    const existing = await workspaceClients.findUnique({
      where: { id: row.workspaceClientId },
      select: { slug: true },
    });
    if (existing) return { slug: existing.slug };
  }

  const contactName = [row.contactFirstName, row.contactLastName]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(" ");
  const companyName = row.companyName?.trim() || contactName || "New client";
  const baseSlug = slugifyClientName(companyName);
  let slug = baseSlug;
  for (let i = 2; i < 50; i++) {
    const exists = await workspaceClients.findUnique({
      where: { workspaceId_slug: { workspaceId: workspace.id, slug } },
      select: { id: true },
    });
    if (!exists) break;
    slug = `${baseSlug}-${i}`;
  }

  const client = await workspaceClients.create({
    data: {
      workspaceId: workspace.id,
      name: companyName,
      slug,
      website: row.productUrl || null,
      addressLine1: row.addressLine1,
      addressLine2: row.addressLine2,
      city: row.city,
      county: row.county,
      postcode: row.postcode,
      country: row.country,
      notes: buildClientNotes(row),
      primaryContactName: contactName || null,
      primaryContactEmail: row.contactEmail,
      primaryContactPhone: row.contactPhone,
      invoiceEmail: row.invoiceEmail,
      legalCompanyName: row.legalCompanyName,
      companyNumber: row.companyNumber,
      vatNumber: row.vatNumber,
      // Billing address only when the client said it differs from HQ.
      ...(row.billingDiffers
        ? {
            billingAddressLine1: row.billingAddressLine1,
            billingAddressLine2: row.billingAddressLine2,
            billingCity: row.billingCity,
            billingCounty: row.billingCounty,
            billingPostcode: row.billingPostcode,
            billingCountry: row.billingCountry,
          }
        : {}),
      status: "PENDING_REVIEW",
    },
  });

  if (row.bankAccount) {
    await clientBankAccounts.create({
      data: {
        clientId: client.id,
        accountHolderCipher: row.bankAccount.accountHolderCipher,
        bankNameCipher: row.bankAccount.bankNameCipher,
        sortCodeCipher: row.bankAccount.sortCodeCipher,
        accountNumberCipher: row.bankAccount.accountNumberCipher,
        ibanCipher: row.bankAccount.ibanCipher,
        swiftBicCipher: row.bankAccount.swiftBicCipher,
        currency: row.bankAccount.currency,
        accountNumberLast4: row.bankAccount.accountNumberLast4,
      },
    });
  }

  await onboardings.update({
    where: { id: row.id },
    data: {
      status: "LINKED",
      linkedAt: new Date(),
      workspaceClientId: client.id,
    },
  });

  return { slug };
}

export async function deleteOnboardingLink(id: string): Promise<boolean> {
  const existing = await onboardings.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!existing) return false;
  if (existing.status === "LINKED") {
    // Don't delete the audit row once a client has been materialised — the
    // operator should archive the underlying client instead.
    throw new Error("Cannot delete a linked onboarding. Archive the client instead.");
  }
  await onboardings.delete({ where: { id } });
  return true;
}
