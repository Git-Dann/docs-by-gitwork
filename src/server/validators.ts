import { z } from "zod";
import { normalizeGithubRepo } from "@/lib/github";

export const documentStatusSchema = z.enum([
  "DRAFT",
  "PRODUCT_SIGN_OFF",
  "TECH_SIGN_OFF",
  "IN_REVIEW",
  "APPROVED",
  "SENT",
  "ACCEPTED",
  "DECLINED",
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
  // Presenter-only notes (presentation mode). Optional; empty/whitespace allowed.
  speakerNotes: z.string().optional(),
  // Per-section text scale (S / M / L). Applied as a CSS zoom on the section wrapper.
  fontSize: z.enum(["sm", "base", "lg"]).optional(),
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
  approvalTrackEnabled: z.boolean().optional(),
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

export const workspaceClientStatusSchema = z.enum([
  "PENDING_REVIEW",
  "ACTIVE",
  "ARCHIVED",
  "LEAD",
  "INACTIVE",
]);

export const leadStageSchema = z.enum([
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "PROPOSAL_SENT",
  "WON",
  "LOST",
]);

export const clientEngagementTypeSchema = z.enum([
  "FIXED_SCOPE",
  "PHASED",
  "ROLLING",
  "RETAINER",
]);

export const touchpointTypeSchema = z.enum(["CALL", "EMAIL", "MEETING", "NOTE"]);

/** Optional ISO date string (or empty/null to clear) coerced through trim. */
const optionalDateString = z.string().trim().nullable().optional();

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
  slackInternalChannelId: z.string().trim().optional(),
  slackInternalChannelName: z.string().trim().optional(),
  slackExternalChannelId: z.string().trim().optional(),
  slackExternalChannelName: z.string().trim().optional(),
  legalCompanyName: z.string().trim().optional(),
  companyNumber: z.string().trim().optional(),
  vatNumber: z.string().trim().optional(),
  retainerDays: z.coerce.number().int().min(0).max(31).nullable().optional(),
  retainerDaysUsed: z.coerce.number().int().min(0).max(31).nullable().optional(),
  // Engagement structure + project end date — optional/clearable.
  engagementType: clientEngagementTypeSchema.nullable().optional(),
  endDate: optionalDateString,
  // Lead (status LEAD) + paused-client (status INACTIVE) fields — all optional/clearable.
  leadSource: z.string().trim().nullable().optional(),
  leadStage: leadStageSchema.nullable().optional(),
  leadFollowUpAt: optionalDateString,
  leadValue: z.coerce.number().int().min(0).max(100_000_000).nullable().optional(),
  leadValueCurrency: z.string().trim().max(3).nullable().optional(),
  resumeAt: optionalDateString,
  pauseNote: z.string().trim().nullable().optional(),
};

export const clientCreateSchema = z.object({
  name: requiredTrimmedString,
  logoUrl: z.string().trim().url().optional(),
  /** Initial status — omit for a normal ACTIVE client; pass "LEAD" from "Add lead". */
  status: workspaceClientStatusSchema.optional(),
  ...clientContactFields,
  /** Phase 3: optionally provision Slack channels for this client at create time.
   *  Failure to provision NEVER blocks client creation — the error lands on
   *  `WorkspaceClient.slackProvisionError` and the Edit modal shows a retry button. */
  createInternalChannel: z.boolean().optional(),
  createExternalChannel: z.boolean().optional(),
  externalInviteeEmail: z.string().trim().email().optional(),
  customInternalName: z.string().trim().optional(),
  customExternalName: z.string().trim().optional(),
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
  // Encrypted at rest (AES-256-GCM). Omit on update to leave existing creds untouched.
  username: z.string().optional(),
  password: z.string().optional(),
  notes: z.string().trim().optional(),
  previewImageUrl: z.string().optional(),
  featuredInWiki: z.boolean().optional(),
});

// Product team = ordered list of workspace-member User ids shown on the wiki header.
export const clientProductTeamSchema = z.object({
  userIds: z.array(z.string().cuid()).max(20),
});

export const clientPlatformUpdateSchema = clientPlatformCreateSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one platform field is required.",
  });

// A platform "login" (credential set). username/password encrypted at rest.
export const platformLoginCreateSchema = z.object({
  label: z.string().trim().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
});

