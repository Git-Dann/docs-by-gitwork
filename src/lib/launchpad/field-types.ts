/**
 * Launchpad field-type registry — the canonical metadata + validation for every
 * Launchpad field type.
 *
 * Deliberately a SIBLING of `src/lib/onboarding/field-types.ts` that spreads it,
 * rather than an edit to it. The shared types keep one definition (so a change to
 * `short_text` moves both engines); the three Launchpad-only types are added here
 * where their semantics actually make sense.
 *
 * Kept framework-free (no React / no icons) so the server can import it for answer
 * validation, exactly like the onboarding original. The builder palette maps
 * `type` → icon locally.
 */

import { FIELD_TYPE_REGISTRY, validateAnswer } from "@/lib/onboarding/field-types";
import type { AnswerValidation, FieldTypeCategory } from "@/lib/onboarding/field-types";
import type { OnboardingFieldDef } from "@/types/onboarding";
import type { LaunchpadFieldDef, LaunchpadFieldType } from "@/types/launchpad";

export interface LaunchpadFieldTypeMeta {
  type: LaunchpadFieldType;
  displayName: string;
  description: string;
  category: FieldTypeCategory | "requirement";
  /** Offered in the builder's palette. */
  custom: boolean;
  supportsOptions: boolean;
  takesInput: boolean;
  /**
   * Whether this type's value lives in the flat `answers` map. False for the two
   * types with their own tables — the single most important property here, since
   * it is what stops the autosave path writing a checklist status into JSON.
   */
  flatAnswer: boolean;
  makeDefault: () => Omit<LaunchpadFieldDef, "id">;
}

const SHARED_TYPES = Object.values(FIELD_TYPE_REGISTRY).reduce(
  (acc, meta) => {
    acc[meta.type] = {
      type: meta.type,
      displayName: meta.displayName,
      description: meta.description,
      category: meta.category,
      // `bank_details` is onboarding-only: a Launchpad never collects bank
      // details (that is what onboarding is for), so it is never offered here.
      custom: meta.type === "bank_details" ? false : meta.custom,
      supportsOptions: meta.supportsOptions,
      takesInput: meta.takesInput,
      flatAnswer: meta.type !== "bank_details",
      makeDefault: meta.makeDefault,
    };
    return acc;
  },
  {} as Record<string, LaunchpadFieldTypeMeta>,
);

export const LAUNCHPAD_FIELD_TYPE_REGISTRY: Record<
  LaunchpadFieldType,
  LaunchpadFieldTypeMeta
> = {
  ...(SHARED_TYPES as Record<LaunchpadFieldType, LaunchpadFieldTypeMeta>),

  link: {
    type: "link",
    displayName: "Link",
    description: "A pasted URL (Drive, Figma, Dropbox…) the client marks as provided.",
    category: "requirement",
    custom: true,
    supportsOptions: false,
    takesInput: true,
    flatAnswer: true,
    makeDefault: () => ({
      type: "link",
      label: "Link",
      helper: "Paste a shareable link — we never need the file itself.",
      placeholder: "https://drive.google.com/…",
    }),
  },

  checklist_item: {
    type: "checklist_item",
    displayName: "Requirement",
    description: "A tracked requirement: status, owner, link and a note.",
    category: "requirement",
    custom: true,
    supportsOptions: false,
    takesInput: false,
    // Persists to LaunchpadItem, not the answers map.
    flatAnswer: false,
    makeDefault: () => ({
      type: "checklist_item",
      label: "New requirement",
      helper: "Say why we need it and how they get it.",
      ownedByClient: true,
    }),
  },

  legal_doc: {
    type: "legal_doc",
    displayName: "Legal document",
    description: "A fillable boilerplate doc (cookie policy, T&Cs, privacy policy).",
    category: "requirement",
    custom: true,
    supportsOptions: false,
    takesInput: false,
    // Persists to LaunchpadDoc, not the answers map.
    flatAnswer: false,
    makeDefault: () => ({
      type: "legal_doc",
      label: "Privacy policy",
      docKey: "privacy",
      helper: "A starting point for your lawyer to review — not legal advice.",
    }),
  },
};

