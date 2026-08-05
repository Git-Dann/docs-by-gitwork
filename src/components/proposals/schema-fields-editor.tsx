/**
 * The ONE renderer behind every schema-described block editor.
 *
 * A block declares `fields` (see `src/lib/sections/field-schema.ts`) and gets this instead of sixty
 * lines of hand-written `<label>` + control + spread-and-overwrite. Every field grid in Docs was
 * already the same markup copied around; the copies had drifted, and each one was a fresh chance to
 * pick the wrong padding class or mis-coerce a number.
 *
 * LAYOUT CONTRACT (see `editor-primitives.tsx`): this renders in the ~280–360px Options rail, so
 * the two-up grid is a CONTAINER query (`@[26rem]:`), never a viewport breakpoint. A viewport
 * breakpoint keys off the window and would put two columns in a 280px rail on a wide screen.
 */

"use client";

import { FieldLabel } from "@/components/proposals/editor-primitives";
import {
  applyFieldChange,
  fieldControlValue,
  type SectionField,
} from "@/lib/sections/field-schema";

export function SchemaFieldsEditor<TData extends object>({
  data,
  fields,
  onChange,
}: {
  data: TData;
  fields: ReadonlyArray<SectionField<TData>>;
  onChange: (next: TData) => void;
}) {
  return (
    <div className="app-subtle-panel @container space-y-4 p-5">
      <div className="grid gap-3 @[26rem]:grid-cols-2">
        {fields.map((field) => (
          <Field key={field.key} data={data} field={field} onChange={onChange} />
        ))}
      </div>
    </div>
  );
}

function Field<TData extends object>({
  data,
  field,
  onChange,
}: {
  data: TData;
  field: SectionField<TData>;
  onChange: (next: TData) => void;
}) {
  // A textarea, a select and a checkbox all need the rail's full width to be usable; everything
  // else defaults to half and pairs up once there's room.
  const wide =
    field.width === "full" || field.kind === "textarea" || field.kind === "checkbox";
  const span = wide ? "@[26rem]:col-span-2" : "";

  const emit = (raw: string | boolean) => onChange(applyFieldChange(data, field, raw));
  const value = fieldControlValue(data, field);

  if (field.kind === "checkbox") {
    return (
      <label className={`flex items-start gap-2 text-sm text-[var(--text-2)] ${span}`}>
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => emit(e.target.checked)}
          className="app-checkbox mt-0.5"
        />
        <span>
          {field.label}
          {field.hint ? <Hint>{field.hint}</Hint> : null}
        </span>
      </label>
    );
  }

  return (
    <label className={`space-y-1.5 ${span}`}>
      <FieldLabel>{field.label}</FieldLabel>
      <Control field={field} value={String(value)} onEmit={emit} />
      {field.hint ? <Hint>{field.hint}</Hint> : null}
    </label>
  );
}

function Control<TData extends object>({
  field,
  value,
  onEmit,
}: {
  field: SectionField<TData>;
  value: string;
  onEmit: (raw: string) => void;
}) {
  switch (field.kind) {
    case "textarea":
      return (
        <textarea
          value={value}
          rows={field.rows ?? 3}
          placeholder={field.placeholder}
          onChange={(e) => onEmit(e.target.value)}
          className="proposal-field-compact"
        />
      );
    case "select":
      // `app-select-chevron pr-9` is required, not cosmetic: without the reserved padding the
      // value renders underneath the chevron. `audit:ui`'s SELECT-CHEVRON rule enforces it.
      return (
        <select
          value={value}
          onChange={(e) => onEmit(e.target.value)}
          className="app-input-compact app-select-chevron pr-9"
        >
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    case "number":
      return (
        <input
          type="number"
          value={value}
          min={field.min}
          max={field.max}
          step={field.step}
          onChange={(e) => onEmit(e.target.value)}
          className="app-input-compact"
        />
      );
    case "date":
      return (
        <input
          type="date"
          value={value}
          onChange={(e) => onEmit(e.target.value)}
          className="app-input-compact"
        />
      );
    case "text":
      return (
        <input
          value={value}
          placeholder={field.placeholder}
          onChange={(e) => onEmit(e.target.value)}
          className="app-input-compact"
        />
      );
    default:
      // `checkbox` — handled by <Field> above, which needs a different label shape entirely.
      return null;
  }
}

function Hint({ children }: { children: string }) {
  return <span className="mt-1 block text-xs leading-5 text-[var(--text-4)]">{children}</span>;
}
