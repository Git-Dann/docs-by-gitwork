import { z } from "zod";

export const documentStatusSchema = z.enum([
  "DRAFT",
  "PRODUCT_SIGN_OFF",
  "TECH_SIGN_OFF",
  "IN_REVIEW",
  "APPROVED",
  "SENT",
  "ARCHIVED",
]);

export const sectionSchema = z.object({
  id: z.string().optional(),
  key: z.string(),
  title: z.string().min(1),
  description: z.string().optional(),
  sortOrder: z.number().int().nonnegative(),
  isVisible: z.boolean(),
  data: z.record(z.string(), z.unknown()).or(z.array(z.unknown())),
});

export const costLineItemSchema = z.object({
  id: z.string().optional(),
  category: z.string().min(1),
  itemName: z.string().min(1),
  description: z.string().optional(),
  quantity: z.number().nonnegative(),
  unitCost: z.number().nonnegative(),
  subtotal: z.number().nonnegative().optional(),
  costKind: z.enum(["ONE_OFF", "RECURRING"]),
  sortOrder: z.number().int().nonnegative(),
});

export const costTeamAllocationSchema = z.object({
  id: z.string(),
  teamMemberName: z.string(),
  role: z.string(),
  techStack: z.string(),
  monthsRequired: z.number().nonnegative(),
  dayRate: z.number().nonnegative().nullable().optional(),
  monthlyRate: z.number().nonnegative().nullable().optional(),
  totalCost: z.number().nonnegative().nullable().optional(),
  included: z.boolean(),
});

export const paymentScheduleRowSchema = z.object({
  id: z.string(),
  timelinePhaseId: z.string().optional(),
  phaseLabel: z.string().optional(),
  phaseDuration: z.string().optional(),
  phaseTotal: z.number().nonnegative().nullable().optional(),
  action: z.string(),
  periodCovered: z.string(),
  paymentPercent: z.number().nonnegative().nullable().optional(),
  includedWork: z.string(),
  amount: z.number().nonnegative().nullable().optional(),
});

export const timelinePhaseSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  duration: z.string().min(1),
  summary: z.string().min(1),
  deliverables: z.array(z.string()),
  sortOrder: z.number().int().nonnegative(),
  viewMode: z.enum(["LIST", "MILESTONE"]),
});

export const linkSchema = z.object({
  id: z.string().optional(),
  label: z.string().min(1),
  url: z.string().min(1),
  type: z.enum([
    "INTERNAL_ROUTE",
    "EXTERNAL_URL",
    "DECK_LINK",
    "DOCUMENT_LINK",
    "EMAIL_LINK",
  ]),
  notes: z.string().optional(),
  sortOrder: z.number().int().nonnegative(),
});

export const ctaSchema = z.object({
  id: z.string().optional(),
  role: z.enum(["PRIMARY", "SECONDARY"]),
  label: z.string().min(1),
  destination: z.string().min(1),
  destinationType: z.enum([
    "INTERNAL_ROUTE",
    "EXTERNAL_URL",
    "DECK_LINK",
    "DOCUMENT_LINK",
    "EMAIL_LINK",
  ]),
  sortOrder: z.number().int().nonnegative(),
});

export const assetSchema = z.object({
  id: z.string().optional(),
  sectionId: z.string().optional(),
  type: z.enum([
    "COVER_IMAGE",
    "SECTION_GRAPHIC",
    "DIAGRAM",
    "LOGO",
    "SCREENSHOT",
  ]),
  title: z.string().min(1),
  url: z.string().min(1),
  altText: z.string().min(1),
  placement: z.string().min(1),
  caption: z.string().optional(),
  size: z.enum(["SMALL", "MEDIUM", "LARGE", "FULL"]),
  alignment: z.enum(["LEFT", "CENTER", "RIGHT", "FULL"]),
  sortOrder: z.number().int().nonnegative(),
});

export const metadataSchema = z.object({
  client: z.string(),
  owner: z.string(),
  expiryDate: z.string().optional(),
  version: z.string(),
  notes: z.string().optional(),
  internalComments: z.string().optional(),
  productSignOff: z.boolean(),
  techSignOff: z.boolean(),
  approvalChecked: z.boolean(),
});

