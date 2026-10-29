"use client";

/**
 * Vendored from EasyUI — https://github.com/Surajmaurya1/easyui
 *   src/components/ui/date-picker.tsx @ 7c106d4a195f9ce566ffbbc672fc48bed68d30bd
 * MIT License, Copyright (c) 2026 Suraj Maurya — full text in docs/third-party-ui.md.
 *
 * Kept as EasyUI wrote it: the trigger, the spring pop from the trigger edge, the 160ms beat
 * that lets the selection pill land before the popover closes, focus handed back to the
 * trigger, and the controllable single/range API. Foundry changes only:
 *   - ⚠️ The popover is a Headless UI `PopoverPanel` with `anchor` (portalled to <body>),
 *     not EasyUI's `position: absolute` panel. Foundry's date fields sit inside dialogs
 *     (`overflow-y: auto`) and `.widget-card` (`overflow: hidden`), where an in-flow panel
 *     is clipped with nothing reporting it (CLAUDE.md §45.2, §55). Floating UI does the
 *     flip-above-when-tight that EasyUI's `usePopover` did by hand; the transform origin
 *     follows the side it lands on (`data-anchor`).
 *   - ⚠️ Escape is caught on `window` in the capture phase while open, so it closes the
 *     calendar and not the `<Modal>` around it (the modal listens on `document`).
 *   - colours → Foundry tokens (light + dark); the trigger is 36px like `app-input` so it
 *     lines up with the selects beside it; its text is 16px below `sm` (iOS zoom rule);
 *     the wrapper fills its column (`w-full`) instead of EasyUI's fixed `w-64`.
 *   - `triggerProps` (id / aria-* for labels) and `addon` (a hidden form mirror) slots.
 *   - Heroicons instead of lucide-react; `MotionConfig reducedMotion="user"`.
 *
 * Foundry code should import `@/components/ui/date-picker`, which wraps these with the
 * native `YYYY-MM-DD` string contract.
 */

import * as React from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { CalendarDaysIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { Calendar, type CalendarOptions, type DateRange } from "./calendar";

export type { DateRange } from "./calendar";

function useControllableState<T>(
  value: T | undefined,
  defaultValue: T,
  onChange?: (value: T) => void
): [T, (next: T) => void] {
  const [internal, setInternal] = React.useState<T>(defaultValue);
  const controlled = value !== undefined;
  const current = controlled ? (value as T) : internal;

  const onChangeRef = React.useRef(onChange);
  React.useEffect(() => {
    onChangeRef.current = onChange;
  });

  const set = React.useCallback(
    (next: T) => {
      if (!controlled) setInternal(next);
      onChangeRef.current?.(next);
    },
    [controlled]
  );

  return [current, set];
}

type Side = "bottom" | "top";

const popoverMotion = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.97, transition: { duration: 0.1 } },
  transition: { type: "spring", stiffness: 520, damping: 38, mass: 0.7 },
} as const;

