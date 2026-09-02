"use client";

import { Button } from "@/components/ui/button";
import { GITWORK } from "@/lib/gitwork";
import type { CTAInput, LinkType } from "@/types/proposal";

const destinationOptions: Array<{ value: LinkType; label: string; placeholder: string }> = [
  { value: "EXTERNAL_URL", label: "Website link", placeholder: GITWORK.url },
  { value: "DOCUMENT_LINK", label: "Document link", placeholder: "https://docs.google.com/..." },
  { value: "DECK_LINK", label: "Deck link", placeholder: "https://pitch.com/..." },
  { value: "EMAIL_LINK", label: "Email action", placeholder: GITWORK.email },
  { value: "INTERNAL_ROUTE", label: "Internal page", placeholder: "/app/docs/123" },
];

function ensureRole(ctas: CTAInput[], role: CTAInput["role"]): CTAInput {
  return (
    ctas.find((cta) => cta.role === role) ?? {
      role,
      label: role === "PRIMARY" ? "Book a call" : "Review the full proposal",
      destination: "",
      destinationType: role === "PRIMARY" ? "EMAIL_LINK" : "DOCUMENT_LINK",
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
    <div className="app-subtle-panel @container space-y-4 p-5">
      <div>
        <p className="app-eyebrow">Actions</p>
        <p className="mt-2 text-base font-semibold text-[var(--text-1)]">Calls to action</p>
        <p className="mt-1 text-sm leading-6 text-[var(--text-3)]">
          Shape the next step the client should take once they reach the close of the proposal.
        </p>
      </div>

      <div className="grid gap-4 @[26rem]:grid-cols-2">
        <RoleCard
          title="Primary action"
          description="The most important next step."
          value={primary}
          accent="primary"
          onChange={(patch) => updateRole("PRIMARY", patch)}
        />

        <RoleCard
          title="Secondary action"
          description="A softer fallback if the client is not ready for the main action."
          value={secondary}
          accent="secondary"
          onChange={(patch) => updateRole("SECONDARY", patch)}
        />
      </div>
    </div>
  );
}

function RoleCard({
  title,
  description,
  value,
  accent,
  onChange,
}: {
  title: string;
  description: string;
  value: CTAInput;
  accent: "primary" | "secondary";
  onChange: (patch: Partial<CTAInput>) => void;
}) {
  const selectedOption = destinationOptions.find((option) => option.value === value.destinationType) ?? destinationOptions[0];

  return (
    <section className="@container space-y-4 rounded-[10px] border border-[var(--border-2)] bg-white p-4 shadow-[var(--shadow-xs)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-[var(--text-1)]">{title}</h4>
          <p className="mt-1 text-sm leading-6 text-[var(--text-3)]">{description}</p>
        </div>

        {accent === "primary" ? (
          <Button type="button" variant="primary" size="sm">
            {value.label || "Primary action"}
          </Button>
        ) : (
          <Button type="button" variant="secondary" size="sm">
            {value.label || "Secondary action"}
          </Button>
        )}
      </div>

      <div className="grid gap-3 @[26rem]:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-xs text-[var(--text-3)]">Button label</span>
          <input
            value={value.label}
            onChange={(event) => onChange({ label: event.target.value })}
            className="app-input-compact"
            placeholder="Book a discovery call"
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-xs text-[var(--text-3)]">Destination</span>
          <select
            value={value.destinationType}
            onChange={(event) =>
              onChange({ destinationType: event.target.value as CTAInput["destinationType"] })
            }
            className="app-select-compact w-full text-sm"
          >
            {destinationOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs text-[var(--text-3)]">Link, route, or email</span>
        <input
          value={value.destination}
          onChange={(event) => onChange({ destination: event.target.value })}
          onBlur={(event) => onChange({ destination: normalizeDestination(event.target.value, value.destinationType) })}
          className="app-input-compact"
          placeholder={selectedOption.placeholder}
        />
      </label>
    </section>
  );
}

function normalizeDestination(value: string, type: LinkType) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (type === "EMAIL_LINK") {
    if (trimmed.startsWith("mailto:")) {
      return trimmed;
    }

    return trimmed.includes("@") ? `mailto:${trimmed}` : trimmed;
  }

  if (type === "INTERNAL_ROUTE") {
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  }

  if (/^[a-z]+:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
}