export const platformLoginUpdateSchema = z
  .object({
    label: z.string().trim().nullable().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
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

export const clientDocumentLinkCreateSchema = z.object({
  name: requiredTrimmedString,
  url: z.string().trim().url("Enter a valid document URL (including https://)."),
  notes: z.string().trim().optional(),
});

export const clientDocumentLinkUpdateSchema = clientDocumentLinkCreateSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
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
const candidateDevGroupSchema = z.enum(["BENCH", "PRO_BONO"]);
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
  wikiBio: z.string().trim().max(25, "Wiki bio must be 25 characters or fewer").nullable().optional(),
  // Allow admin to set tier on create (will be overwritten by the derived
  // value once a score lands unless tierManualOverride is also set).
  tier: codeClearTierSchema.default("TIER_3"),
  tierManualOverride: codeClearTierSchema.nullable().optional(),
  rateCardPersonId: z.string().cuid().nullable().optional(),
  origin: candidateOriginSchema.default("INTERNAL"),
  devGroup: candidateDevGroupSchema.default("BENCH"),
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
    wikiBio: z.string().trim().max(25, "Wiki bio must be 25 characters or fewer").nullable().optional(),
    status: pipelineStatusSchema.optional(),
    tier: codeClearTierSchema.optional(),
    tierManualOverride: codeClearTierSchema.nullable().optional(),
    rateCardPersonId: z.string().cuid().nullable().optional(),
    recheckDueAt: z.coerce.date().nullable().optional(),
    origin: candidateOriginSchema.optional(),
    devGroup: candidateDevGroupSchema.optional(),
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
  z.object({
    // Bulk move between Bench / Off Bench. Gated to ADMIN+ in the
    // route handler — not exposed to staff/dev roles.
    action: z.literal("SET_DEV_GROUP"),
    ids: z.array(z.string().cuid()).min(1),
    devGroup: z.enum(["BENCH", "PRO_BONO"]),
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
  documentType: z
    .enum(["PROPOSAL", "SLA", "SOW", "MSA", "NDA", "CO", "DSA", "HANDOVER", "REPORT", "BRIEF", "DECK", "OTHER"])
    .optional(),
  // DECK only — the starting deck's slug (src/lib/deck-templates.ts). Recorded on
  // metadata.deckTemplate; the Deck app materialises the slides on first open.
  deckTemplate: z.string().trim().max(64).optional(),
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
  clientId: z.string().cuid().nullable().optional(),
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
  discount: z.number().nonnegative().optional(),
  taxRate: z.number().min(0).max(100).optional(),
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
    // Normalised to canonical `owner/repo` on the way in, so the stored value never
    // depends on what form the user pasted. Rendering can then prefix `github.com/`
    // unconditionally — previously a pasted full URL was stored verbatim and displayed
    // as `github.com/https://github.com/owner/repo`. An unparseable value is left as
    // typed so the refine below still rejects it with a useful message.
    inputGithubRepo: z
      .string()
      .trim()
      .transform((v) => (v === "" ? v : (normalizeGithubRepo(v) ?? v)))
      .optional(),
    inputDescription: z.string().max(10000).optional(),
    platform: z.string().trim().max(50).optional(),
    clientId: z.string().cuid().optional(),
    aiProvider: z.enum(["ANTHROPIC", "OPENAI", "GEMINI", "LOCAL"]).optional(),
    competitorUrls: z.array(z.string().trim().min(1)).max(3).optional(),
    // Jurisdiction codes the product serves (e.g. "EU", "UK", "US", "US-CA"). Validated
    // loosely here; unknown codes are dropped downstream by resolveTargetMarkets().
    targetMarkets: z.array(z.string().trim().min(1).max(16)).max(30).optional(),
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

// workspaceClientStatusSchema / leadStageSchema / touchpointTypeSchema are defined above
// `clientContactFields` so the create/update schemas can reference them (TDZ-safe).

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
  /** Optional when pausing (status INACTIVE): a "pick back up" date + a reason note.
   *  Reactivating to ACTIVE clears both. */
  resumeAt: z.string().trim().nullable().optional(),
  pauseNote: z.string().trim().nullable().optional(),
});

export const touchpointCreateSchema = z.object({
  type: touchpointTypeSchema,
  note: z.string().trim().max(2000).optional(),
  occurredAt: z.string().trim().optional(),
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

export const absenceKindSchema = z.enum(["AWAY", "ILL", "WFH", "APPOINTMENT"]);

export const absenceInputSchema = z
  .object({
    userId: z.string().cuid(),
    kind: absenceKindSchema,
    note: z.string().max(500).optional(),
    // ISO day; defaults to today (UTC) server-side when omitted.
    date: isoDateString.optional(),
    // Last day inclusive (multi-day absence). Omit for a single day.
    endDate: isoDateString.optional(),
    // Slack channel to announce in (optional — absence is still recorded without it).
    channelId: z.string().min(1).max(64).optional(),
    channelName: z.string().max(200).optional(),
    // Cover: a stand-in dev picks up this person's work on ONE client for the period.
    coverUserId: z.string().cuid().optional(),
    coverClientId: z.string().cuid().optional(),
  })
  .refine((v) => !v.coverUserId || Boolean(v.coverClientId), {
    message: "Pick a client for the cover dev to pick up.",
    path: ["coverClientId"],
  })
  .refine((v) => !v.endDate || !v.date || new Date(v.endDate) >= new Date(v.date), {
    message: "endDate must be on or after the start date",
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
  "UI_DONE",
  "DONE",
]);

export const taskPrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH"]);

export const taskLabelSchema = z.enum(["BACKEND", "FRONTEND", "UI_UX", "RESEARCH", "DESIGN"]);

export const taskInputSchema = z.object({
  clientId: z.string().cuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(10000).optional(),
  acceptanceCriteria: z.string().max(10000).nullable().optional(),
  status: taskStatusSchema.optional().default("BACKLOG"),
  priority: taskPrioritySchema.optional().default("MEDIUM"),
  label: taskLabelSchema.nullable().optional(),
  assigneeIds: z.array(z.string().cuid()).optional(),
  featureBlockId: z.string().cuid().nullable().optional(),
  parentId: z.string().cuid().nullable().optional(),
  dueDate: isoDateString.nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const taskUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(10000).nullable().optional(),
  acceptanceCriteria: z.string().max(10000).nullable().optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  label: taskLabelSchema.nullable().optional(),
  assigneeIds: z.array(z.string().cuid()).optional(),
  featureBlockId: z.string().cuid().nullable().optional(),
  dueDate: isoDateString.nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  // Soft-archive toggle: true archives (stamps archivedAt), false unarchives (clears it).
  archived: z.boolean().optional(),
  // Blocked flag: a non-empty string blocks (the client-facing ask); "" or null clears it.
  blockedReason: z.string().max(2000).nullable().optional(),
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
  sourceMeetingId: z.string().cuid().optional(),
  // "true" → only archived tasks (the Archived tab); default/absent → active only.
  archived: z.enum(["true", "false"]).optional(),
  // Optional safety ceiling on rows returned (dashboard summaries pass this so a
  // user with a huge task list can't pull an unbounded payload). Absent = no cap.
  limit: z.coerce.number().int().positive().max(500).optional(),
  // Cap DONE tasks to those completed within N days (payload trim on long-lived
  // boards). "all" disables the cap so older done tasks load on demand. The route
  // applies a sensible default when absent.
  doneWithinDays: z.union([z.coerce.number().int().min(0).max(3650), z.literal("all")]).optional(),
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
      archived: z.boolean().optional(),
    })
    .refine((p) => Object.keys(p).length > 0, { message: "Patch must set at least one field" }),
});

export const taskBatchDeleteSchema = z.object({
  ids: z.array(z.string().cuid()).min(1).max(1000),
});

/**
 * Bulk-create tasks for one client from a single source (e.g. a Pulse scan's
 * priority action plan, or "+ Task" on a failing check). Title-deduped server-side
 * against existing tasks from the same `metadata.source` so re-pushing is idempotent.
 */
export const taskBatchCreateSchema = z.object({
  clientId: z.string().cuid(),
  tasks: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        description: z.string().max(10000).nullable().optional(),
        status: taskStatusSchema.optional(),
        priority: taskPrioritySchema.optional(),
        metadata: z.record(z.string(), z.unknown()).nullable().optional(),
      }),
    )
    .min(1)
    .max(200),
});