const requiredTrimmedString = z.string().trim().min(1);
const currencyCodeSchema = z
  .string()
  .trim()
  .length(3)
  .transform((value) => value.toUpperCase());

export const rateBillingPeriodSchema = z.enum(["DAY", "WEEK", "MONTH"]);
export const pipelineStatusSchema = z.enum([
  "SOURCED",
  "INVITED",
  "ASSESSMENT_IN_PROGRESS",
  "CODECLEAR_COMPLETE",
  "PLACED",
  "RECHECK_DUE",
]);
export const codeClearTierSchema = z.enum(["TIER_1", "TIER_2", "TIER_3"]);
export const identityConfidenceSchema = z.enum(["HIGH", "MEDIUM", "LOW", "PENDING"]);
export const candidateSignalSourceSchema = z.enum([
  "GITHUB",
  "LINKEDIN",
  "CV",
  "PORTFOLIO",
  "INTERVIEW",
  "REFERENCE",
  "ASSESSMENT",
]);

export const rateCardPersonCreateSchema = z.object({
  name: requiredTrimmedString,
  area: requiredTrimmedString,
  sourceRate: z.coerce.number().positive(),
  sourceCurrencyCode: currencyCodeSchema,
  billingPeriod: rateBillingPeriodSchema.default("MONTH"),
});

const clientContactFields = {
  website: z.string().trim().optional(),
  addressLine1: z.string().trim().optional(),
  addressLine2: z.string().trim().optional(),
  city: z.string().trim().optional(),
  postcode: z.string().trim().optional(),
  country: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  primaryContactName: z.string().trim().optional(),
  primaryContactEmail: z.string().trim().optional(),
  primaryContactPhone: z.string().trim().optional(),
  googleDriveFolderUrl: z.string().trim().optional(),
  clickupUrl: z.string().trim().optional(),
  slackChannelId: z.string().trim().optional(),
  legalCompanyName: z.string().trim().optional(),
  companyNumber: z.string().trim().optional(),
  vatNumber: z.string().trim().optional(),
  retainerDays: z.coerce.number().int().min(0).max(31).nullable().optional(),
};

export const clientCreateSchema = z.object({
  name: requiredTrimmedString,
  logoUrl: z.string().trim().url().optional(),
  ...clientContactFields,
});

export const clientUpdateSchema = z
  .object({
    name: requiredTrimmedString.optional(),
    logoUrl: z.string().trim().url().optional(),
    ...clientContactFields,
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one client field is required.",
  });

export const clientPlatformCreateSchema = z.object({
  name: requiredTrimmedString,
  platformType: z.string().trim().optional(),
  url: z.string().trim().optional(),
  stagingUrl: z.string().trim().optional(),
  repoUrl: z.string().trim().optional(),
  credentials: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  previewImageUrl: z.string().optional(),
});

export const clientPlatformUpdateSchema = clientPlatformCreateSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one platform field is required.",
  });

export const clientDesignCreateSchema = z.object({
  name: requiredTrimmedString,
  url: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  previewImageUrl: z.string().optional(),
});

export const clientDesignUpdateSchema = clientDesignCreateSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one design field is required.",
  });

export const proofCreateSchema = z.object({
  title: z.string().trim().min(1),
  markdown: z.string().optional(),
  proposalId: z.string().cuid().nullable().optional(),
});

export const proofUpdateSchema = z
  .object({
    proposalId: z.string().cuid().nullable().optional(),
    touch: z.boolean().optional(),
    archived: z.boolean().optional(),
    title: z.string().trim().min(1).optional(),
    markdown: z.string().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one proof field is required.",
  });

export const rateCardPersonUpdateSchema = z
  .object({
    name: requiredTrimmedString.optional(),
    area: requiredTrimmedString.optional(),
    sourceRate: z.coerce.number().positive().optional(),
    sourceCurrencyCode: currencyCodeSchema.optional(),
    billingPeriod: rateBillingPeriodSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one rate card field is required.",
  });

const optionalTrimmedString = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => {
    if (value === undefined) {
      return undefined;
    }

    if (value === null) {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  });

