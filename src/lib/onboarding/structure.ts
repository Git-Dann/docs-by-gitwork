/**
 * Pure helpers for walking an OnboardingFormStructure. Framework-free so both the
 * server (answer routing) and the public renderer / builder (rendering, showIf)
 * share one implementation.
 */

import type {
  OnboardingAnswers,
  OnboardingFieldDef,
  OnboardingFormStructure,
} from "@/types/onboarding";

/** Every field across every step, in order. */
export function allFields(structure: OnboardingFormStructure): OnboardingFieldDef[] {
  return structure.steps.flatMap((step) => step.fields);
}

/** Map of field id → def, across all steps. */
export function fieldsById(structure: OnboardingFormStructure): Map<string, OnboardingFieldDef> {
  const map = new Map<string, OnboardingFieldDef>();
  for (const field of allFields(structure)) map.set(field.id, field);
  return map;
}

/** Set of all field ids in the structure (for dangling-showIf detection). */
export function fieldIdSet(structure: OnboardingFormStructure): Set<string> {
  return new Set(allFields(structure).map((f) => f.id));
}

/**
 * Whether a field should show given current answers. A field with no `showIf` is
 * always visible. A `showIf` whose referenced field is missing from the structure
 * falls open (visible) so deleting the controller can't trap copy behind it.
 */
export function isFieldVisible(
  def: OnboardingFieldDef,
  answers: OnboardingAnswers,
  knownIds?: Set<string>,
): boolean {
  if (!def.showIf) return true;
  if (knownIds && !knownIds.has(def.showIf.fieldId)) return true;
  return answers[def.showIf.fieldId] === def.showIf.equals;
}

/** Coerce an unknown JSON snapshot into a structure, guarding against malformed data. */
export function isFormStructure(value: unknown): value is OnboardingFormStructure {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Array.isArray((value as { steps?: unknown }).steps) &&
    typeof (value as { welcome?: unknown }).welcome === "object"
  );
}