/** CSV import — bulk-create tasks for one client. Names are resolved to ids client-side. */
export const taskImportSchema = z.object({
  tasks: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        description: z.string().max(10000).nullable().optional(),
        status: taskStatusSchema.optional(),
        priority: taskPrioritySchema.optional(),
        assigneeIds: z.array(z.string().cuid()).optional(),
        featureBlockId: z.string().cuid().nullable().optional(),
        dueDate: isoDateString.nullable().optional(),
      }),
    )
    .min(1)
    .max(1000),
});

export const dailyUpdatePushSchema = z.object({
  phase: z.enum(["AM", "PM"]),
  weekPlan: z.string().max(5000).optional(),
  note: z.string().max(2000).optional(),
});

// ── Slack push (per-client "Push to Slack" composer + DevOps broadcast) ──────

export const taskCardDetailSchema = z.enum(["TITLES", "TITLES_AND_DESCRIPTIONS"]);
export const projectUpdateStatusGroupSchema = z.enum(["DOING", "DONE", "UPCOMING"]);

export const slackPushPrefsSchema = z.object({
  detail: taskCardDetailSchema,
  statusGroups: z.array(projectUpdateStatusGroupSchema).min(1),
  // Free strings, not cuids — the "none" sentinel (no feature block) is valid.
  excludedCategoryIds: z.array(z.string().max(64)),
  defaultNote: z.string().max(2000).nullable(),
});

