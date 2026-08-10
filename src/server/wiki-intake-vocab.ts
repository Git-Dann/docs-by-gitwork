/**
 * Vocabulary the client intake API accepts, shared by the create and update
 * routes (docs/client-intake-api.md).
 *
 * Lives outside the route files because a Next.js route module may only export
 * handlers and its known config keys — exporting these from the route failed the
 * build with "does not match the required types of a Next.js Route".
 *
 * Integrators speak their own words for the same things; map them rather than
 * making every client learn our enums. Anything unrecognised still fails
 * validation (a 400 naming the field) rather than being silently coerced to a
 * default — a mis-typed priority should be a visible error, not a quiet MEDIUM.
 */

import { z } from "zod";

/** "Feature request" is the common one — it maps to TASK, which is what the
 *  Requests UI already calls actionable work. */
export const INTAKE_TYPE = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  const k = v.trim().toUpperCase().replace(/[\s-]+/g, "_");
  const map: Record<string, string> = {
    BUG: "BUG",
    DEFECT: "BUG",
    ISSUE: "BUG",
    FEEDBACK: "FEEDBACK",
    COMMENT: "FEEDBACK",
    TASK: "TASK",
    FEATURE: "TASK",
    FEATURE_REQUEST: "TASK",
    ENHANCEMENT: "TASK",
    REQUEST: "TASK",
    DESIGN: "DESIGN",
    DESIGN_CHANGE: "DESIGN",
    DESIGN_EDIT: "DESIGN",
    DESIGN_REQUEST: "DESIGN",
    UI: "DESIGN",
    UX: "DESIGN",
    VISUAL: "DESIGN",
  };
  return map[k] ?? v;
}, z.enum(["BUG", "FEEDBACK", "TASK", "DESIGN"]));

export const INTAKE_PRIORITY = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  const k = v.trim().toUpperCase();
  const map: Record<string, string> = {
    LOW: "LOW",
    P3: "LOW",
    MINOR: "LOW",
    MEDIUM: "MEDIUM",
    P2: "MEDIUM",
    NORMAL: "MEDIUM",
    MAJOR: "MEDIUM",
    HIGH: "HIGH",
    P1: "HIGH",
    P0: "HIGH",
    URGENT: "HIGH",
    CRITICAL: "HIGH",
  };
  return map[k] ?? v;
}, z.enum(["LOW", "MEDIUM", "HIGH"]));

export const INTAKE_STATUS = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  const k = v.trim().toUpperCase().replace(/[\s-]+/g, "_");
  const map: Record<string, string> = {
    NEW: "NEW",
    OPEN: "NEW",
    TRIAGED: "TRIAGED",
    ACCEPTED: "TRIAGED",
    IN_PROGRESS: "PROMOTED",
    PROMOTED: "PROMOTED",
    DONE: "CLOSED",
    CLOSED: "CLOSED",
    RESOLVED: "CLOSED",
    REJECTED: "CLOSED",
    WONT_FIX: "CLOSED",
  };
  return map[k] ?? v;
}, z.enum(["NEW", "TRIAGED", "PROMOTED", "CLOSED"]));

/** Fields common to create and update. `title` is required only on create, so the
 *  create route re-declares it rather than making it optional here. */
export const intakeCommonFields = {
  description: z.string().trim().max(10_000).optional().nullable(),
  type: INTAKE_TYPE,
  priority: INTAKE_PRIORITY,
  status: INTAKE_STATUS,
  requestedBy: z.string().trim().max(120).optional().nullable(),
  externalUrl: z.string().trim().url().max(2000).optional().nullable(),
  /** Links only — never fetched server-side (SSRF). */
  attachmentUrls: z.array(z.string().trim().url().max(2000)).max(10).optional().nullable(),
} as const;
