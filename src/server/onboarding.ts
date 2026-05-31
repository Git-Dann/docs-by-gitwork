import { Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { encryptNullable, decryptNullable } from "@/lib/encryption";
import { slugifyClientName } from "@/lib/clients";
import { ensureBaseRecords } from "@/server/bootstrap";

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

// Field set the public autosave is allowed to touch — explicitly enumerated so a
// rogue payload can't write to workspaceId / status / token / etc.
const AUTOSAVABLE_FIELDS = [
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

type AutosavableField = (typeof AUTOSAVABLE_FIELDS)[number];

// billingDiffers is a boolean toggle (not a free-text field) but is still
// client-editable, so it rides alongside the string fields in the payload.
export type OnboardingFields = Record<AutosavableField, string | null> & {
  billingDiffers: boolean;
};

export type OnboardingPublicPayload = {
  status: "IN_PROGRESS" | "SUBMITTED" | "LINKED";
  currentStep: number;
  fields: OnboardingFields;
  bank: {
    onFile: boolean;
    currency: string | null;
    accountNumberLast4: string | null;
  };
  submittedAt: string | null;
};

export type OnboardingAdminRecord = OnboardingPublicPayload & {
  id: string;
  accessToken: string;
  label: string | null;
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

function toPublicPayload(row: OnboardingRow): OnboardingPublicPayload {
  const stringFields = AUTOSAVABLE_FIELDS.reduce(
    (acc, key) => {
      const value = row[key as keyof OnboardingRow] as string | null | undefined;
      acc[key] = (value ?? null) as string | null;
      return acc;
    },
    {} as Record<AutosavableField, string | null>,
  );
  const fields: OnboardingFields = {
    ...stringFields,
    billingDiffers: Boolean(row.billingDiffers),
  };
  return {
    status: (row.status as "IN_PROGRESS" | "SUBMITTED" | "LINKED") ?? "IN_PROGRESS",
    currentStep: row.currentStep,
    fields,
    bank: {
      onFile: Boolean(row.bankAccount),
      currency: row.bankAccount?.currency ?? null,
      accountNumberLast4: row.bankAccount?.accountNumberLast4 ?? null,
    },
    submittedAt: row.submittedAt?.toISOString() ?? null,
  };
}

function toAdminRecord(row: OnboardingRow): OnboardingAdminRecord {
  return {
    ...toPublicPayload(row),
    id: row.id,
    accessToken: row.accessToken,
    label: row.label,
    workspaceClientId: row.workspaceClientId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    linkedAt: row.linkedAt?.toISOString() ?? null,
  };
}

export async function createOnboardingLink(input?: { label?: string }) {
  const { workspace } = await ensureBaseRecords();
  const accessToken = generateAccessToken();
  const row = await onboardings.create({
    data: {
      workspaceId: workspace.id,
      accessToken,
      label: input?.label?.trim() || null,
    },
    include: { bankAccount: true },
  });
  return toAdminRecord(row);
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
  input: Partial<
    Record<AutosavableField | "currentStep", string | number | null> & {
      billingDiffers: boolean;
    }
  >,
): Promise<OnboardingPublicPayload | null> {
  const row = await onboardings.findUnique({
    where: { accessToken: token },
    select: { id: true, status: true },
  });
  if (!row) return null;
  if (row.status === "LINKED") {
    // Once moved to workflow, the token is read-only.
    return getOnboardingByTokenPublic(token);
  }

  const data: Record<string, string | number | boolean | null> = {};
  for (const key of AUTOSAVABLE_FIELDS) {
    if (key in input) {
      const v = input[key];
      data[key] = typeof v === "string" ? v.trim() || null : v ?? null;
    }
  }
  if (typeof input.currentStep === "number") {
    data.currentStep = input.currentStep;
  }
  if (typeof input.billingDiffers === "boolean") {
    data.billingDiffers = input.billingDiffers;
  }

  await onboardings.update({
    where: { id: row.id },
    data,
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
      notes: row.projectGoals,
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
  // Already materialised — nothing to do.
  if (row.workspaceClientId) return getOnboardingByTokenPublic(token);

  // Minimum required answers — first name, email, company name. The wizard
  // prevents submit when these are blank, but enforce here too.
  if (!row.contactFirstName?.trim() || !row.contactEmail?.trim() || !row.companyName?.trim()) {
    throw new Error(
      "Please complete the About you and Company steps before submitting.",
    );
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
      notes: row.projectGoals,
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