export const projectUpdatePushSchema = z.object({
  clientId: z.string().cuid(),
  // Include-list of feature-block ids + the "none" sentinel → not .cuid().
  categoryIds: z.array(z.string().max(64)).optional(),
  statusGroups: z.array(projectUpdateStatusGroupSchema).min(1).optional(),
  detail: taskCardDetailSchema.optional(),
  note: z.string().max(2000).optional(),
  markPhases: z.array(z.enum(["AM", "PM"])).optional(),
  toRollup: z.boolean().optional(),
  saveAsDefaults: z.boolean().optional(),
});

export const broadcastSchema = z.object({
  clientIds: z.array(z.string().cuid()).min(1).max(50),
  message: z.string().trim().min(1).max(4000),
  perClientMessages: z.record(z.string(), z.string().trim().max(4000)).optional(),
  toRollup: z.boolean().optional(),
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
    taskId: z.string().nullable().optional(),
    clientId: z.string().nullable().optional(),
    decisionText: z.string().trim().min(1).max(1000).optional(),
    removeDecisionIndex: z.number().int().nonnegative().optional(),
  })
  .refine(
    (v) =>
      (v.actionItemId !== undefined && v.done !== undefined) ||
      (v.actionItemId !== undefined && v.taskId !== undefined) ||
      v.clientId !== undefined ||
      v.decisionText !== undefined ||
      v.removeDecisionIndex !== undefined,
    {
      message:
        "Provide actionItemId + done, actionItemId + taskId, clientId, decisionText, or removeDecisionIndex.",
    },
  );

// ── Design system (per-client brand tokens; see src/types/design-tokens.ts) ──
const colourTokenSchema = z.object({
  name: z.string(),
  hex: z.string(),
  rgb: z.string().optional(),
  pantone: z.string().optional(),
  role: z.string(),
  usage: z.string().default(""),
});

const typographyTokenSchema = z.object({
  role: z.string(),
  fontFamily: z.string(),
  fontWeight: z.number(),
  fontSize: z.string(),
  lineHeight: z.number(),
  letterSpacing: z.string().optional(),
  textTransform: z.string().optional(),
  usage: z.string().optional(),
  sample: z.string().optional(),
});

const gradientTokenSchema = z.object({
  name: z.string(),
  css: z.string(),
  usage: z.string().default(""),
});

const shadowTokenSchema = z.object({
  name: z.string(),
  css: z.string(),
  usage: z.string().default(""),
});

const buttonVariantSchema = z.object({
  name: z.string(),
  className: z.string().optional(),
  background: z.string(),
  textColour: z.string(),
  border: z.string().optional(),
  hoverBackground: z.string().optional(),
  surfaces: z.array(z.string()).default([]),
  usage: z.string().optional(),
});

