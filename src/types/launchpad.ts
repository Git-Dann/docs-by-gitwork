/**
 * Launchpad — shared types.
 *
 * Launchpad collects everything Gitwork needs FROM a client to start and ship an
 * engagement, so developers stop waiting on missing accounts, assets and legal
 * copy. It renders as a section of the client's wiki and does two jobs:
 *
 *   1. A tracked requirements CHECKLIST, grouped into modules (Foundations /
 *      Website / Payments / iOS / Android / Compliance). Each item carries a
 *      client-movable status, a one-line "why we need it / how to get it" helper,
 *      an owner flag on sensitive accounts, and a link field.
 *   2. Fillable boilerplate LEGAL DOCS (cookie policy, T&Cs, privacy policy),
 *      rendered deterministically from the client's typed answers.
 *
 * It is a SIBLING of the onboarding engine, not an extension of it. The shared
 * pieces are genuinely reused — the field-type registry, `validateAnswer`, and
 * `FieldRenderer` — but two things diverge too far from onboarding's flat
 * id→value answer map to live in it: per-item checklist status and per-doc
 * approval state, which get their own tables.
 *
 * Deliberately declares its status unions as string literals rather than
 * importing the Prisma enums, so the public (client-facing) wiki bundle never
 * pulls the Prisma client in. `launchpad-enums.test.ts` keeps the two in step.
 */

import type {
  OnboardingAnswerValue,
  OnboardingFieldOption,
  OnboardingFieldShowIf,
  OnboardingFieldType,
  OnboardingFieldWidth,
  OnboardingInputTransform,
} from "@/types/onboarding";

// ─── Field vocabulary ─────────────────────────────────────────────────────────

/**
 * Every onboarding field type, plus the three Launchpad adds:
 *
 *   · `link`           — a URL plus "mark provided". Distinct from onboarding's
 *                        `url`, which collects an address and nothing else.
 *   · `checklist_item` — a tracked requirement. Persists to `LaunchpadItem`, NOT
 *                        to the flat answers map.
 *   · `legal_doc`      — a generated doc with its own approval state. Persists to
 *                        `LaunchpadDoc`.
 *
 * The last two are why this union extends onboarding's rather than the reverse:
 * neither has a meaningful flat answer value, so putting them in
 * `OnboardingFieldType` would give `validateAnswer` two branches that cannot
 * validate anything and `FieldRenderer` props it never uses.
 */
export type LaunchpadFieldType =
  | OnboardingFieldType
  | "link"
  | "checklist_item"
  | "legal_doc";

/** The three boilerplate generators. Each is its own markdown template — they
 *  diverge too much in structure to share one parameterised source. */
export type LaunchpadDocKey = "cookie" | "terms" | "privacy";

export const LAUNCHPAD_DOC_KEYS: readonly LaunchpadDocKey[] = [
  "cookie",
  "terms",
  "privacy",
] as const;

export interface LaunchpadFieldConfig {
  /** Grid width. Defaults to "full". */
  width?: OnboardingFieldWidth;
  /** Prefill value (e.g. country = "United Kingdom"). */
  default?: string;
  maxLength?: number;
  /** Rows for `long_text`. */
  rows?: number;
  transform?: OnboardingInputTransform;
  /** Body copy for a `static` block. */
  body?: string;
}

export interface LaunchpadFieldDef {
  /** Stable id. Doubles as the answer key, the `LaunchpadItem.itemId`, and the
   *  React key — so it must be unique across the whole structure, not per module. */
  id: string;
  type: LaunchpadFieldType;
  label: string;
  /**
   * The one-line "why we need it / how to get it" line, shown under every
   * requirement. This is the field that makes a checklist actionable rather than
   * a list of nouns a client has to interpret — every seeded item has one.
   */
  helper?: string;
  hint?: string;
  placeholder?: string;
  required?: boolean;
  options?: OnboardingFieldOption[];
  config?: LaunchpadFieldConfig;
  showIf?: OnboardingFieldShowIf;
  /**
   * `checklist_item` only — who is expected to own the account or asset. Seeded
   * `true` on every account item (an Apple Developer account, a Stripe account
   * and a Play Console account must be the client's, not ours). A per-client
   * `LaunchpadItem.ownedByClient` overrides it; null there means inherit this.
   */
  ownedByClient?: boolean;
  /** `legal_doc` only — which generator renders this field. */
  docKey?: LaunchpadDocKey;
  /**
   * `WorkspaceClient` / `ClientOnboarding` column to prefill from WHEN PRESENT.
   * Absent value → the field stays blank and manual. Launchpad never depends on
   * onboarding having been used.
   */
  prefillKey?: string;
}