const scoreMetricSchema = z.coerce.number().min(0).max(100);
const githubHandleSchema = requiredTrimmedString.transform((value) =>
  value.replace(/^@+/, ""),
);

// Shared by create + update: the validation-product fields beyond the
// original lightweight pipeline. URLs are accepted as plain strings (not
// strict z.string().url()) so legacy data with bare domains still validates.
const candidateOriginSchema = z.enum(["INTERNAL", "EXTERNAL"]);
const candidateAvailabilitySchema = z.enum(["AVAILABLE", "ENGAGED", "UNAVAILABLE"]);

export const candidateCreateSchema = z.object({
  name: requiredTrimmedString,
  githubHandle: githubHandleSchema,
  email: optionalTrimmedString,
  primaryStack: requiredTrimmedString,
  techStacks: z.array(requiredTrimmedString).min(1).optional(),
  signalSources: z.array(candidateSignalSourceSchema).min(1).optional(),
  location: optionalTrimmedString,
  bio: optionalTrimmedString,
  // Allow admin to set tier on create (will be overwritten by the derived
  // value once a score lands unless tierManualOverride is also set).
  tier: codeClearTierSchema.default("TIER_3"),
  tierManualOverride: codeClearTierSchema.nullable().optional(),
  rateCardPersonId: z.string().cuid().nullable().optional(),
  origin: candidateOriginSchema.default("INTERNAL"),
  published: z.boolean().optional(),
  linkedinUrl: optionalTrimmedString,
  cvUrl: optionalTrimmedString,
  portfolioUrl: optionalTrimmedString,
  yearsExperience: z.coerce.number().int().min(0).max(60).nullable().optional(),
  hourlyRate: z.coerce.number().min(0).nullable().optional(),
  currency: z
    .string()
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase())
    .nullable()
    .optional(),
  timezone: optionalTrimmedString,
  availability: candidateAvailabilitySchema.nullable().optional(),
});

export const candidateUpdateSchema = z
  .object({
    name: optionalTrimmedString,
    githubHandle: githubHandleSchema.optional(),
    email: optionalTrimmedString,
    primaryStack: optionalTrimmedString,
    techStacks: z.array(requiredTrimmedString).optional(),
    signalSources: z.array(candidateSignalSourceSchema).optional(),
    location: optionalTrimmedString,
    bio: optionalTrimmedString,
    status: pipelineStatusSchema.optional(),
    tier: codeClearTierSchema.optional(),
    tierManualOverride: codeClearTierSchema.nullable().optional(),
    rateCardPersonId: z.string().cuid().nullable().optional(),
    recheckDueAt: z.coerce.date().nullable().optional(),
    origin: candidateOriginSchema.optional(),
    published: z.boolean().optional(),
    linkedinUrl: optionalTrimmedString,
    cvUrl: optionalTrimmedString,
    portfolioUrl: optionalTrimmedString,
    yearsExperience: z.coerce.number().int().min(0).max(60).nullable().optional(),
    hourlyRate: z.coerce.number().min(0).nullable().optional(),
    currency: z
      .string()
      .trim()
      .length(3)
      .transform((value) => value.toUpperCase())
      .nullable()
      .optional(),
    timezone: optionalTrimmedString,
    availability: candidateAvailabilitySchema.nullable().optional(),
    requestSignalSource: candidateSignalSourceSchema.optional(),
    scrapeSignalSource: candidateSignalSourceSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one candidate field is required.",
  });

/** TechStack create/update — admin-only endpoint inputs. */
export const techStackCreateSchema = z.object({
  name: requiredTrimmedString,
  category: optionalTrimmedString,
  color: optionalTrimmedString,
});

export const techStackUpdateSchema = techStackCreateSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

/** Bulk-import — accepts a small array of candidate rows with permissive
 *  field types so an upstream CSV → JSON helper can hand them straight here. */