const emptyStateTokensSchema = z.object({
  background: z.string(),
  stroke: z.string(),
  strokeWidth: z.string(),
  strokeStyle: z.string(),
});

const inputStateTokenSchema = z.object({
  state: z.string(),
  border: z.string().optional(),
  ring: z.string().optional(),
  background: z.string().optional(),
  textColour: z.string().optional(),
  note: z.string().optional(),
});

const badgeTokenSchema = z.object({
  label: z.string(),
  background: z.string(),
  textColour: z.string(),
  border: z.string().optional(),
  group: z.string().optional(),
});

const alertTokenSchema = z.object({
  name: z.string(),
  background: z.string(),
  textColour: z.string(),
  border: z.string().optional(),
  usage: z.string().optional(),
});

const logoRulesSchema = z.object({
  minSizes: z.record(z.string(), z.string()).optional(),
  clearSpace: z.string().optional(),
  colourRules: z
    .array(z.object({ surface: z.string(), logoVersion: z.string() }))
    .optional(),
  notes: z.string().optional(),
  assets: z
    .array(
      z.object({
        label: z.string(),
        src: z.string(),
        background: z.enum(["light", "dark"]).optional(),
      }),
    )
    .optional(),
  brandStrapline: z.string().optional(),
  formats: z.record(z.string(), z.string()).optional(),
  rules: z.array(z.string()).optional(),
  fileNamingConvention: z.string().optional(),
  colourCodes: z.array(z.string()).optional(),
  formatCodes: z.record(z.string(), z.string()).optional(),
});

export const designSystemStatusSchema = z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]);

export const designTokensSchema = z.object({
  clientName: z.string().min(1),
  version: z.string().default("1.0"),
  generatedAt: z.string().default(""),
  brandVoice: z.string().optional(),
  colours: z.object({
    primary: z.array(colourTokenSchema),
    secondary: z.array(colourTokenSchema),
    neutrals: z.array(colourTokenSchema),
  }),
  gradients: z.array(gradientTokenSchema).default([]),
  typography: z.object({
    displayFont: z.string(),
    bodyFont: z.string(),
    systemFallback: z.string(),
    monoFont: z.string().optional(),
    scale: z.array(typographyTokenSchema),
  }),
  spacing: z.object({
    base: z.number(),
    scale: z.record(z.string(), z.string()),
  }),
  radius: z.record(z.string(), z.string()),
  colourRamps: z.record(z.string(), z.record(z.string(), z.string())).optional(),
  shadows: z.array(shadowTokenSchema).default([]),
  buttons: z.array(buttonVariantSchema).default([]),
  emptyState: emptyStateTokensSchema.optional(),
  inputs: z.array(inputStateTokenSchema).optional(),
  badges: z.array(badgeTokenSchema).optional(),
  alerts: z.array(alertTokenSchema).optional(),
  logoRules: logoRulesSchema.optional(),
  cssVariables: z.string().default(""),
  confidence: z.record(z.string(), z.enum(["HIGH", "MEDIUM", "LOW"])).optional(),
});

export const designSystemSaveSchema = z.object({
  tokens: designTokensSchema,
  status: designSystemStatusSchema.optional(),
});

export const designSystemShareSchema = z.object({
  enabled: z.boolean(),
});

export const designSystemEnabledSchema = z.object({
  enabled: z.boolean(),
});

export const designSystemFoundryBrandingSchema = z.object({
  enabled: z.boolean(),
});

export const designSystemGuidelinesEnabledSchema = z.object({
  enabled: z.boolean(),
});


export const notificationListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(30),
  unreadOnly: z.string().optional(),
});

export const notificationReadSchema = z.object({
  all: z.boolean().optional(),
  ids: z.array(z.string()).optional(),
});

// ── Starters (Prompt→Production library) ─────────────────────────────────────
export const starterTypeSchema = z.enum(["PROMPT", "SKILL", "PLUGIN", "KIT", "COLLECTION"]);
export const starterStatusSchema = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);

// content is a loose payload ("what you get" bullets, install steps, prompt text, etc.).
// Passed through untyped — the server strips the internal `_buildRef` before serialization.
const starterContentSchema = z.record(z.string(), z.unknown());

