"use client";

import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { CheckIcon, ChevronUpDownIcon } from "@heroicons/react/24/outline";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/format";

const options = [
  { value: "GBP", label: "GBP (£)" },
  { value: "USD", label: "USD ($)" },
  { value: "EUR", label: "EUR (€)" },
] as const;

export function CurrencyField({
  value,
  onChange,
}: {
  value: "GBP" | "USD" | "EUR";
  onChange: (value: "GBP" | "USD" | "EUR") => void;
}) {
  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <Listbox value={selected.value} onChange={(next) => onChange(next)}>
      <div className="relative">
        <ListboxButton
          className={buttonStyles({
            variant: "secondary",
            size: "md",
            className: "w-full justify-between",
          })}
        >
          <span>{selected.label}</span>
          <ChevronUpDownIcon className="h-4 w-4 text-[var(--text-3)]" />
        </ListboxButton>

        <ListboxOptions className="absolute z-20 mt-1 w-full rounded-md border border-[var(--border-1)] bg-white p-1 shadow-sm focus:outline-none">
          {options.map((option) => (
            <ListboxOption
              key={option.value}
              value={option.value}
              className={({ focus }) =>
                cn("cursor-pointer rounded px-2 py-1.5 text-sm", focus ? "bg-[var(--surface-1)]" : "")
              }
            >
              {({ selected: isSelected }) => (
                <div className="flex items-center justify-between">
                  <span>{option.label}</span>
                  {isSelected ? <CheckIcon className="h-4 w-4 text-[var(--brand-600)]" /> : null}
                </div>
              )}
            </ListboxOption>
          ))}
        </ListboxOptions>
      </div>
    </Listbox>
  );
}