export const candidateBulkImportSchema = z.object({
  candidates: z
    .array(
      z.object({
        name: requiredTrimmedString,
        githubHandle: githubHandleSchema,
        primaryStack: requiredTrimmedString,
        techStacks: z.array(requiredTrimmedString).optional(),
        email: optionalTrimmedString,
        linkedinUrl: optionalTrimmedString,
        cvUrl: optionalTrimmedString,
        portfolioUrl: optionalTrimmedString,
        yearsExperience: z.coerce.number().int().min(0).max(60).optional(),
        hourlyRate: z.coerce.number().min(0).optional(),
        currency: z.string().trim().length(3).optional(),
        timezone: optionalTrimmedString,
        location: optionalTrimmedString,
        bio: optionalTrimmedString,
      }),
    )
    .min(1)
    .max(500),
  origin: candidateOriginSchema.default("EXTERNAL"),
});

export const candidateBulkUpdateSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("MOVE_STAGE"),
    ids: z.array(z.string().cuid()).min(1),
    status: pipelineStatusSchema,
  }),
  z.object({
    action: z.literal("FLAG_RECHECK"),
    ids: z.array(z.string().cuid()).min(1),
    recheckDueAt: z.coerce.date().optional(),
  }),
]);

export const candidateNoteSchema = z.object({
  body: requiredTrimmedString,
});

export const candidateScoreSchema = z
  .object({
    technicalDepth: scoreMetricSchema.optional(),
    codeQuality: scoreMetricSchema.optional(),
    aiFluency: scoreMetricSchema.optional(),
    deliveryReadiness: scoreMetricSchema.optional(),
    identityConfidence: identityConfidenceSchema.optional(),
    taskScore: scoreMetricSchema.nullable().optional(),
    taskTimeSeconds: z.coerce.number().int().min(0).nullable().optional(),
    taskAiReview: optionalTrimmedString,
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one score field is required.",
  });

export const proposalCreateSchema = z.object({
  title: z.string().min(1).default("Untitled Proposal"),
  clientName: z.string().optional(),
  clientId: z.string().cuid().optional(),
  productName: z.string().optional(),
  templateId: z.string().optional(),
  // Document type for the new record. Defaults to PROPOSAL at the API layer if omitted, so
  // existing callers (legacy "New document" flow that didn't know about types) still work.
  documentType: z.enum(["PROPOSAL", "SLA", "SOW", "MSA", "NDA", "CO", "DSA", "OTHER"]).optional(),
});

export const supportClientCreateSchema = z.object({
  name: requiredTrimmedString,
  slug: z.string().trim().min(1),
  status: z.enum(["active", "inactive"]).optional(),
  supportDaysPerMonth: z.coerce.number().int().positive().optional(),
  supportDaysUsed: z.coerce.number().int().nonnegative().optional(),
  reportingRecipient: z.string().trim().optional(),
  reportDueDay: z.coerce.number().int().min(1).max(31).optional(),
  workspaceClientId: z.string().cuid().optional(),
});

// Optional repo-scope inputs shared by create + update. When the placement is
// linked to a ClientPlatform, these define what part of that platform's repo
// the dev is responsible for, for the scoped GitHub validation scan.
const placementRepoScopeFields = {
  clientPlatformId: z.string().cuid().nullable().optional(),
  repoPaths: z.array(z.string().trim().min(1)).max(20).optional(),
  repoBranch: z
    .union([z.string().trim().min(1), z.literal(""), z.null()])
    .optional()
    .transform((value) => (value === "" || value === undefined ? undefined : value)),
};

export const placementCreateSchema = z.object({
  clientId: z.string().cuid().optional(),
  clientName: requiredTrimmedString,
  projectName: requiredTrimmedString,
  startDate: z.coerce.date(),
  endDate: z.coerce.date().nullable().optional(),
  // Daily allocation. Defaults to 100 (= full day). 50 = half-day.
  allocationPercent: z.coerce.number().int().min(1).max(100).optional(),
  notes: optionalTrimmedString,
  ...placementRepoScopeFields,
});

// Update an existing placement. Superset of fields — iOS "schedule off"
// just sends { endDate }, the web edit form sends the full set. All fields
// optional individually; the refine guarantees at least one is provided.
export const placementUpdateSchema = z
  .object({
    clientId: z.string().cuid().nullable().optional(),
    clientName: requiredTrimmedString.optional(),
    projectName: requiredTrimmedString.optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().nullable().optional(),
    allocationPercent: z.coerce.number().int().min(1).max(100).optional(),
    notes: optionalTrimmedString,
    ...placementRepoScopeFields,
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one placement field is required.",
  });