export const starterCreateSchema = z.object({
  name: z.string().min(1).max(120),
  summary: z.string().min(1).max(280),
  description: z.string().max(20000).nullish(),
  type: starterTypeSchema,
  status: starterStatusSchema.optional(),
  tags: z.array(z.string().min(1).max(40)).max(30).optional(),
  content: starterContentSchema.nullish(),
});

export const starterUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  summary: z.string().min(1).max(280).optional(),
  description: z.string().max(20000).nullish(),
  type: starterTypeSchema.optional(),
  status: starterStatusSchema.optional(),
  tags: z.array(z.string().min(1).max(40)).max(30).optional(),
  content: starterContentSchema.nullish(),
  featured: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  pinned: z.boolean().optional(),
  curatorState: z.enum(["ACTIVE", "STALE", "ARCHIVED"]).optional(),
});

export const starterAdoptSchema = z.object({
  scanId: z.string().min(1),
  starterId: z.string().min(1),
});

// ── Starter Recipes (curated bundles of existing Starters) ───────────────────
export const starterRecipeCreateSchema = z.object({
  name: z.string().min(1).max(120),
  summary: z.string().min(1).max(280),
  description: z.string().max(20000).nullish(),
  starterIds: z.array(z.string().min(1)).max(20).optional(),
});

export const starterRecipeUpdateSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    summary: z.string().min(1).max(280).optional(),
    description: z.string().max(20000).nullish(),
    starterIds: z.array(z.string().min(1)).max(20).optional(),
    isArchived: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field is required" });

// ── Curator (background maintenance agent) ───────────────────────────────────
export const curatorRunSchema = z.object({
  mode: z.enum(["prune", "consolidate"]).optional(),
  dryRun: z.boolean().optional(),
});

export const curatorConfigSchema = z.object({
  enabled: z.boolean().optional(),
  staleAfterDays: z.number().int().min(1).max(365).optional(),
  archiveAfterDays: z.number().int().min(1).max(730).optional(),
  consolidate: z.boolean().optional(),
  intervalDays: z.number().int().min(1).max(90).optional(),
});

export const curatorProposalActionSchema = z.object({
  runId: z.string().min(1),
  proposalId: z.string().min(1),
  action: z.enum(["apply", "dismiss"]),
});

export const curatorRestoreSchema = z.object({ runId: z.string().min(1) });

// ── Foreman (daily delivery-risk watchdog) ───────────────────────────────────
export const foremanRunSchema = z.object({
  consolidate: z.boolean().optional(),
  dryRun: z.boolean().optional(),
});

export const foremanConfigSchema = z.object({
  enabled: z.boolean().optional(),
  dueSoonDays: z.number().int().min(1).max(30).optional(),
  criticalOverdue: z.number().int().min(1).max(100).optional(),
  staleDoingDays: z.number().int().min(1).max(90).optional(),
  consolidate: z.boolean().optional(),
});

export const foremanFindingActionSchema = z.object({
  findingKeys: z.array(z.string().min(1).max(300)).min(1).max(1000),
  action: z.enum(["dismiss", "mute", "clear"]),
});

// ── Handbook (internal developer knowledgebase) ──────────────────────────────
export const handbookStatusSchema = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);

export const handbookCreateSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(160),
  summary: z.string().max(400).nullish(),
  category: z.string().trim().max(60).nullish(),
  content: z.string().max(200000).nullish(),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  keywords: z.array(z.string().trim().min(1).max(60)).max(60).optional(),
  status: handbookStatusSchema.optional(),
});

export const handbookUpdateSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  summary: z.string().max(400).nullish(),
  category: z.string().trim().max(60).nullish(),
  content: z.string().max(200000).nullish(),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  keywords: z.array(z.string().trim().min(1).max(60)).max(60).optional(),
  status: handbookStatusSchema.optional(),
  featured: z.boolean().optional(),
});

// ─── On Your Desk: reminders + broadcasts ────────────────────────────────────

export const deskReminderCreateSchema = z.object({
  body: z.string().trim().min(1, "Reminder can't be empty").max(280),
});

export const deskReminderUpdateSchema = z
  .object({
    body: z.string().trim().min(1).max(280).optional(),
    done: z.boolean().optional(),
  })
  .refine((v) => v.body !== undefined || v.done !== undefined, {
    message: "Nothing to update",
  });

