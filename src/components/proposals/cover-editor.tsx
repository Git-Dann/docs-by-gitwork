"use client";

import type { CoverSectionData } from "@/types/proposal";

export function CoverEditor({
  value,
  onChange,
}: {
  value: CoverSectionData;
  onChange: (value: CoverSectionData) => void;
}) {
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
            className="w-full"
          >
            <option value="GITWORK">Gitwork only</option>
            <option value="CLIENT_X_GITWORK">Client x Gitwork</option>
          </select>
        </label>
      </div>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-[var(--text-2)]">Confidentiality statement</span>
        <textarea
          value={value.confidentiality}
          onChange={(event) => onChange({ ...value, confidentiality: event.target.value })}
          rows={3}
          className="w-full"
        />
      </label>

      <p className="text-xs text-[var(--text-3)]">
        Display format: <span className="font-medium">{value.productName || "Product"} by Gitwork</span>
      </p>
      <p className="text-xs text-[var(--text-3)]">
        Cover logos and graphics are handled in Supporting Links & Assets. Use a `Logo` asset with placement `Cover client logo` if you want the client x Gitwork lockup.
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
