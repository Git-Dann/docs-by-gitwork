import { z } from "zod";

/** A review decision: a team task id ("this is the same work"), "create", or "skip". */
export const forgeDecisionSchema = z.object({
  forgeId: z.string().trim().min(1).max(40),
  decision: z.union([z.literal("create"), z.literal("skip"), z.string().trim().min(10).max(40)]),
});

export const forgePlanBodySchema = z
  .object({
    feedUrl: z.string().trim().url().max(500).optional(),
    decisions: z.array(forgeDecisionSchema).max(500).optional(),
  })
  .strict();

export const forgeApplyBodySchema = z
  .object({
    feedUrl: z.string().trim().url().max(500).optional(),
    /** Required, even if empty: applying is a deliberate act, decided after reading the dry run. */
    approvedReviewLinks: z.array(forgeDecisionSchema).max(500),
  })
  .strict();
