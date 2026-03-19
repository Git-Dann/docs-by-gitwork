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
    <div className="space-y-5">
      <div className="app-subtle-panel p-5">
        <p className="app-eyebrow">Cover System</p>
        <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">
          Use the proposal and client metadata here. Template-owned branding and confidentiality defaults still come from Settings.
        </p>
      </div>

      <div className="app-subtle-panel p-5">
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
      </div>

      <div className="app-subtle-panel space-y-3 p-5">
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

        <div className="rounded-[16px] border border-[var(--border-2)] bg-white px-4 py-4">
          <p className="app-eyebrow">Resolved Copy</p>
          <p className="text-sm text-[var(--text-2)]">{confidentialityText}</p>
        </div>
      </div>

      <div className="app-subtle-panel space-y-2 p-5 text-sm leading-6 text-[var(--text-3)]">
        <p>
          Display format:{" "}
          <span className="font-medium text-[var(--text-2)]">
            {value.productName || "Product"} by Gitwork
          </span>
        </p>
        <p>Proposal defaults, template-owned branding, and confidentiality copy are managed in Settings.</p>
        <p>
          Client logos are managed on each client record and are pulled into the cover automatically when you use the client x Gitwork lockup.
        </p>
      </div>
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
