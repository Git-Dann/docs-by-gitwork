"use client";

import { useWorkspaceBranding } from "@/hooks/use-workspace-branding";
import type { CoverSectionData } from "@/types/proposal";

export function CoverEditor({
  value,
  onChange,
  preparedBy,
  onPreparedByChange,
}: {
  value: CoverSectionData;
  onChange: (value: CoverSectionData) => void;
  preparedBy: string;
  onPreparedByChange: (value: string) => void;
}) {
  const brandingQuery = useWorkspaceBranding();
  const branding = brandingQuery.data;
  const confidentialityMode = value.confidentialityMode ?? "INTERNAL";
  const confidentialityText =
    (confidentialityMode === "EXTERNAL"
      ? branding?.defaultConfidentialityExternal
      : branding?.defaultConfidentialityInternal) ||
    value.confidentiality ||
    "";

  return (
    <div className="space-y-4">
      <section className="grid gap-4 md:grid-cols-2">
        <Input
          label="Proposal title"
          value={value.proposalTitle}
          onChange={(proposalTitle) => onChange({ ...value, proposalTitle })}
        />
        <Input label="Prepared by" value={preparedBy} onChange={onPreparedByChange} />
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
          <span className="text-sm font-medium text-[var(--text-2)]">Confidentiality</span>
          <select
            value={confidentialityMode}
            onChange={(event) => {
              const nextMode = event.target.value as CoverSectionData["confidentialityMode"];
              const fromBranding =
                nextMode === "EXTERNAL"
                  ? branding?.defaultConfidentialityExternal
                  : branding?.defaultConfidentialityInternal;
              onChange({
                ...value,
                confidentialityMode: nextMode,
                confidentiality: fromBranding || value.confidentiality || "",
              });
            }}
            className="app-select w-full"
          >
            <option value="INTERNAL">Internal</option>
            <option value="EXTERNAL">External</option>
          </select>
        </label>
      </section>

      <section className="app-subtle-panel space-y-4 p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Product / project name"
            value={value.productName}
            onChange={(productName) => onChange({ ...value, productName })}
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

        <div className="rounded-[10px] border border-[var(--border-2)] bg-white px-4 py-4">
          <p className="app-eyebrow">Resolved copy</p>
          <p className="mt-2 text-sm leading-6 text-[var(--text-2)]">{confidentialityText}</p>
        </div>

        <p className="text-sm leading-6 text-[var(--text-3)]">
          Template-owned branding and confidentiality defaults still come from Settings, while
          proposal metadata is controlled here in the builder.
        </p>
      </section>
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
        className="app-input"
      />
    </label>
  );
}
