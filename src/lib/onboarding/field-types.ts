/**
 * Field-type registry — the canonical metadata + validation for every onboarding
 * field type. Mirrors the role of `src/lib/sections/registry.ts` for Docs.
 *
 * Kept deliberately framework-free (no React / no icons) so the server can import
 * it for answer validation. The public renderer switches on `type` for rendering;
 * the builder palette maps `type` → icon locally.
 */

import type {
  OnboardingAnswerValue,
  OnboardingFieldDef,
  OnboardingFieldType,
} from "@/types/onboarding";

export type FieldTypeCategory = "text" | "choice" | "other";

export interface FieldTypeMeta {
  type: OnboardingFieldType;
  displayName: string;
  description: string;
  category: FieldTypeCategory;
  /** Offered in the builder's "Custom questions" palette (bank is system-only). */
  custom: boolean;
  /** Whether this type carries an `options` list. */
  supportsOptions: boolean;
  /** Whether this type takes free-text input (label/placeholder/hint editable). */
  takesInput: boolean;
  /** Build a fresh custom field of this type (id is assigned by the caller). */
  makeDefault: () => Omit<OnboardingFieldDef, "id">;
}

const DEFAULT_SHORT_MAX = 280;
const DEFAULT_LONG_MAX = 5000;

export const FIELD_TYPE_REGISTRY: Record<OnboardingFieldType, FieldTypeMeta> = {
  short_text: {
    type: "short_text", displayName: "Short text", description: "A single line of text.",
    category: "text", custom: true, supportsOptions: false, takesInput: true,
    makeDefault: () => ({ type: "short_text", label: "Short answer", config: { maxLength: DEFAULT_SHORT_MAX } }),
  },
  long_text: {
    type: "long_text", displayName: "Long text", description: "A multi-line paragraph answer.",
    category: "text", custom: true, supportsOptions: false, takesInput: true,
    makeDefault: () => ({ type: "long_text", label: "Long answer", config: { rows: 4, maxLength: DEFAULT_LONG_MAX } }),
  },
  email: {
    type: "email", displayName: "Email", description: "An email address (validated).",
    category: "text", custom: true, supportsOptions: false, takesInput: true,
    makeDefault: () => ({ type: "email", label: "Email", placeholder: "name@company.com" }),
  },
  phone: {
    type: "phone", displayName: "Phone", description: "A telephone number.",
    category: "text", custom: true, supportsOptions: false, takesInput: true,
    makeDefault: () => ({ type: "phone", label: "Phone", placeholder: "+44 7700 900000" }),
  },
  url: {
    type: "url", displayName: "URL", description: "A web link (validated).",
    category: "text", custom: true, supportsOptions: false, takesInput: true,
    makeDefault: () => ({ type: "url", label: "Website", placeholder: "https://…" }),
  },
  number: {
    type: "number", displayName: "Number", description: "A numeric answer.",
    category: "text", custom: true, supportsOptions: false, takesInput: true,
    makeDefault: () => ({ type: "number", label: "Number" }),
  },
  select: {
    type: "select", displayName: "Single choice", description: "Pick one from a list.",
    category: "choice", custom: true, supportsOptions: true, takesInput: false,
    makeDefault: () => ({
      type: "select", label: "Choose one",
      options: [{ id: "opt-1", label: "Option 1" }, { id: "opt-2", label: "Option 2" }],
    }),
  },
  multiselect: {
    type: "multiselect", displayName: "Multiple choice", description: "Pick any number from a list.",
    category: "choice", custom: true, supportsOptions: true, takesInput: false,
    makeDefault: () => ({
      type: "multiselect", label: "Select all that apply",
      options: [{ id: "opt-1", label: "Option 1" }, { id: "opt-2", label: "Option 2" }],
    }),
  },
  checkbox: {
    type: "checkbox", displayName: "Checkbox", description: "A single yes/no tick.",
    category: "choice", custom: true, supportsOptions: false, takesInput: false,
    makeDefault: () => ({ type: "checkbox", label: "I agree" }),
  },
  static: {
    type: "static", displayName: "Info text", description: "Read-only copy — no input collected.",
    category: "other", custom: true, supportsOptions: false, takesInput: false,
    makeDefault: () => ({ type: "static", label: "", config: { body: "Add your note here." } }),
  },
  bank_details: {
    type: "bank_details", displayName: "Bank details",
    description: "Encrypted bank account capture (system field).",
    category: "other", custom: false, supportsOptions: false, takesInput: false,
    makeDefault: () => ({ type: "bank_details", label: "Bank details" }),
  },
};

export function fieldTypeMeta(type: OnboardingFieldType): FieldTypeMeta {
  return FIELD_TYPE_REGISTRY[type] ?? FIELD_TYPE_REGISTRY.short_text;
}

/** A field is "custom" when it has no system mapping. */
export function isCustomField(def: Pick<OnboardingFieldDef, "systemKey">): boolean {
  return !def.systemKey;
}

/** Field types that collect no answer (rendered as chrome only). */
export function collectsAnswer(type: OnboardingFieldType): boolean {
  return type !== "static";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface AnswerValidation {
  ok: boolean;
  /** The cleaned value to store (string | boolean | string[] | null). */
  value: OnboardingAnswerValue;
  error?: string;
}

/**
 * Validate + normalise a single incoming answer against its field definition.
 * Returns the value to persist. Lenient by design — onboarding autosaves partial
 * answers continuously, so empty/blank is always allowed; format checks only bite
 * on non-empty values.
 */
export function validateAnswer(
  def: OnboardingFieldDef,
  raw: unknown,
): AnswerValidation {
  switch (def.type) {
    case "checkbox":
      return { ok: true, value: Boolean(raw) };

    case "multiselect": {
      const arr = Array.isArray(raw) ? raw.map(String) : [];
      const allowed = new Set((def.options ?? []).map((o) => o.id));
      const value = def.options ? arr.filter((v) => allowed.has(v)) : arr;
      return { ok: true, value };
    }

    case "select": {
      if (raw == null || raw === "") return { ok: true, value: null };
      const value = String(raw);
      if (def.options && def.options.length > 0 && !def.options.some((o) => o.id === value)) {
        return { ok: false, value: null, error: `${def.label}: invalid choice.` };
      }
      return { ok: true, value };
    }

    case "static":
      return { ok: true, value: null };

    case "number": {
      if (raw == null || raw === "") return { ok: true, value: null };
      const s = String(raw).trim();
      if (!/^-?\d*\.?\d+$/.test(s)) return { ok: false, value: null, error: `${def.label}: not a number.` };
      return { ok: true, value: s };
    }

    default: {
      // short_text | long_text | email | phone | url | bank_details(no-op here)
      if (raw == null) return { ok: true, value: null };
      let s = String(raw);
      const max = def.config?.maxLength ?? (def.type === "long_text" ? DEFAULT_LONG_MAX : DEFAULT_SHORT_MAX);
      if (s.length > max) s = s.slice(0, max);
      const trimmed = s.trim();
      if (trimmed === "") return { ok: true, value: null };
      if (def.type === "email" && !EMAIL_RE.test(trimmed)) {
        return { ok: false, value: null, error: `${def.label}: invalid email.` };
      }
      return { ok: true, value: s };
    }
  }
}
