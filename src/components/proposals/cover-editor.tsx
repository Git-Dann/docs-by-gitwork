"use client";

import { resolveConfidentialityText, useLocalSettings } from "@/lib/local-settings";
import type { CoverSectionData } from "@/types/proposal";

export function CoverEditor({
  value,
  onChange,
}: {
  value: CoverSectionData;
  onChange: (value: CoverSectionData) => void;
}) {
  const { settings } = useLocalSettings();
  const confidentialityMode = value.confidentialityMode ?? "INTERNAL";
  const confidentialityText = resolveConfidentialityText(confidentialityMode, settings, value.confidentiality);

  return (
    <div className="space-y-5 rounded-2xl border border-[var(--border-1)] bg-white p-6">
      <div className="grid gap-5 md:grid-cols-2">
        <Input
          label="Proposal title"
          value={value.proposalTitle}
          onChange={(proposalTitle) => onChange({ ...value, proposalTitle })}
        />
        <Input
          label="Product / project name"
          value={value.productName}
          onChange={(productName) => onChange({ ...value, productName })}
        />
        <Input
          label="Client / company name"
          value={value.clientName}
          onChange={(clientName) => onChange({ ...value, clientName })}
        />
        <Input
          label="Subtitle / version"
          value={value.subtitle}
          onChange={(subtitle) => onChange({ ...value, subtitle })}
        />
        <Input
          label="Date"
          value={value.date}
          onChange={(date) => onChange({ ...value, date })}
          type="date"
        />
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-[var(--text-2)]">Cover lockup</span>
          <select
            value={value.brandLockup ?? "GITWORK"}
            onChange={(event) =>
              onChange({
                ...value,
                brandLockup: event.target.value as CoverSectionData["brandLockup"],
              })
            }
            className="app-select w-full"
          >
            <option value="GITWORK">Gitwork only</option>
            <option value="CLIENT_X_GITWORK">Client x Gitwork</option>
          </select>
        </label>
      </div>

      <div className="space-y-3">
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-[var(--text-2)]">Confidentiality audience</span>
          <select
            value={confidentialityMode}
            onChange={(event) => {
              const nextMode = event.target.value as CoverSectionData["confidentialityMode"];
              onChange({
                ...value,
                confidentialityMode: nextMode,
                confidentiality: resolveConfidentialityText(nextMode, settings, value.confidentiality),
              });
            }}
            className="app-select w-full"
          >
            <option value="INTERNAL">Internal</option>
            <option value="EXTERNAL">External</option>
          </select>
        </label>

        <div className="rounded-xl border border-[var(--border-1)] bg-[var(--surface-1)] px-4 py-3">
          <p className="text-sm text-[var(--text-2)]">{confidentialityText}</p>
        </div>
      </div>

      <p className="text-xs text-[var(--text-3)]">
        Display format: <span className="font-medium">{value.productName || "Product"} by Gitwork</span>
      </p>
      <p className="text-xs text-[var(--text-3)]">
        Proposal defaults, template-owned branding, and confidentiality copy are managed in Settings.
      </p>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-sm font-medium text-[var(--text-2)]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={type ?? "text"}
        className="w-full"
      />
    </label>
  );
}