// Used by the Code roster's per-dev "Current client" dropdown.
// Pass clientId to assign, omit (or pass null) to unassign.
export const currentClientUpdateSchema = z.object({
  clientId: z.string().cuid().nullable().optional(),
});

// Multi-client version. Empty array → unassigned everywhere. The endpoint
// closes any open placement whose clientId isn't in this list and opens new
// placements for ids that don't have one open yet.
export const currentClientsUpdateSchema = z.object({
  clientIds: z.array(z.string().cuid()).max(20),
});

export const proposalUpdateSchema = z.object({
  title: z.string().optional(),
  status: documentStatusSchema.optional(),
  productName: z.string().optional(),
  clientName: z.string().optional(),
  summary: z.string().optional(),
  version: z.string().optional(),
  expiresAt: z.string().nullable().optional(),
  metadata: metadataSchema.partial().optional(),
  exportSettings: z.record(z.string(), z.unknown()).optional(),
  sections: z.array(sectionSchema).optional(),
  costLineItems: z.array(costLineItemSchema).optional(),
  timelinePhases: z.array(timelinePhaseSchema).optional(),
  links: z.array(linkSchema).optional(),
  ctas: z.array(ctaSchema).optional(),
  assets: z.array(assetSchema).optional(),
  // P0.4 + P5.18
  labels: z.array(z.string().min(1).max(40)).max(20).optional(),
  parentId: z.string().nullable().optional(),
});

export const proposalCostingSchema = z.object({
  costLineItems: z.array(costLineItemSchema),
  currency: z.enum(["GBP", "USD", "EUR"]).optional(),
  discount: z.number().optional(),
  taxRate: z.number().optional(),
  monthlyCostSummary: z.string().optional(),
  durationSummary: z.string().optional(),
  totalCostLabel: z.string().optional(),
  supportingNarrative: z.string().optional(),
  paymentScheduleIntro: z.string().optional(),
  paymentTerms: z.string().optional(),
  vatNotice: z.string().optional(),
  ipTransferNotice: z.string().optional(),
  teamAllocations: z.array(costTeamAllocationSchema).optional(),
  paymentSchedule: z.array(paymentScheduleRowSchema).optional(),
  additionalNotes: z.array(z.string()).optional(),
  assignmentTimelineMode: z.record(z.string(), z.enum(["DEFAULT", "MANUAL"])).optional(),
});

export const proposalTimelineSchema = z.object({
  timelinePhases: z.array(timelinePhaseSchema),
  viewMode: z.enum(["LIST", "MILESTONE"]).optional(),
});

export const proposalEngagementSchema = z.object({
  ctas: z.array(ctaSchema),
  links: z.array(linkSchema),
});