export interface LaunchpadModule {
  id: string;
  title: string;
  blurb?: string;
  /** Always on and not toggleable (Foundations). */
  alwaysOn?: boolean;
  fields: LaunchpadFieldDef[];
}

export interface LaunchpadStructure {
  modules: LaunchpadModule[];
}

/** Custom (non-checklist, non-doc) answers, keyed by field id. */
export type LaunchpadAnswers = Record<string, OnboardingAnswerValue>;

// ─── Live state ───────────────────────────────────────────────────────────────

export type LaunchpadItemStatus = "NEEDED" | "PROVIDED" | "NA";
export type LaunchpadDocStatus = "TEMPLATE" | "EDITED" | "APPROVED";

export const LAUNCHPAD_ITEM_STATUSES: readonly LaunchpadItemStatus[] = [
  "NEEDED",
  "PROVIDED",
  "NA",
] as const;

export const LAUNCHPAD_DOC_STATUSES: readonly LaunchpadDocStatus[] = [
  "TEMPLATE",
  "EDITED",
  "APPROVED",
] as const;

/** One requirement's tracked state. */
export interface LaunchpadItemState {
  itemId: string;
  status: LaunchpadItemStatus;
  link: string | null;
  note: string | null;
  /** Null = inherit the template default. */
  ownedByClient: boolean | null;
  updatedBy: string | null;
  updatedAt: string;
}

/** One legal doc's state. `body` is the resolved markdown the reader sees —
 *  either the client's `bodyOverride` or a fresh deterministic render. */
export interface LaunchpadDocState {
  docKey: LaunchpadDocKey;
  title: string;
  answers: LaunchpadAnswers;
  body: string;
  /** True when `body` came from a stored edit rather than a fresh render. */
  edited: boolean;
  status: LaunchpadDocStatus;
  approvedAt: string | null;
  approvedByEmail: string | null;
  updatedAt: string;
}

/**
 * Completeness across the ENABLED modules only — a disabled module's items are
 * not owed, so counting them would report a client as behind on work nobody
 * asked them for. `NA` counts as resolved (it is an answer), which is why
 * `percent` is resolved/total rather than provided/total.
 */
export interface LaunchpadCompleteness {
  total: number;
  provided: number;
  na: number;
  needed: number;
  /** 0–100, rounded. 100 when there is nothing outstanding; 0 when total is 0. */
  percent: number;
  /** Labels of the still-NEEDED items, in structure order — the "outstanding:
   *  app icons, Apple Developer account" line. Shaped like onboarding's
   *  `missingRequiredLabels`. */
  outstanding: string[];
}

/** The whole Launchpad as the wiki (internal and public) renders it. */
export interface LaunchpadDTO {
  /** The `ClientWiki.launchpadEnabled` flag. */
  enabled: boolean;
  /** Whether a template has been assigned yet (a kit row exists). */
  assigned: boolean;
  templateId: string | null;
  templateName: string | null;
  /** The frozen snapshot this kit renders from. */
  structure: LaunchpadStructure;
  enabledModules: string[];
  answers: LaunchpadAnswers;
  items: LaunchpadItemState[];
  docs: LaunchpadDocState[];
  completeness: LaunchpadCompleteness;
  updatedAt: string | null;
}

// ─── Template (master) records, as returned by the admin CRUD API ─────────────

export interface LaunchpadTemplateRecord {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  structure: LaunchpadStructure;
  isDefault: boolean;
  isArchived: boolean;
  /** Kits assigned from this template — gates hard-delete (archive instead). */
  kitCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface LaunchpadTemplateSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isDefault: boolean;
  isArchived: boolean;
  kitCount: number;
  moduleCount: number;
  itemCount: number;
  updatedAt: string;
}

/** Per-client completeness for the internal roll-ups (client card, HQ widget). */
export interface LaunchpadSummary {
  clientId: string;
  clientName: string;
  clientSlug: string;
  percent: number;
  needed: number;
  outstanding: string[];
}
