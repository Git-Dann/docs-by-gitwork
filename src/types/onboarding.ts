/**
 * Customisable onboarding — shared types.
 *
 * Onboarding is now data-driven (mirrors the Docs builder): an `OnboardingForm`
 * holds an `OnboardingFormStructure` (welcome + steps + review) as JSON, the
 * public flow renders from a frozen snapshot of that structure, and answers are
 * keyed by field `id`.
 *
 * Two kinds of field:
 *   - **System fields** carry a `systemKey` — they persist to a real column on
 *     `ClientOnboarding` and map into `WorkspaceClient` on submit (company name,
 *     contact email, address, bank…). Their `id` === their `systemKey`.
 *   - **Custom fields** have no `systemKey` — they live in `ClientOnboarding.answers`
 *     (JSON) and surface in review / PDF / admin, but don't map to a client column.
 */

export type OnboardingFieldType =
  | "short_text"
  | "long_text"
  | "email"
  | "phone"
  | "url"
  | "number"
  | "select"
  | "multiselect"
  | "checkbox"
  | "bank_details"
  | "static";

/** Grid layout hint — `half` lets two fields sit side-by-side on sm+ screens. */
export type OnboardingFieldWidth = "full" | "half";

/** Named input guards applied as the client types (system-field parity). */
export type OnboardingInputTransform = "upper" | "alnum_upper";

export interface OnboardingFieldOption {
  id: string;
  label: string;
}

/** Show this field only when another field's answer matches. Renderer falls open
 *  (shows the field) if the referenced field is missing, so reordering can't trap copy. */
export interface OnboardingFieldShowIf {
  fieldId: string;
  equals: string | number | boolean;
}

export interface OnboardingFieldConfig {
  /** Grid width. Defaults to "full". */
  width?: OnboardingFieldWidth;
  /** Prefill value (e.g. country = "United Kingdom"). */
  default?: string;
  /** Max input length (chars). */
  maxLength?: number;
  /** Rows for `long_text`. */
  rows?: number;
  /** Input guard applied on change (system fields). */
  transform?: OnboardingInputTransform;
  /** Native <datalist> source key (e.g. "uk-banks" for the bank-name autocomplete). */
  datalist?: "uk-banks";
  /** Body copy for a `static` block. */
  body?: string;
}

export interface OnboardingFieldDef {
  /** Stable id — used as the answer key. For system fields, equals `systemKey`. */
  id: string;
  type: OnboardingFieldType;
  label: string;
  hint?: string;
  placeholder?: string;
  required?: boolean;
  /** Built-in client-mapped field (e.g. "companyName"). Absent for custom questions. */
  systemKey?: string;
  options?: OnboardingFieldOption[];
  config?: OnboardingFieldConfig;
  showIf?: OnboardingFieldShowIf;
}

export interface OnboardingStepDef {
  id: string;
  /** Stable slug used for behaviour hooks ("bank", "review" are special). */
  key: string;
  title: string;
  /** Intro paragraph shown at the top of the step. */
  blurb?: string;
  fields: OnboardingFieldDef[];
}

export interface OnboardingWelcomeDef {
  eyebrow?: string;
  /** Hero heading (left panel). */
  heading: string;
  /** Right-panel sub-heading. */
  subheading?: string;
  bullets: string[];
  ctaLabel?: string;
}

export interface OnboardingReviewDef {
  blurb?: string;
  /** Reassurance note above the submit button. */
  legal?: string;
  /** Fine-print confirmation under the submit button. */
  agreement?: string;
}

export interface OnboardingFormStructure {
  welcome: OnboardingWelcomeDef;
  /** Wizard steps in order (excludes the welcome + review screens, which are intrinsic). */
  steps: OnboardingStepDef[];
  review: OnboardingReviewDef;
}

/** Answer values: string for most inputs, boolean for checkbox, string[] for multiselect. */
export type OnboardingAnswerValue = string | number | boolean | string[] | null;
export type OnboardingAnswers = Record<string, OnboardingAnswerValue>;

// ─── Form (template) records, as returned by the admin CRUD API ────────────────

export interface OnboardingFormRecord {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  structure: OnboardingFormStructure;
  isDefault: boolean;
  isArchived: boolean;
  /** Count of links minted from this form — gates hard-delete (archive instead). */
  linkCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface OnboardingFormSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isDefault: boolean;
  isArchived: boolean;
  linkCount: number;
  stepCount: number;
  updatedAt: string;
}