export const proposalExportSchema = z.object({
  format: z.enum(["PRINT", "PDF", "SHARE_LINK"]).default("PRINT"),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export const pulseScanInputTypeSchema = z.enum(["URL", "GITHUB_REPO", "FREE_TEXT"]);

export const pulseScanCreateSchema = z
  .object({
    projectName: z.string().trim().min(1).max(200),
    inputType: pulseScanInputTypeSchema,
    inputUrl: z.string().trim().optional(),
    inputGithubRepo: z.string().trim().optional(),
    inputDescription: z.string().max(10000).optional(),
    platform: z.string().trim().max(50).optional(),
    clientId: z.string().cuid().optional(),
    aiProvider: z.enum(["ANTHROPIC", "OPENAI", "GEMINI", "LOCAL"]).optional(),
    competitorUrls: z.array(z.string().trim().min(1)).max(3).optional(),
    projectDescription: z.string().trim().max(500).optional(),
    testEmail: z.string().email().optional(),
    testPassword: z.string().max(200).optional(),
  })
  .refine(
    (d) => {
      if (d.inputType === "URL") return Boolean(d.inputUrl);
      if (d.inputType === "GITHUB_REPO") return Boolean(d.inputGithubRepo);
      if (d.inputType === "FREE_TEXT") return Boolean(d.inputDescription);
      return false;
    },
    { message: "Input data must match inputType." },
  );

// ─── Client Onboarding ──────────────────────────────────────────────────────

export const workspaceClientStatusSchema = z.enum([
  "PENDING_REVIEW",
  "ACTIVE",
  "ARCHIVED",
]);

export const onboardingLinkCreateSchema = z.object({
  label: z.string().trim().max(200).optional(),
  // Which form to mint from. Omitted → the workspace default form.
  formId: z.string().trim().min(1).max(64).optional(),
});

// Shared: optional + nullable trimmed string — a field can save partial or clear.
const optionalNullableString = z.string().trim().max(2000).nullable().optional();

// Public autosave — answers keyed by field id; the server routes each answer to its
// system column or into the answers JSON using the link's form snapshot. currentStep
// and the billing toggle stay first-class. All optional so a partial step can save.
export const onboardingAutosaveSchema = z
  .object({
    currentStep: z.number().int().min(0).max(50).optional(),
    billingDiffers: z.boolean().optional(),
    answers: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (v) =>
      v.currentStep !== undefined || v.billingDiffers !== undefined || v.answers !== undefined,
    { message: "At least one field is required." },
  );

export const onboardingBankSchema = z.object({
  accountHolder: optionalNullableString,
  bankName: optionalNullableString,
  sortCode: optionalNullableString,
  accountNumber: optionalNullableString,
  iban: optionalNullableString,
  swiftBic: optionalNullableString,
  currency: z
    .string()
    .trim()
    .length(3)
    .toUpperCase()
    .nullable()
    .optional(),
});

export const onboardingSubmitSchema = z.object({
  confirm: z.literal(true),
});

// ─── Onboarding forms (templates) ─────────────────────────────────────────────

const onboardingFieldTypeSchema = z.enum([
  "short_text",
  "long_text",
  "email",
  "phone",
  "url",
  "number",
  "select",
  "multiselect",
  "checkbox",
  "bank_details",
  "static",
]);

const onboardingFieldSchema = z.object({
  id: z.string().trim().min(1).max(64),
  type: onboardingFieldTypeSchema,
  label: z.string().max(300),
  hint: z.string().max(500).optional(),
  placeholder: z.string().max(200).optional(),
  required: z.boolean().optional(),
  systemKey: z.string().trim().max(64).optional(),
  options: z
    .array(z.object({ id: z.string().trim().min(1).max(64), label: z.string().max(200) }))
    .max(40)
    .optional(),
  config: z
    .object({
      width: z.enum(["full", "half"]).optional(),
      default: z.string().max(200).optional(),
      maxLength: z.number().int().positive().max(20000).optional(),
      rows: z.number().int().positive().max(40).optional(),
      transform: z.enum(["upper", "alnum_upper"]).optional(),
      datalist: z.enum(["uk-banks"]).optional(),
      body: z.string().max(4000).optional(),
    })
    .optional(),
  showIf: z
    .object({
      fieldId: z.string().trim().min(1).max(64),
      equals: z.union([z.string(), z.number(), z.boolean()]),
    })
    .optional(),
});

const onboardingStepSchema = z.object({
  id: z.string().trim().min(1).max(64),
  key: z.string().trim().min(1).max(64),
  title: z.string().max(200),
  blurb: z.string().max(2000).optional(),
  fields: z.array(onboardingFieldSchema).max(60),
});

export const onboardingFormStructureSchema = z.object({
  welcome: z.object({
    eyebrow: z.string().max(120).optional(),
    heading: z.string().max(200),
    subheading: z.string().max(300).optional(),
    bullets: z.array(z.string().max(300)).max(8),
    ctaLabel: z.string().max(60).optional(),
  }),
  steps: z.array(onboardingStepSchema).max(20),
  review: z.object({
    blurb: z.string().max(500).optional(),
    legal: z.string().max(1000).optional(),
    agreement: z.string().max(1000).optional(),
  }),
});

export const onboardingFormCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  cloneFromId: z.string().trim().min(1).max(64).optional(),
  structure: onboardingFormStructureSchema.optional(),
});

export const onboardingFormUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    structure: onboardingFormStructureSchema.optional(),
    isDefault: z.boolean().optional(),
    isArchived: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });

