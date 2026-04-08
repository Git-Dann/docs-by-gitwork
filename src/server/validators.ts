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

export const rateCardPersonCreateSchema = z.object({
  name: requiredTrimmedString,
  area: requiredTrimmedString,
  sourceRate: z.coerce.number().positive(),
  sourceCurrencyCode: currencyCodeSchema,
  billingPeriod: rateBillingPeriodSchema.default("MONTH"),
});

export const clientCreateSchema = z.object({
  name: requiredTrimmedString,
  logoUrl: z.string().trim().url().optional(),
});

export const clientUpdateSchema = z
  .object({
    name: requiredTrimmedString.optional(),
    logoUrl: z.string().trim().url().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one client field is required.",
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

export const candidateCreateSchema = z.object({
  name: requiredTrimmedString,
  githubHandle: githubHandleSchema,
  email: optionalTrimmedString,
  primaryStack: requiredTrimmedString,
  location: optionalTrimmedString,
  bio: optionalTrimmedString,
  tier: codeClearTierSchema.default("TIER_1"),
  rateCardPersonId: z.string().cuid().nullable().optional(),
});

export const candidateUpdateSchema = z
  .object({
    name: optionalTrimmedString,
    githubHandle: githubHandleSchema.optional(),
    email: optionalTrimmedString,
    primaryStack: optionalTrimmedString,
    location: optionalTrimmedString,
    bio: optionalTrimmedString,
    status: pipelineStatusSchema.optional(),
    tier: codeClearTierSchema.optional(),
    rateCardPersonId: z.string().cuid().nullable().optional(),
    recheckDueAt: z.coerce.date().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one candidate field is required.",
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
  productName: z.string().optional(),
  templateId: z.string().optional(),
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
