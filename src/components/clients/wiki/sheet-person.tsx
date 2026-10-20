"use client";

/**
 * Person cells in a Sheet (CLAUDE.md §73.1): a chip to show one, and a real picker to
 * choose one. The picker's list comes from the same directory as the @mention picker —
 * the team members who can see this client plus the client's people on the team's side,
 * the restricted list on the client's own page — and the server re-checks every pick
 * against that list, so this component is convenience, not the permission.
 *
 * The options panel is a Headless UI Combobox with `anchor`, which portals it to <body>:
 * inside the grid's scroller (or a dialog's scrolling body) an absolutely positioned panel
 * would be clipped on both axes (§55).
 */

import { useMemo, useRef, useState } from "react";
import { Combobox, ComboboxInput, ComboboxOption, ComboboxOptions } from "@headlessui/react";
import { CheckIcon } from "@heroicons/react/24/outline";
import { MONO } from "@/components/analytics/analytics-widgets";
import { matchMentionables } from "@/lib/wiki-mentions";
import { isSheetPerson, personInitials } from "@/lib/wiki-sheets";
import type { SheetCellValue, SheetPerson } from "@/types/wiki-sheets";

export function PersonAvatar({ person, size = 20 }: { person: Pick<SheetPerson, "name" | "kind">; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full text-[9px] font-semibold ${
        person.kind === "CLIENT"
          ? "bg-[var(--surface-1)] text-[var(--text-2)] ring-1 ring-[var(--border-1)]"
          : "bg-[var(--brand-50,rgba(29,78,216,0.08))] text-[var(--brand-600,#1D4ED8)]"
      }`}
      style={{ width: size, height: size, fontFamily: MONO }}
    >
      {personInitials(person.name)}
    </span>
  );
}

/** A person cell as it reads: initials + name. Legacy plain text reads as plain text. */
export function PersonValue({ value, wrap = false }: { value: SheetCellValue | undefined; wrap?: boolean }) {
  if (value === undefined || value === null) return null;
  if (!isSheetPerson(value)) {
    const text = typeof value === "string" ? value : "";
    return (
      <span className={wrap ? "block break-words whitespace-pre-wrap" : "block truncate"} title={text} data-person-text>
        {text}
      </span>
    );
  }
  return (
    <span className="inline-flex max-w-full min-w-0 items-center gap-1.5" title={value.name} data-person-chip={value.id}>
      <PersonAvatar person={value} />
      <span className={wrap ? "min-w-0 break-words" : "min-w-0 truncate"}>{value.name}</span>
    </span>
  );
}

/**
 * Choose one person. `onPick(null)` clears the cell. A value that is legacy text is offered
 * for replacing — it's shown under the search box so nobody wonders where it went.
 */
export function PersonPicker({
  people,
  value,
  label,
  autoFocus,
  onPick,
  onCancel,
  variant = "cell",
}: {
  people: readonly SheetPerson[];
  value: SheetCellValue | undefined;
  label: string;
  autoFocus?: boolean;
  onPick: (person: SheetPerson | null) => void;
  /** Cell editor only: Escape / Tab / leaving without a pick. */
  onCancel?: () => void;
  variant?: "cell" | "field";
}) {
  const [query, setQuery] = useState("");
  // Set while a pointer is down on the options panel, so the input's blur (which a click on
  // an option causes) doesn't cancel the edit before the pick lands.
  const picking = useRef(false);
  const current = isSheetPerson(value) ? value : null;
  const legacy = !current && typeof value === "string" && value.trim() ? value : null;
  const options = useMemo(() => matchMentionables(people, query, 50), [people, query]);

  return (
    <Combobox
      value={current}
      by={(a: SheetPerson | null, b: SheetPerson | null) => (a?.id ?? null) === (b?.id ?? null)}
      onChange={(p: SheetPerson | null) => onPick(p)}
      immediate
    >
      <div
        className={variant === "cell" ? "h-full w-full" : "relative mt-1"}
        onKeyDownCapture={(e) => {
          if (variant !== "cell") return;
          if (e.key === "Escape" || e.key === "Tab") {
            e.preventDefault();
            e.stopPropagation();
            onCancel?.();
          }
        }}
      >
        <ComboboxInput
          autoFocus={autoFocus}
          aria-label={label}
          placeholder={current ? current.name : legacy ? `Replace "${legacy}"` : "Search people"}
          displayValue={() => query}
          onChange={(e) => setQuery(e.target.value)}
          onBlur={(e) => {
            if (variant !== "cell") return;
            // Leaving the cell without picking cancels — but clicking an option must not.
            const next = e.relatedTarget as HTMLElement | null;
            if (next?.closest?.("[data-person-options]")) return;
            setTimeout(() => {
              if (!picking.current) onCancel?.();
            }, 150);
          }}
          className={
            variant === "cell"
              ? "h-full w-full bg-[var(--surface-0)] px-2 text-base outline-none sm:text-[13px]"
              : "app-input w-full text-base"
          }
          style={variant === "cell" ? { outline: "none" } : undefined}
        />
        <ComboboxOptions
          anchor="bottom start"
          // In a cell the editor only exists while editing, so its list is simply open — a
          // focus-to-open rule can miss an autofocus that lands before the handler is attached.
          static={variant === "cell"}
          data-person-options
          onPointerDown={() => {
            picking.current = true;
            setTimeout(() => (picking.current = false), 600);
          }}
          className="z-[70] max-h-64 w-[var(--input-width)] min-w-[240px] overflow-y-auto rounded-[10px] border border-[var(--border-1)] bg-[var(--surface-0)] p-1.5 shadow-[0_12px_32px_-4px_rgba(0,0,0,0.18)] [--anchor-gap:4px] empty:invisible"
        >
          {legacy && (
            <p className="px-2.5 pt-1 pb-1.5 text-[11px] text-[var(--text-4)]">
              Currently “{legacy}” as text — pick someone to replace it.
            </p>
          )}
          {(current || legacy) && (
            <ComboboxOption
              value={null}
              className="flex cursor-default items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-[13px] text-[var(--text-4)] data-[focus]:bg-[var(--surface-1)]"
            >
              <span className="w-5" />
              Clear
            </ComboboxOption>
          )}
          {options.map((p) => (
            <ComboboxOption
              key={p.id}
              value={p}
              className="flex cursor-default items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-[13px] text-[var(--text-1)] data-[focus]:bg-[var(--surface-1)]"
            >
              <PersonAvatar person={p} />
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <span className="shrink-0 text-[10px] tracking-[0.08em] text-[var(--text-4)] uppercase" style={{ fontFamily: MONO }}>
                {p.kind === "TEAM" ? "Gitwork" : "Client"}
              </span>
              {current?.id === p.id ? <CheckIcon className="h-3.5 w-3.5 shrink-0 text-[var(--brand-600,#1D4ED8)]" /> : null}
            </ComboboxOption>
          ))}
          {options.length === 0 && (
            <p className="px-2.5 py-1.5 text-[12px] text-[var(--text-4)]">
              {people.length === 0 ? "No one to pick yet." : "No one matches."}
            </p>
          )}
        </ComboboxOptions>
      </div>
    </Combobox>
  );
}
