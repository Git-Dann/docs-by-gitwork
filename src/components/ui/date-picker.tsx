"use client";

/**
 * The date field — one picker for the whole platform, replacing `<input type="date">`,
 * which draws a different control in every browser (and on iOS, a wheel).
 *
 * The look and motion are EasyUI's Date Picker and Calendar, vendored under
 * `./easyui/` (MIT — see `docs/third-party-ui.md`). This file is the Foundry adapter, and
 * it is what Foundry code imports: it keeps the native input's contract so it is a
 * drop-in replacement —
 *   - `value` is the same `YYYY-MM-DD` string the native input holds, `""` when empty, and
 *     `onChange` receives exactly that. An invalid value reads as empty, as natively.
 *   - `min` / `max` / `disabled` / `required` / `id` / `name` / `aria-label`.
 * — and adds what EasyUI's picker doesn't have: weeks starting Monday (en-GB), a Today /
 * Clear footer (no Clear when `required`), Tab kept inside the open calendar, and a hidden
 * form mirror so `required` blocks an empty `<form>` submit like the native attribute.
 *
 * Calendar dates, not instants: a string becomes a LOCAL-midnight `Date` built from its
 * fields and goes back through the same fields (`src/lib/calendar-date.ts`), so neither the
 * viewer's timezone nor a clock change can move it by a day.
 *
 * Two exports:
 * - `DatePicker` — one date.
 * - `DateRangePicker` — a first and last day in one calendar (click the start, then the
 *   end). Nothing is committed until both are picked, so closing half-way leaves the field
 *   as it was. Use it where two dates are really one fact ("away 6–13 Oct"); keep two
 *   `DatePicker`s where each date has its own label or options.
 */

import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";
import { Calendar } from "@/components/ui/easyui/calendar";
import { PickerShell } from "@/components/ui/easyui/date-picker";
import { dateToISO, formatDisplayDate, isISODate, isoToDate, isWithinBounds, todayISO } from "@/lib/calendar-date";
import { cn } from "@/lib/format";

type CommonProps = {
  /** Earliest pickable day, `YYYY-MM-DD`. */
  min?: string;
  /** Latest pickable day, `YYYY-MM-DD`. */
  max?: string;
  disabled?: boolean;
  /** Blocks form submission while empty, like the native attribute, and hides Clear. */
  required?: boolean;
  /** Goes on the trigger button, so `<label htmlFor>` works. */
  id?: string;
  /** Submitted with a native `<form>`, as the native input's `name` would be. */
  name?: string;
  "aria-label"?: string;
  /** Classes for the outer box — width and margin (`mt-1`, `w-[150px]`). Fills its column by default. */
  className?: string;
  placeholder?: string;
};

export type DatePickerProps = CommonProps & {
  value: string;
  onChange: (value: string) => void;
};

export type DateRange = { start: string; end: string };

export type DateRangePickerProps = CommonProps & {
  value: DateRange;
  onChange: (value: DateRange) => void;
};

const LOCALE = "en-GB";
const WEEK_STARTS_ON = 1 as const;

/**
 * Hidden mirror for `required` and `name`. Opacity 0 rather than `display: none`, because
 * a required control the browser cannot focus fails with a console error instead of
 * blocking the submit. If the browser focuses it to show "Please fill in this field",
 * focus is handed straight to the real trigger.
 */
function FormMirror({
  name,
  value,
  required,
  triggerRef,
}: {
  name?: string;
  value: string;
  required?: boolean;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  if (!name && !required) return null;
  return (
    <input
      tabIndex={-1}
      aria-hidden="true"
      name={name}
      required={required}
      value={value}
      onChange={() => {}}
      onFocus={() => triggerRef.current?.focus()}
      data-date-picker-mirror=""
      className="pointer-events-none absolute inset-x-0 bottom-0 h-px w-full opacity-0"
    />
  );
}

/** Keep Tab inside the open calendar — leaving it should be a choice (Escape). */
function trapTab(event: ReactKeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") return;
  const items = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled]):not([tabindex='-1'])"),
  );
  if (items.length === 0) return;
  const index = items.indexOf(document.activeElement as HTMLElement);
  const next = event.shiftKey
    ? items[(index - 1 + items.length) % items.length]
    : items[(index + 1) % items.length];
  event.preventDefault();
  next.focus();
}

const FOOTER_BUTTON =
  "rounded-lg px-2 py-1 text-xs font-medium outline-none transition-colors hover:bg-[var(--surface-1)] focus-visible:ring-2 focus-visible:ring-[var(--brand-focus-ring)] disabled:pointer-events-none disabled:opacity-30 motion-reduce:transition-none";

function Footer({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-[var(--border-2)] px-3 py-2">{children}</div>
  );
}

function bounds(min?: string, max?: string) {
  return {
    minDate: isISODate(min) ? isoToDate(min) : undefined,
    maxDate: isISODate(max) ? isoToDate(max) : undefined,
  };
}

function triggerLabel(ariaLabel: string | undefined, display: string, empty: string) {
  return ariaLabel ? `${ariaLabel}, ${display || empty}` : undefined;
}

// ── DatePicker ────────────────────────────────────────────────────────────────

