import { z } from "zod";

export const documentStatusSchema = z.enum([
  "DRAFT",
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
  action: z.string(),
  periodCovered: z.string(),
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
  approvalChecked: z.boolean(),
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