export function launchpadFieldTypeMeta(type: LaunchpadFieldType): LaunchpadFieldTypeMeta {
  return LAUNCHPAD_FIELD_TYPE_REGISTRY[type] ?? LAUNCHPAD_FIELD_TYPE_REGISTRY.short_text;
}

/** True for the two types whose state lives in their own table. */
export function hasOwnTable(type: LaunchpadFieldType): boolean {
  return !launchpadFieldTypeMeta(type).flatAnswer;
}

/** True when this field collects a value into the flat `answers` map. */
export function collectsFlatAnswer(type: LaunchpadFieldType): boolean {
  return launchpadFieldTypeMeta(type).flatAnswer && type !== "static";
}

/** A `checklist_item` — the tracked-requirement type. */
export function isChecklistItem(field: Pick<LaunchpadFieldDef, "type">): boolean {
  return field.type === "checklist_item";
}

/** A `legal_doc` with a usable generator key. A `legal_doc` missing its `docKey`
 *  is malformed template data and is skipped everywhere rather than rendered as a
 *  broken panel. */
export function isLegalDoc(
  field: Pick<LaunchpadFieldDef, "type" | "docKey">,
): boolean {
  return field.type === "legal_doc" && Boolean(field.docKey);
}

/**
 * Validate + normalise one incoming flat answer.
 *
 * Delegates to onboarding's `validateAnswer` for every shared type, so the two
 * engines can never disagree about what a valid email is. Only `link` is handled
 * here; the two table-backed types return `ok: false` because reaching this
 * function with one of them is a routing bug, not bad user input — and silently
 * accepting it would write a checklist status into the answers JSON where nothing
 * would ever read it again.
 */
export function validateLaunchpadAnswer(
  def: LaunchpadFieldDef,
  raw: unknown,
): AnswerValidation {
  if (def.type === "checklist_item" || def.type === "legal_doc") {
    return {
      ok: false,
      value: null,
      error: `${def.label}: ${def.type} state is not stored as an answer.`,
    };
  }

  if (def.type === "link") {
    if (raw == null || String(raw).trim() === "") return { ok: true, value: null };
    // One rule, shared with the checklist item's link — see `safeLaunchpadLink`.
    const value = safeLaunchpadLink(raw);
    if (!value) return { ok: false, value: null, error: `${def.label}: ${LAUNCHPAD_LINK_ERROR}` };
    return { ok: true, value };
  }

  // Shared types — one implementation, onboarding's.
  return validateAnswer(def as unknown as OnboardingFieldDef, raw);
}

export type { AnswerValidation };

/**
 * The ONE link rule, shared by the `link` field type and the checklist item's link.
 *
 * ⚠️ These two drifted apart on the first cut: `validateLaunchpadAnswer` checked
 * http(s) for a `link` field, while the item patch schema was a bare
 * `z.string().max(2048)` — so an item link accepted anything, including
 * `javascript:…`, and the item link is rendered as an `<a href>`. `rel="noreferrer
 * noopener"` does nothing about that. Same class of drift as the duplicated model
 * literals in §31: two copies of a rule, one of them wrong.
 *
 * Returns the cleaned URL, or null if it is not a safe http(s) link.
 */
export function safeLaunchpadLink(raw: unknown): string | null {
  if (raw == null) return null;
  const value = String(raw).trim();
  if (value === "") return null;
  if (value.length > 2048) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  // Protocol allow-list, not a blocklist — `javascript:`, `data:`, `vbscript:` and
  // `file:` are all reachable from a paste, and enumerating them is how one gets missed.
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return value;
}

/** Why a link was rejected, for the inline message the client actually sees. */
export const LAUNCHPAD_LINK_ERROR =
  "That doesn't look like a link — it needs to start with https://";