export function DatePicker({
  value,
  onChange,
  min,
  max,
  disabled,
  required,
  id,
  name,
  "aria-label": ariaLabel,
  className,
  placeholder = "Select date",
}: DatePickerProps) {
  const current = isISODate(value) ? value : "";
  const display = current ? formatDisplayDate(current) : "";

  return (
    <PickerShell
      text={display || null}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      triggerProps={{
        id,
        "aria-label": triggerLabel(ariaLabel, display, "no date"),
        "aria-required": required || undefined,
      }}
      panelLabel={ariaLabel ? `Choose ${ariaLabel.toLowerCase()}` : undefined}
      addon={({ triggerRef }) => (
        <FormMirror name={name} value={current} required={required} triggerRef={triggerRef} />
      )}
    >
      {({ close }) => (
        <SingleBody value={current} min={min} max={max} required={required} onChange={onChange} close={close} />
      )}
    </PickerShell>
  );
}

function SingleBody({
  value,
  min,
  max,
  required,
  onChange,
  close,
}: {
  value: string;
  min?: string;
  max?: string;
  required?: boolean;
  onChange: (value: string) => void;
  close: () => void;
}) {
  const today = todayISO();
  return (
    <div onKeyDown={trapTab}>
      <Calendar
        mode="single"
        autoFocus
        locale={LOCALE}
        weekStartsOn={WEEK_STARTS_ON}
        {...bounds(min, max)}
        value={value ? isoToDate(value) : null}
        onChange={(d) => {
          onChange(d ? dateToISO(d) : "");
          close();
        }}
      />
      <Footer>
        <button
          type="button"
          disabled={!isWithinBounds(today, min, max)}
          onClick={() => {
            onChange(today);
            close();
          }}
          className={cn(FOOTER_BUTTON, "text-[var(--brand-700)]")}
        >
          Today
        </button>
        {!required && value ? (
          <button
            type="button"
            onClick={() => {
              onChange("");
              close();
            }}
            className={cn(FOOTER_BUTTON, "text-[var(--text-3)] hover:text-[var(--text-1)]")}
          >
            Clear
          </button>
        ) : null}
      </Footer>
    </div>
  );
}

// ── DateRangePicker ───────────────────────────────────────────────────────────

export function DateRangePicker({
  value,
  onChange,
  min,
  max,
  disabled,
  required,
  id,
  name,
  "aria-label": ariaLabel,
  className,
  placeholder = "Select dates",
}: DateRangePickerProps) {
  const start = isISODate(value.start) ? value.start : "";
  const end = isISODate(value.end) ? value.end : "";
  const display = start
    ? `${formatDisplayDate(start)} – ${end ? formatDisplayDate(end) : "…"}`
    : end
      ? `… – ${formatDisplayDate(end)}`
      : "";

  return (
    <PickerShell
      text={display || null}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      triggerProps={{
        id,
        "aria-label": triggerLabel(ariaLabel, display, "no dates"),
        "aria-required": required || undefined,
      }}
      panelLabel={ariaLabel ? `Choose ${ariaLabel.toLowerCase()}` : undefined}
      addon={({ triggerRef }) => (
        <FormMirror
          name={name}
          value={start && end ? `${start}/${end}` : ""}
          required={required}
          triggerRef={triggerRef}
        />
      )}
    >
      {({ close }) => (
        <RangeBody start={start} end={end} min={min} max={max} required={required} onChange={onChange} close={close} />
      )}
    </PickerShell>
  );
}

/**
 * Holds the half-picked range while the calendar is open. It only exists while open, so
 * closing half-way simply drops the draft and the field keeps its committed value.
 */
function RangeBody({
  start,
  end,
  min,
  max,
  required,
  onChange,
  close,
}: {
  start: string;
  end: string;
  min?: string;
  max?: string;
  required?: boolean;
  onChange: (value: DateRange) => void;
  close: () => void;
}) {
  const [draft, setDraft] = useState(() => ({
    from: start ? isoToDate(start) : null,
    to: end ? isoToDate(end) : null,
  }));
  const committed = useRef(false);
  const choosingEnd = !!draft.from && !draft.to;

  return (
    <div onKeyDown={trapTab}>
      <Calendar
        mode="range"
        autoFocus
        locale={LOCALE}
        weekStartsOn={WEEK_STARTS_ON}
        {...bounds(min, max)}
        value={draft}
        onChange={(r) => {
          setDraft(r);
          if (r.from && r.to && !committed.current) {
            committed.current = true;
            onChange({ start: dateToISO(r.from), end: dateToISO(r.to) });
            close();
          }
        }}
      />
      <Footer>
        <span className="text-xs text-[var(--text-4)]" aria-live="polite">
          {choosingEnd ? "Now pick the last day" : "Pick the first day"}
        </span>
        {!required && (start || end) ? (
          <button
            type="button"
            onClick={() => {
              onChange({ start: "", end: "" });
              close();
            }}
            className={cn(FOOTER_BUTTON, "text-[var(--text-3)] hover:text-[var(--text-1)]")}
          >
            Clear
          </button>
        ) : null}
      </Footer>
    </div>
  );
}
