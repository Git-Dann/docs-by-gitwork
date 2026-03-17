"use client";

import type { CTAInput, LinkType } from "@/types/proposal";

const destinationTypes: LinkType[] = [
  "INTERNAL_ROUTE",
  "EXTERNAL_URL",
  "DECK_LINK",
  "DOCUMENT_LINK",
  "EMAIL_LINK",
];

function ensureRole(ctas: CTAInput[], role: CTAInput["role"]): CTAInput {
  return (
    ctas.find((cta) => cta.role === role) ?? {
      role,
      label: role === "PRIMARY" ? "Book a call" : "View deck",
      destination: "",
      destinationType: role === "PRIMARY" ? "EMAIL_LINK" : "DECK_LINK",
      sortOrder: role === "PRIMARY" ? 0 : 1,
    }
  );
}

export function CTAEditor({
  ctas,
  onChange,
}: {
  ctas: CTAInput[];
  onChange: (ctas: CTAInput[]) => void;
}) {
  const primary = ensureRole(ctas, "PRIMARY");
  const secondary = ensureRole(ctas, "SECONDARY");

  function updateRole(role: CTAInput["role"], patch: Partial<CTAInput>) {
    const base = role === "PRIMARY" ? primary : secondary;
    const updated = { ...base, ...patch };

    onChange([
      role === "PRIMARY" ? updated : primary,
      role === "SECONDARY" ? updated : secondary,
    ]);
  }

  return (
    <div className="space-y-3 rounded-lg border border-[var(--border-1)] bg-[var(--surface-0)] p-3">
      <p className="text-sm font-medium">Call to actions</p>

      <RoleCard
        title="Primary CTA"
        value={primary}
        onChange={(patch) => updateRole("PRIMARY", patch)}
      />

      <RoleCard
        title="Secondary CTA"
        value={secondary}
        onChange={(patch) => updateRole("SECONDARY", patch)}
      />
    </div>
  );
}

function RoleCard({
  title,
  value,
  onChange,
}: {
  title: string;
  value: CTAInput;
  onChange: (patch: Partial<CTAInput>) => void;
}) {
  return (
    <section className="space-y-2 rounded-md border border-[var(--border-1)] bg-white p-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-3)]">{title}</h4>
      <div className="grid gap-2 md:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs text-[var(--text-3)]">Label</span>
          <input
            value={value.label}
            onChange={(event) => onChange({ label: event.target.value })}
            className="h-9 w-full rounded-md border border-[var(--border-1)] px-2 text-sm"
            placeholder="Book a call"
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs text-[var(--text-3)]">Destination type</span>
          <select
            value={value.destinationType}
            onChange={(event) => onChange({ destinationType: event.target.value as CTAInput["destinationType"] })}
            className="app-select-compact h-9 w-full rounded-md border border-[var(--border-1)] bg-white text-sm"
          >
            {destinationTypes.map((type) => (
              <option key={type} value={type}>
                {type.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-xs text-[var(--text-3)]">Destination</span>
        <input
          value={value.destination}
          onChange={(event) => onChange({ destination: event.target.value })}
          className="h-9 w-full rounded-md border border-[var(--border-1)] px-2 text-sm"
          placeholder="mailto:hello@gitwork.io"
        />
      </label>
    </section>
  );
}