export const broadcastCreateSchema = z.object({
  message: z.string().trim().min(1, "Message can't be empty").max(500),
  durationDays: z.union([
    z.literal(1),
    z.literal(3),
    z.literal(5),
    z.literal(14),
    z.literal(30),
  ]),
});

// ─── DevSignal (developer vetting engine) ────────────────────────────────────

const devSignalNewCandidateSchema = z.object({
  name: z.string().min(1),
  githubHandle: z.string().min(1),
  email: z.string().email().optional(),
  primaryStack: z.string().min(1).optional(),
});

export const devSignalAssessmentCreateSchema = z
  .object({
    candidateId: z.string().min(1).optional(),
    candidate: devSignalNewCandidateSchema.optional(),
    clientId: z.string().min(1).optional(),
  })
  .refine((v) => Boolean(v.candidateId) || Boolean(v.candidate), {
    message: "Provide candidateId or candidate details.",
  });

export const devSignalDecisionSchema = z.object({
  decision: z.enum(["APPROVED_FOR_STAGING", "REJECTED", "NEEDS_MORE_INFO", "NONE"]),
  reason: z.string().max(2000).optional(),
});

export const devSignalPromoteSchema = z.object({
  reason: z.string().max(2000).optional(),
});

export const devSignalOutcomeLinkSchema = z.object({
  assessmentId: z.string().min(1),
  placementId: z.string().min(1).optional(),
  deliveryMetrics: z.record(z.string(), z.unknown()).optional(),
  source: z.string().max(120).optional(),
  notes: z.string().max(4000).optional(),
  // Structured outcome signals — the criterion the score is validated against.
  retained: z.boolean().optional(),
  tenureDays: z.number().int().min(0).max(20_000).optional(),
  clientRating: z.number().int().min(1).max(5).optional(),
  churned: z.boolean().optional(),
});

export const devSignalPipelineConfigSchema = z.object({
  name: z.string().min(1),
  clientId: z.string().min(1).optional(),
  version: z.string().min(1).default("v1"),
  isDefault: z.boolean().optional(),
  enabledStages: z.array(z.string()).min(1),
  stageOrder: z.array(z.string()).min(1),
  stageWeights: z.record(z.string(), z.number().int().min(0).max(100)),
  blockingRules: z.record(z.string(), z.boolean()).optional(),
  thresholds: z.record(z.string(), z.unknown()).optional(),
});

// ─── DevSignal public candidate flow (/vet/[token]) ──────────────────────────

export const vetIntakeSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().max(320).optional().or(z.literal("")),
  location: z.string().max(200).optional().or(z.literal("")),
  timezone: z.string().max(120).optional().or(z.literal("")),
  primaryStack: z.string().max(200).optional().or(z.literal("")),
  yearsExperience: z.number().int().min(0).max(70).optional(),
  linkedinUrl: z.string().max(500).optional().or(z.literal("")),
  portfolioUrl: z.string().max(500).optional().or(z.literal("")),
  availability: z.string().max(120).optional().or(z.literal("")),
});

export const vetConnectSchema = z.object({
  githubHandle: z.string().min(1).max(120),
});

const vetTelemetryEventSchema = z.object({
  t: z.number().nonnegative(),
  type: z.enum(["keystroke", "paste", "run", "focus", "blur", "edit"]),
  size: z.number().int().nonnegative().optional(),
});

export const vetChallengeSubmitSchema = z.object({
  challengeId: z.string().min(1),
  code: z.string().max(50_000),
  testsPassed: z.number().int().min(0),
  testsTotal: z.number().int().min(0),
  timeTakenSec: z.number().int().min(0),
  telemetry: z.array(vetTelemetryEventSchema).max(20_000).default([]),
});

export const vetStarterFluencySubmitSchema = z.object({
  starterId: z.string().min(1),
  response: z.string().min(1).max(20_000),
});

export const devSignalInterviewSchema = z.object({
  dimensions: z
    .array(
      z.object({
        key: z.string().min(1),
        label: z.string().min(1),
        score: z.number().int().min(0).max(100),
      }),
    )
    .min(1)
    .max(20),
  verdict: z.enum(["PASS", "WARN", "FAIL", "NEEDS_SECOND_REVIEW"]),
  notes: z.string().max(4000).optional(),
});

