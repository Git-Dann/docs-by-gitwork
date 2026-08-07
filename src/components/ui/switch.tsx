"use client";

/**
 * The house on/off switch.
 *
 * The same markup was already hand-rolled in at least three places (`pulse-embed-panel.tsx`,
 * `settings-panel.tsx`, `client-cockpit.tsx`), each with its own copy of the track/knob classes.
 * This is that pattern, extracted — reach for it rather than writing a fourth.
 *
 * ⚠️ A `<button role="switch">`, deliberately NOT a checkbox. A checkbox says "tick this as part of
 * submitting a form"; these controls take effect the moment you press them, which is what a switch
 * means. It also cannot be wrapped in a `<label>` — nesting a button inside one does not associate
 * it and swallows the click — so the caller passes `label` and the accessible name comes from
 * `aria-label`.
 */

import { cn } from "@/lib/format";

export function Switch({
  checked,
  onChange,
  label,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name. The visible text is the caller's — this is what a screen reader announces. */
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative mt-0.5 inline-flex h-[18px] w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-700)] focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-[var(--brand-700)]" : "bg-[var(--border-1)]",
        className,
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-[14px]" : "translate-x-0",
        )}
      />
    </button>
  );
}