const fmt = (d: Date, locale?: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(d);

/** Foundry: Escape closes the calendar before the dialog around it hears it. */
function EscapeToClose({ onEscape }: { onEscape: () => void }) {
  const ref = React.useRef(onEscape);
  ref.current = onEscape;
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      ref.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  return null;
}

/* ───────────── shell: trigger + animated popover ───────────── */

export type TriggerProps = {
  id?: string;
  "aria-label"?: string;
  "aria-required"?: boolean;
};

export function PickerShell({
  text,
  placeholder,
  align = "start",
  side: preferredSide = "auto",
  disabled,
  className,
  triggerProps,
  panelLabel,
  addon,
  children,
}: {
  text: string | null;
  placeholder: string;
  align?: "start" | "end";
  side?: Side | "auto";
  disabled?: boolean;
  className?: string;
  /** Foundry: id / aria-* for the trigger button, so a `<label htmlFor>` reaches it. */
  triggerProps?: TriggerProps;
  /** Foundry: accessible name for the calendar dialog. */
  panelLabel?: string;
  /** Foundry: rendered next to the trigger (a hidden input for `required` / `name`). */
  addon?: (api: { triggerRef: React.RefObject<HTMLButtonElement | null> }) => React.ReactNode;
  children: (api: { close: () => void }) => React.ReactNode;
}) {
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const timer = React.useRef<number | undefined>(undefined);
  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  const anchorTo = `${preferredSide === "top" ? "top" : "bottom"} ${align}` as const;

  return (
    <Popover className={cn("relative inline-block w-full max-w-full", className)}>
      {({ open, close: closeNow }) => {
        // brief beat so the selection pill lands before the popover closes
        const close = () => {
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => {
            const a = document.activeElement;
            closeNow();
            // only hand focus back if it hasn't moved elsewhere in the meantime
            if (!a || a === document.body || panelRef.current?.contains(a)) triggerRef.current?.focus();
          }, 160);
        };
        return (
          <>
            <PopoverButton
              ref={triggerRef}
              type="button"
              disabled={disabled}
              aria-haspopup="dialog"
              {...triggerProps}
              className={cn(
                "flex h-9 w-full items-center gap-2 rounded-lg border border-[var(--border-1)] bg-[var(--surface-0)] px-3 text-base shadow-[var(--shadow-xs)] outline-none transition-colors hover:border-[var(--text-4)] focus-visible:border-[var(--brand-500)] focus-visible:ring-4 focus-visible:ring-[var(--brand-focus-ring)] disabled:pointer-events-none disabled:opacity-50 sm:text-sm dark:bg-[var(--surface-1)]",
                open && "border-[var(--brand-500)] hover:border-[var(--brand-500)]"
              )}
            >
              <CalendarDaysIcon className="size-4 shrink-0 text-[var(--text-4)]" />
              <span
                title={text ?? undefined}
                className={cn("truncate", text ? "text-[var(--text-1)]" : "text-[var(--text-4)]")}
              >
                {text ?? placeholder}
              </span>
            </PopoverButton>
            {addon?.({ triggerRef })}

            <AnimatePresence>
              {open && (
                <PopoverPanel
                  static
                  ref={panelRef}
                  anchor={{ to: anchorTo, gap: 8, padding: 8 }}
                  role="dialog"
                  aria-label={panelLabel ?? "Choose date"}
                  // z-[220]: above the hand-rolled form overlays (z-70/75) and the brief overlay (z-210).
                  // `group` so the inner motion layer can read which side Floating UI landed on.
                  className="group z-[220] outline-none"
                >
                  {/* Headless UI owns the panel's `transition` prop, so EasyUI's spring lives on an
                      inner motion layer; AnimatePresence still runs its exit on unmount. */}
                  <motion.div
                    {...popoverMotion}
                    className={cn(
                      "w-max max-w-[calc(100vw-1rem)] rounded-xl border border-[var(--border-2)] bg-[var(--surface-0)] shadow-lg shadow-black/10 dark:shadow-black/40",
                      align === "end"
                        ? "origin-top-right group-data-[anchor^=top]:origin-bottom-right"
                        : "origin-top-left group-data-[anchor^=top]:origin-bottom-left"
                    )}
                  >
                    <MotionConfig reducedMotion="user">
                      <EscapeToClose
                        onEscape={() => {
                          window.clearTimeout(timer.current);
                          closeNow();
                          triggerRef.current?.focus();
                        }}
                      />
                      {children({ close })}
                    </MotionConfig>
                  </motion.div>
                </PopoverPanel>
              )}
            </AnimatePresence>
          </>
        );
      }}
    </Popover>
  );
}

/* ───────────── single date ───────────── */

export interface DatePickerProps extends CalendarOptions {
  value?: Date | null;
  defaultValue?: Date | null;
  onChange?: (date: Date | null) => void;
  placeholder?: string;
  align?: "start" | "end";
  side?: Side | "auto";
  disabled?: boolean;
  className?: string;
}

export function DatePicker({
  value,
  defaultValue = null,
  onChange,
  placeholder = "Pick a date",
  align,
  side,
  disabled,
  className,
  ...calendar
}: DatePickerProps) {
  const [date, setDate] = useControllableState<Date | null>(value, defaultValue, onChange);

  return (
    <PickerShell
      text={date ? fmt(date, calendar.locale) : null}
      placeholder={placeholder}
      align={align}
      side={side}
      disabled={disabled}
      className={className}
    >
      {({ close }) => (
        <Calendar
          mode="single"
          value={date}
          onChange={(d) => {
            setDate(d);
            close();
          }}
          {...calendar}
        />
      )}
    </PickerShell>
  );
}

/* ───────────── date range ───────────── */

export interface DateRangePickerProps extends CalendarOptions {
  value?: DateRange;
  defaultValue?: DateRange;
  onChange?: (range: DateRange) => void;
  placeholder?: string;
  align?: "start" | "end";
  side?: Side | "auto";
  disabled?: boolean;
  className?: string;
}

export function DateRangePicker({
  value,
  defaultValue = { from: null, to: null },
  onChange,
  placeholder = "Pick a range",
  align,
  side,
  disabled,
  className,
  ...calendar
}: DateRangePickerProps) {
  const [range, setRange] = useControllableState<DateRange>(value, defaultValue, onChange);
  const text = range.from
    ? `${fmt(range.from, calendar.locale)} – ${range.to ? fmt(range.to, calendar.locale) : "…"}`
    : null;

  return (
    <PickerShell
      text={text}
      placeholder={placeholder}
      align={align}
      side={side}
      disabled={disabled}
      className={className}
    >
      {({ close }) => (
        <Calendar
          mode="range"
          value={range}
          onChange={(r) => {
            setRange(r);
            if (r.from && r.to) close();
          }}
          {...calendar}
        />
      )}
    </PickerShell>
  );
}
