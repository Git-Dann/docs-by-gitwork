"use client";

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
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as "GBP" | "USD" | "EUR")}
      className="app-select-compact w-full"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