export const vetVideoSubmitSchema = z
  .object({
    audioBase64: z.string().max(30_000_000).optional(),
    mimeType: z.string().max(120).optional(),
    transcript: z.string().max(50_000).optional(),
    consentRetainTranscript: z.boolean().default(false),
  })
  .refine((v) => Boolean(v.audioBase64) || Boolean(v.transcript), {
    message: "Provide audio or a transcript.",
  });

// ─── DevSignal challenge bank ────────────────────────────────────────────────

const challengeTestSchema = z.object({
  name: z.string().min(1).max(120),
  args: z.array(z.unknown()).max(20),
  expected: z.unknown(),
  hidden: z.boolean().optional(),
});

export const devSignalChallengeSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens only."),
  title: z.string().min(2).max(160),
  language: z.enum(["javascript", "typescript"]),
  difficulty: z.enum(["junior", "mid", "senior", "staff"]),
  roles: z.array(z.string().min(1).max(40)).max(12).default([]),
  stacks: z.array(z.string().min(1).max(40)).max(12).default([]),
  competencies: z.array(z.string().min(1).max(40)).max(12).default([]),
  promptMarkdown: z.string().min(1).max(8000),
  functionName: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/, "Must be a valid function name."),
  starterCode: z.string().min(1).max(8000),
  timeLimitSec: z.number().int().min(60).max(14_400),
  tests: z.array(challengeTestSchema).min(1).max(40),
  isActive: z.boolean().default(true),
});

/** Partial update — the slug is the path key, everything else is optional. */
export const devSignalChallengeUpdateSchema = devSignalChallengeSchema
  .omit({ slug: true })
  .partial();

// ─── DevSignal candidate consent + data-rights (GDPR) ────────────────────────

export const vetConsentSchema = z.object({
  processing: z.literal(true),
  humanReview: z.literal(true),
});

export const vetDataRequestSchema = z.object({
  type: z.enum(["EXPLANATION", "APPEAL", "ERASURE"]),
  message: z.string().max(4000).optional(),
});

export const devSignalDataRequestUpdateSchema = z.object({
  status: z.enum(["OPEN", "ACKNOWLEDGED", "RESOLVED"]),
});

export const devSignalNoticeUpdateSchema = z.object({
  contactEmail: z.string().email().max(320),
  explanationStages: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        measures: z.string().max(1200),
        automated: z.boolean(),
      }),
    )
    .max(20),
  dataHandlingPoints: z.array(z.string().min(1).max(1200)).max(20),
  consentItems: z
    .array(
      z.object({
        key: z.enum(["processing", "humanReview"]),
        required: z.boolean(),
        label: z.string().min(1).max(2000),
      }),
    )
    .max(4),
});

// ── Gitwork Costing & Quote tool (Super-Admin only) — aligned to the site packages ──
export const costingAdvancedConfigSchema = z.object({
  fxFromUsd: z.number().positive().max(100).optional(),
  ukReviewOverheadPercent: z.number().min(0).max(100).optional(),
  contingencyPercent: z.number().min(0).max(100).optional(),
});

export const tierRateSchema = z.object({
  amount: z.number().min(0).max(10000000),
  period: z.enum(["day", "month"]),
});

export const tierRatesSchema = z.object({
  junior: tierRateSchema,
  mid: tierRateSchema,
  senior: tierRateSchema,
});

export const tierCountsSchema = z.object({
  junior: z.number().min(0).max(999),
  mid: z.number().min(0).max(999),
  senior: z.number().min(0).max(999),
});

export const costingPreviewSchema = z.object({
  packageType: z.enum(["launch_pad", "mvp_sprint", "greenfield", "care_plan"]),
  targetPriceGbp: z.number().min(0).max(100000000).optional(),
  weeks: z.number().min(0).max(520).optional(),
  months: z.number().min(1).max(60).optional(),
  team: tierCountsSchema.optional(),
  pricePerDevMonthGbp: z.number().min(0).max(1000000).optional(),
  pricePerMonthGbp: z.number().min(0).max(1000000).optional(),
  tierRates: tierRatesSchema.optional(),
  config: costingAdvancedConfigSchema.optional(),
});

export const costingConfigSaveSchema = costingAdvancedConfigSchema.extend({
  tierRates: tierRatesSchema,
});
