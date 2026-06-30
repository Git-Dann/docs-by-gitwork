"use client";

import { useWorkspaceBranding } from "@/hooks/use-workspace-branding";
import { useClientList } from "@/hooks/use-proposals";
import { ImagePicker } from "@/components/ui/image-picker";
import { cn } from "@/lib/format";
import type { CoverSectionData } from "@/types/proposal";

const COVER_STYLES: Array<{ value: NonNullable<CoverSectionData["coverStyle"]>; label: string; hint: string }> = [
  { value: "light", label: "Light", hint: "Editorial, warm canvas" },
  { value: "minimal", label: "Minimal", hint: "Bare title + logo" },
  { value: "bold", label: "Bold", hint: "Blue gradient hero" },
];

export function CoverEditor({
  value,
  onChange,
  preparedBy,
  onPreparedByChange,
  linkedClientLogoUrl,
  linkedClientName,
  linkedClientId,
  onLinkClient,
}: {
  value: CoverSectionData;
  onChange: (value: CoverSectionData) => void;
  preparedBy: string;
  onPreparedByChange: (value: string) => void;
  /** Logo of the linked Portal client, used as the client-lockup fallback when the override is blank. */
  linkedClientLogoUrl?: string;
  /** Name of the linked Portal client, for the inheritance hint. */
  linkedClientName?: string;
  /** Currently linked WorkspaceClient id (Document.clientId), if any. */
  linkedClientId?: string | null;
  /** Link/unlink the document to a real Portal client. clientId null → unlink (prospect). */
  onLinkClient?: (clientId: string | null, clientName: string) => void;
}) {
  const brandingQuery = useWorkspaceBranding();
  const branding = brandingQuery.data;
  const clientsQuery = useClientList({ status: "ALL", search: "" });
  const clients = clientsQuery.data?.clients ?? [];
  const coverStyle = value.coverStyle ?? "light";
  const confidentialityMode = value.confidentialityMode ?? "INTERNAL";
  const confidentialityText =
    (confidentialityMode === "EXTERNAL"
      ? branding?.defaultConfidentialityExternal
      : branding?.defaultConfidentialityInternal) ||
    value.confidentiality ||
    "";

  const clientLogoOverride = (value.clientLogoUrl ?? "").trim();
  const inheritsPortalLogo = !clientLogoOverride && Boolean(linkedClientLogoUrl);

  return (
    <div className="space-y-4">
      {/* Linked client — attribute the doc to a real Portal client (drives the cover lockup,
          {{client_name}}, and per-client grouping). Falls back to free text for a prospect. */}
      {onLinkClient ? (
        <section className="space-y-2">
          <label className="space-y-1.5 block">
            <span className="text-sm font-medium text-[var(--text-2)]">Client</span>
            <select
              value={linkedClientId ?? ""}
              onChange={(event) => {
                const id = event.target.value || null;
                const picked = clients.find((c) => c.id === id);
                // Linking clears the free-text override so the linked name shows; unlinking
                // leaves the override field for a prospect name.
                onLinkClient(id, picked?.name ?? "");
                if (id) onChange({ ...value, clientName: "" });
              }}
              className="app-select w-full"
            >
              <option value="">— Not linked (prospect / free text) —</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </label>
          {!linkedClientId ? (
            <Input
              label="Display name (prospect)"
              value={value.clientName}
              onChange={(clientName) => onChange({ ...value, clientName })}
            />
          ) : (
            <p className="text-xs text-[var(--text-4)]">
              Linked to <span className="font-medium text-[var(--text-2)]">{linkedClientName?.trim() || "a Portal client"}</span>.
              The cover, sharing, and analytics now track this client.
            </p>
          )}
        </section>
      ) : null}

      {/* Cover style — Light is the modern editorial default; Bold is the legacy blue hero. */}
      <section className="space-y-1.5">
        <span className="text-sm font-medium text-[var(--text-2)]">Cover style</span>
        <div className="flex gap-2">
          {COVER_STYLES.map((style) => (
            <button
              key={style.value}
              type="button"
              onClick={() => onChange({ ...value, coverStyle: style.value })}
              className={cn(
                "flex-1 rounded-[8px] border px-3 py-2 text-left transition-colors",
                coverStyle === style.value
                  ? "border-[var(--brand-600)] bg-[var(--surface-brand)]"
                  : "border-[var(--border-2)] bg-white hover:border-[var(--border-1)]",
              )}
            >
              <span className="block text-sm font-medium text-[var(--text-1)]">{style.label}</span>
              <span className="block text-xs text-[var(--text-4)]">{style.hint}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Input label="Prepared by" value={preparedBy} onChange={onPreparedByChange} />
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

      <details className="app-subtle-panel overflow-hidden p-0">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-[var(--text-2)] [&::-webkit-details-marker]:hidden">
          <span>Branding &amp; logos</span>
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
            Optional
          </span>
        </summary>
        <div className="space-y-4 px-4 pb-4">
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

        {/* Cover logos — both editable here so you can swap the Foundry mark per-document and
            supply a client logo even for a prospect that isn't in Portal yet. */}
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-sm font-medium text-[var(--text-2)]">Brand logo</span>
            <ImagePicker
              value={value.brandLogoUrl ?? ""}
              onChange={(brandLogoUrl) => onChange({ ...value, brandLogoUrl })}
            />
            <span className="block text-xs text-[var(--text-4)]">
              Overrides the cover&rsquo;s Foundry mark for this document. Leave blank to use the
              Settings → Branding logo.
            </span>
          </label>
          {(value.brandLockup ?? "GITWORK") === "CLIENT_X_GITWORK" ? (
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-[var(--text-2)]">Client logo</span>
              <ImagePicker
                value={value.clientLogoUrl ?? ""}
                onChange={(clientLogoUrl) => onChange({ ...value, clientLogoUrl })}
              />
              {inheritsPortalLogo ? (
                <span className="flex items-center gap-2 text-xs text-[var(--text-4)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={linkedClientLogoUrl}
                    alt=""
                    className="h-5 w-5 shrink-0 rounded-[4px] border border-[var(--border-2)] object-contain"
                  />
                  <span>
                    Using {linkedClientName?.trim() || "the linked client"}&rsquo;s logo from Portal.
                    Pick an image to override.
                  </span>
                </span>
              ) : (
                <span className="block text-xs text-[var(--text-4)]">
                  Shown in the lockup beside the Foundry mark. Leave blank to show the client name as text.
                </span>
              )}
            </label>
          ) : null}
        </div>

        <div className="rounded-[10px] border border-[var(--border-2)] bg-white px-4 py-4">
          <p className="app-eyebrow">Resolved copy</p>
          <p className="mt-2 text-sm leading-6 text-[var(--text-2)]">{confidentialityText}</p>
        </div>

        <p className="text-sm leading-6 text-[var(--text-3)]">
          Template-owned branding and confidentiality defaults still come from Settings, while
          proposal metadata is controlled here in the builder.
        </p>
        </div>
      </details>
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