export const clientStatusUpdateSchema = z.object({
  status: workspaceClientStatusSchema,
});

// ── Backstage (internal ops): leave + expenses ──────────────────────────

export const leaveTypeSchema = z.enum(["ANNUAL", "SICK", "UNPAID", "OTHER"]);

export const leaveStatusSchema = z.enum([
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
]);

const isoDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}/, "Date must be ISO-8601 (YYYY-MM-DD or full ISO)");

export const leaveRequestInputSchema = z
  .object({
    type: leaveTypeSchema,
    startDate: isoDateString,
    endDate: isoDateString,
    halfDayStart: z.boolean().optional().default(false),
    halfDayEnd: z.boolean().optional().default(false),
    reason: z.string().max(500).optional(),
    // Admin-only: file a leave request on behalf of another user
    userId: z.string().cuid().optional(),
  })
  .refine((v) => new Date(v.endDate) >= new Date(v.startDate), {
    message: "endDate must be on or after startDate",
    path: ["endDate"],
  });

export const leaveRequestUpdateSchema = z.object({
  startDate: isoDateString.optional(),
  endDate: isoDateString.optional(),
  type: leaveTypeSchema.optional(),
  halfDayStart: z.boolean().optional(),
  halfDayEnd: z.boolean().optional(),
  reason: z.string().max(500).optional(),
});

export const approvalDecisionSchema = z.object({
  note: z.string().max(1000).optional(),
});

export const expenseStatusSchema = z.enum([
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "REIMBURSED",
]);

export const expenseCategorySchema = z.enum([
  "TRAVEL",
  "EQUIPMENT",
  "SOFTWARE",
  "MEALS",
  "ACCOMMODATION",
  "OTHER",
]);

export const expenseInputSchema = z.object({
  amount: z.number().positive().max(1_000_000),
  currency: z.string().length(3).default("GBP"),
  category: expenseCategorySchema,
  vendor: z.string().max(120).optional(),
  occurredOn: isoDateString,
  notes: z.string().max(1000).optional(),
  // Admin-only: file an expense on behalf of another user
  userId: z.string().cuid().optional(),
});

export const expenseUpdateSchema = expenseInputSchema.partial().omit({ userId: true });

export const expenseReviewSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "REIMBURSED"]),
  note: z.string().max(1000).optional(),
});

export const backstageListQuerySchema = z.object({
  scope: z.enum(["me", "team", "all"]).optional().default("me"),
  status: z.string().optional(),
  limit: z.coerce.number().int().positive().max(200).optional().default(50),
  cursor: z.string().optional(),
});

export const memberCountrySchema = z.object({
  countryCode: z.string().length(2).regex(/^[A-Z]{2}$/, "Must be ISO-3166-1 alpha-2"),
});

export const memberAnnualLeaveSchema = z.object({
  annualLeaveDays: z.number().int().nonnegative().max(366).nullable(),
});

export const backstagePermissionSchema = z.object({
  canApprove: z.boolean(),
});

// ── Tasks (Portal task tracker + daily standups) ─────────────────────────

export const taskStatusSchema = z.enum([
  "BACKLOG",
  "TODO",
  "DOING",
  "IN_REVIEW",
  "DONE",
]);

export const taskPrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH"]);

export const taskInputSchema = z.object({
  clientId: z.string().cuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(10000).optional(),
  acceptanceCriteria: z.string().max(10000).nullable().optional(),
  status: taskStatusSchema.optional().default("BACKLOG"),
  priority: taskPrioritySchema.optional().default("MEDIUM"),
  assigneeIds: z.array(z.string().cuid()).optional(),
  featureBlockId: z.string().cuid().nullable().optional(),
  parentId: z.string().cuid().nullable().optional(),
  dueDate: isoDateString.nullable().optional(),
});

