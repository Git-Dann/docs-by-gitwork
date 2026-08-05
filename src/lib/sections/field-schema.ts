/**
 * Schema-described block editors — the field vocabulary, and the pure logic behind it.
 *
 * Most block editors are the same thing written out longhand: a handful of scalar fields in a
 * two-column grid, each one a `<label>` + control + an `onChange` that spreads `data` and
 * overwrites one key. `TermEditor` is 60 lines of that; there are roughly twenty more like it.
 *
 * Hand-writing them is not just repetitive, it is where the defects live — every copy is a fresh
 * chance to forget a padding class, mis-coerce a number, or write to the wrong key. Declaring the
 * fields instead means one renderer, one set of classes, one coercion path.
 *
 * **This does NOT replace the hand-written `Editor`.** Roughly eight blocks — the cover, costing,
 * the drag-and-drop lists, parties, signatures, pricing tiers — are genuinely bespoke, and forcing
 * them through a schema would produce a worse editor and a schema nobody could read. A block
 * declares `fields` OR writes an `Editor`; both stay first-class.
 *
 * The coercion in `applyFieldChange` is the part worth testing hard: a control hands back a
 * string for everything, and turning "" into `0`, or `NaN` into a saved value, is exactly the
 * class of bug a generic renderer would otherwise spread across twenty blocks at once.
 */

export type FieldWidth = "full" | "half";

interface BaseField<TData> {
  /** The key on the block's data this field reads and writes. */
  key: keyof TData & string;
  label: string;
  /** One line under the control. Use it for consequences, not restatements of the label. */
  hint?: string;
  /** `half` sits two-up once the rail is wide enough; `full` always spans. Default `half`. */
  width?: FieldWidth;
}

export type SectionField<TData> =
  | (BaseField<TData> & { kind: "text"; placeholder?: string })
  | (BaseField<TData> & { kind: "textarea"; placeholder?: string; rows?: number })
  | (BaseField<TData> & { kind: "number"; min?: number; max?: number; step?: number })
  | (BaseField<TData> & { kind: "date" })
  | (BaseField<TData> & { kind: "checkbox" })
  | (BaseField<TData> & {
      kind: "select";
      options: ReadonlyArray<{ value: string; label: string }>;
    });

/** What a control hands back. Every DOM control gives a string except a checkbox. */
export type RawFieldValue = string | boolean;

/**
 * Apply one field's raw control value to the block's data.
 *
 * Pure, and the single coercion point for every schema-described editor — so the rules below are
 * decided once rather than re-decided per block:
 *
 *  · A number field with an EMPTY input yields `undefined`, not `0`. Clearing "Notice period"
 *    must not silently mean "zero days' notice"; it means unset, and the block's own default
 *    applies on render.
 *  · A number that doesn't parse is IGNORED rather than saved as `NaN`. `NaN` serialises to
 *    `null` through JSON and would quietly wipe the field on the next save.
 *  · Text is stored verbatim, NOT trimmed. Trimming on every keystroke stops you typing a space
 *    between words, which is the kind of thing that gets shipped and then blamed on the browser.
 */
export function applyFieldChange<TData extends object>(
  data: TData,
  field: SectionField<TData>,
  raw: RawFieldValue,
): TData {
  if (field.kind === "checkbox") {
    return { ...data, [field.key]: Boolean(raw) };
  }

  const text = String(raw);

  if (field.kind === "number") {
    if (text.trim() === "") return { ...data, [field.key]: undefined };
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) return data;
    return { ...data, [field.key]: clamp(parsed, field.min, field.max) };
  }

  return { ...data, [field.key]: text };
}

function clamp(value: number, min?: number, max?: number): number {
  if (typeof min === "number" && value < min) return min;
  if (typeof max === "number" && value > max) return max;
  return value;
}

/**
 * The value to put in the control.
 *
 * Controlled inputs must never receive `undefined` — React switches the input to uncontrolled and
 * warns, and the field then silently stops tracking state. So an absent value becomes `""` (or
 * `false` for a checkbox) here, in one place, rather than at twenty call sites.
 */
export function fieldControlValue<TData extends object>(
  data: TData,
  field: SectionField<TData>,
): string | boolean {
  const value = (data as Record<string, unknown>)[field.key];
  if (field.kind === "checkbox") return Boolean(value);
  if (value === null || value === undefined) return "";
  return String(value);
}
