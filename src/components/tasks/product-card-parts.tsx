"use client";

/**
 * Product cards (CLAUDE.md §124): the chips that say what a card is, and the picker a dev task
 * uses to say which card it delivers. Rules: src/lib/tasks/product-cards.ts.
 */

import { useMemo, useState } from "react";
import { Combobox, ComboboxInput, ComboboxOption, ComboboxOptions } from "@headlessui/react";
import { CheckIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { fuzzySearch } from "@/lib/fuzzy-search";
import { ITEM_TYPE_LABELS, TIER_LABELS, isItemType, isTier } from "@/lib/tasks/product-cards";
import type { TaskDTO } from "@/types/tasks";

const MONO = "var(--font-mono)";

/**
 * Bug reads red; the rest stay quiet so a full board isn't a rainbow. Palette families that
 * globals.css remaps for dark mode, and -700 text, because -500 on its own -50 tint is ~3:1.
 */
const TYPE_TONE: Record<string, string> = {
  feature: "border-blue-200 bg-blue-50 text-blue-700",
  subitem: "border-[var(--border-2)] bg-[var(--surface-1)] text-[var(--text-2)]",
  bug: "border-red-200 bg-red-50 text-red-700",
  feedback: "border-amber-200 bg-amber-50 text-amber-700",
};

const chip = "inline-flex h-[18px] shrink-0 items-center rounded-[4px] border px-1.5 text-[10px] uppercase tracking-[0.06em]";

export function ItemTypeChip({ itemType, className }: { itemType: string | null; className?: string }) {
  if (!isItemType(itemType)) return null;
  return (
    <span className={cn(chip, TYPE_TONE[itemType], className)} style={{ fontFamily: MONO }}>
      {ITEM_TYPE_LABELS[itemType]}
    </span>
  );
}

export function TierChip({ tier, className }: { tier: string | null; className?: string }) {
  if (!isTier(tier)) return null;
  return (
    <span
      className={cn(chip, "border-[var(--border-2)] bg-[var(--surface-0)] text-[var(--text-3)]", className)}
      style={{ fontFamily: MONO }}
    >
      {TIER_LABELS[tier]}
    </span>
  );
}

/** "2/3 dev tasks" on a card. Nothing when no dev task is linked. */
export function CardProgressChip({ progress }: { progress: TaskDTO["cardProgress"] }) {
  if (!progress) return null;
  const done = progress.done === progress.linked;
  return (
    <span
      className={cn(
        chip,
        done
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-[var(--border-2)] bg-[var(--surface-0)] text-[var(--text-3)]",
      )}
      style={{ fontFamily: MONO }}
      title={`${progress.done} of ${progress.linked} linked dev task${progress.linked === 1 ? "" : "s"} done${progress.doing ? `, ${progress.doing} in progress` : ""}`}
    >
      {progress.done}/{progress.linked} dev
    </span>
  );
}

/**
 * Pick the card a dev task delivers. The list is the client's product cards; the panel is
 * anchored (portalled), so a dialog body that scrolls can't clip it (§55).
 */
export function CardPicker({
  cards,
  value,
  onChange,
  disabled,
  excludeId,
  label = "Delivers card",
  placeholder,
  emptyText = "No product cards on this client yet.",
}: {
  cards: readonly TaskDTO[];
  value: string;
  onChange: (cardId: string) => void;
  disabled?: boolean;
  /** The task being edited, which can't deliver itself. */
  excludeId?: string;
  label?: string;
  placeholder?: string;
  emptyText?: string;
}) {
  const [query, setQuery] = useState("");
  const options = useMemo(
    () =>
      fuzzySearch(
        cards.filter((c) => c.id !== excludeId && !c.productCard),
        query,
        (c) => [c.title, c.area],
      ).slice(0, 50),
    [cards, query, excludeId],
  );
  const current = cards.find((c) => c.id === value) ?? null;

  return (
    <Combobox
      value={current}
      by={(a: TaskDTO | null, b: TaskDTO | null) => (a?.id ?? null) === (b?.id ?? null)}
      onChange={(c: TaskDTO | null) => {
        onChange(c?.id ?? "");
        setQuery("");
      }}
      disabled={disabled}
      immediate
    >
      <ComboboxInput
        aria-label={label}
        placeholder={placeholder ?? (cards.length ? "Search this client's cards" : emptyText)}
        displayValue={(c: TaskDTO | null) => (query ? query : (c?.title ?? ""))}
        onChange={(e) => setQuery(e.target.value)}
        className="app-input w-full text-base sm:text-sm"
      />
      <ComboboxOptions
        anchor="bottom start"
        className="z-[80] max-h-64 w-[var(--input-width)] min-w-[260px] overflow-y-auto rounded-[10px] border border-[var(--border-1)] bg-[var(--surface-0)] p-1.5 shadow-[0_12px_32px_-4px_rgba(0,0,0,0.18)] [--anchor-gap:4px] empty:invisible"
      >
        {current ? (
          <ComboboxOption
            value={null}
            className="flex cursor-default items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-[13px] text-[var(--text-4)] data-[focus]:bg-[var(--surface-1)]"
          >
            Not linked to a card
          </ComboboxOption>
        ) : null}
        {options.map((c) => (
          <ComboboxOption
            key={c.id}
            value={c}
            className="flex cursor-default items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-[13px] text-[var(--text-1)] data-[focus]:bg-[var(--surface-1)]"
          >
            <ItemTypeChip itemType={c.itemType} />
            <span className="min-w-0 flex-1 truncate" title={c.title}>
              {c.title}
            </span>
            {current?.id === c.id ? <CheckIcon className="h-3.5 w-3.5 shrink-0 text-[var(--brand-600)]" /> : null}
          </ComboboxOption>
        ))}
        {options.length === 0 ? (
          <p className="px-2.5 py-1.5 text-[12px] text-[var(--text-4)]">
            {cards.length === 0 ? emptyText : "Nothing matches."}
          </p>
        ) : null}
      </ComboboxOptions>
    </Combobox>
  );
}