export const taskUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(10000).nullable().optional(),
  acceptanceCriteria: z.string().max(10000).nullable().optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  assigneeIds: z.array(z.string().cuid()).optional(),
  featureBlockId: z.string().cuid().nullable().optional(),
  dueDate: isoDateString.nullable().optional(),
});

/**
 * Drag move. The client computes the new fractional `orderKey` as the midpoint
 * between the drop target's neighbours (it already holds the full board), so the
 * server just persists status + key.
 */
export const taskMoveSchema = z.object({
  status: taskStatusSchema,
  orderKey: z.number().finite(),
});

export const taskCommentSchema = z.object({
  body: z.string().min(1).max(5000),
});

export const taskListQuerySchema = z.object({
  clientId: z.string().cuid().optional(),
  status: taskStatusSchema.optional(),
  // "me" resolves to the caller server-side; a cuid filters to that assignee.
  assigneeId: z.string().optional(),
});

/** Bulk edit — apply one patch (any subset of fields) to many tasks at once. */
export const taskBatchUpdateSchema = z.object({
  ids: z.array(z.string().cuid()).min(1).max(1000),
  patch: z
    .object({
      status: taskStatusSchema.optional(),
      priority: taskPrioritySchema.optional(),
      assigneeIds: z.array(z.string().cuid()).optional(),
      featureBlockId: z.string().cuid().nullable().optional(),
      dueDate: isoDateString.nullable().optional(),
    })
    .refine((p) => Object.keys(p).length > 0, { message: "Patch must set at least one field" }),
});

export const taskBatchDeleteSchema = z.object({
  ids: z.array(z.string().cuid()).min(1).max(1000),
});

export const dailyUpdatePushSchema = z.object({
  phase: z.enum(["AM", "PM"]),
  weekPlan: z.string().max(5000).optional(),
  note: z.string().max(2000).optional(),
});

export const clientAssignmentSchema = z.object({
  clientIds: z.array(z.string().cuid()),
});

// ── Feature blocks ("lists") + timeline share ───────────────────────────

export const featureBlockInputSchema = z
  .object({
    clientId: z.string().cuid(),
    name: z.string().min(1).max(160),
    description: z.string().max(2000).optional(),
    // Optional — a block becomes a Gantt bar only once both dates are set.
    startDate: isoDateString.nullable().optional(),
    endDate: isoDateString.nullable().optional(),
    color: z.string().max(20).optional(),
  })
  .refine((v) => !v.startDate || !v.endDate || new Date(v.endDate) >= new Date(v.startDate), {
    message: "endDate must be on or after startDate",
    path: ["endDate"],
  });

export const featureBlockUpdateSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  description: z.string().max(2000).nullable().optional(),
  startDate: isoDateString.nullable().optional(),
  endDate: isoDateString.nullable().optional(),
  color: z.string().max(20).nullable().optional(),
  orderKey: z.number().finite().optional(),
});

export const timelineShareSchema = z.object({
  enabled: z.boolean(),
});

// ── Milestones (single-date timeline markers) ───────────────────────────

export const milestoneInputSchema = z.object({
  clientId: z.string().cuid(),
  name: z.string().min(1).max(160),
  date: isoDateString,
  description: z.string().max(2000).optional(),
  color: z.string().max(20).optional(),
});

export const milestoneUpdateSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  date: isoDateString.optional(),
  description: z.string().max(2000).nullable().optional(),
  color: z.string().max(20).nullable().optional(),
});

// ── Scribe (meeting notes) ───────────────────────────────────────────────
export const meetingIngestSchema = z.object({
  calendarEventId: z.string().min(1),
  meetingCode: z.string().min(1), // bare code or full Meet URL
  title: z.string().min(1),
  start: z.string().optional(),
  end: z.string().optional(),
  attendees: z.array(z.string()).optional(),
});

export const meetingUpdateSchema = z
  .object({
    actionItemId: z.string().optional(),
    done: z.boolean().optional(),
    clientId: z.string().nullable().optional(),
  })
  .refine(
    (v) => (v.actionItemId !== undefined && v.done !== undefined) || v.clientId !== undefined,
    { message: "Provide actionItemId + done to toggle an item, or clientId to reassign." },
  );
