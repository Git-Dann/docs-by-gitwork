"use client";

import { ChevronUpDownIcon } from "@heroicons/react/24/outline";

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
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as "GBP" | "USD" | "EUR")}
        className="proposal-field-compact w-full appearance-none pr-10"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronUpDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-3)]" />
    </div>
  );
}
