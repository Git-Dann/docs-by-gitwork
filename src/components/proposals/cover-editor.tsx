"use client";

import { useWorkspaceBranding } from "@/hooks/use-workspace-branding";
import { useClientList } from "@/hooks/use-proposals";
import { ImagePicker } from "@/components/ui/image-picker";
import { LogoQuickSwap } from "@/components/ui/logo-quick-swap";
import type { CoverSectionData } from "@/types/proposal";

export function CoverEditor({
  value,
  onChange,
  preparedBy,
  onPreparedByChange,
  executiveSummary,
  onExecutiveSummaryChange,
  executiveSummaryLinkedToIntro,
  linkedClientLogoUrl,
  linkedClientName,
  linkedClientId,
  onLinkClient,
}: {
  value: CoverSectionData;
  onChange: (value: CoverSectionData) => void;
  preparedBy: string;
  onPreparedByChange: (value: string) => void;
  /** The lead paragraph rendered on the cover (sourced from the Introduction statement or the
   *  document summary). Editable here so it isn't stranded as uneditable cover text. */
  executiveSummary?: string;
  onExecutiveSummaryChange?: (value: string) => void;
  /** True when edits flow to the Introduction section's statement (so we can say so). */
  executiveSummaryLinkedToIntro?: boolean;
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
  const confidentialityMode = value.confidentialityMode ?? "INTERNAL";
  const confidentialityText =
    (confidentialityMode === "EXTERNAL"
      ? branding?.defaultConfidentialityExternal
      : branding?.defaultConfidentialityInternal) ||
    value.confidentiality ||
    "";

  const clientLogoOverride = (value.clientLogoUrl ?? "").trim();
  const inheritsPortalLogo = !clientLogoOverride && Boolean(linkedClientLogoUrl);

  // Single-column throughout — this panel lives in the ~300px outline drill-in, so the old
  // md:grid-cols-2 rows cramped badly. Generous vertical rhythm, fields grouped under quiet labels.
  return (
    <div className="space-y-7">
      {/* Linked client — attribute the doc to a real Portal client (drives the cover lockup,
          {{client_name}}, and per-client grouping). Falls back to free text for a prospect. */}
      {onLinkClient ? (
        <Field label="Client">
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
          {!linkedClientId ? (
            /* Prospect name — writes the DOC-LEVEL clientName (via onLinkClient), which is what the
               breadcrumb, Document details, sharing and analytics read. It previously only wrote the
               cover's own override, so a prospect name typed at creation could never be corrected. */
            <input
              value={linkedClientName ?? ""}
              onChange={(event) => {
                onLinkClient(null, event.target.value);
                // Drop any stale cover-level override so there's a single source of truth.
                if (value.clientName) onChange({ ...value, clientName: "" });
              }}
              placeholder="Client or prospect name"
              className="app-input mt-2"
            />
          ) : (
            <p className="mt-2 text-xs leading-5 text-[var(--text-4)]">
              Linked to{" "}
              <span className="font-medium text-[var(--text-2)]">
                {linkedClientName?.trim() || "a Portal client"}
              </span>
              . The cover, sharing, and analytics now track this client.
            </p>
          )}
        </Field>
      ) : null}

      {/* Cover style control removed: there are only two document themes now (Gitwork / Foundry),
          chosen with the theme toggle in the editor header. The cover derives its look from that. */}

      {/* Document meta — stacked single column. */}
      <div className="space-y-4">
        {onExecutiveSummaryChange ? (
          <Field label="Executive summary">
            <textarea
              value={executiveSummary ?? ""}
              onChange={(event) => onExecutiveSummaryChange(event.target.value)}
              rows={4}
              placeholder="The lead paragraph shown on the cover…"
              className="app-input min-h-[96px] resize-y leading-6"
            />
            <span className="mt-1.5 block text-xs leading-5 text-[var(--text-4)]">
              Shown as the cover&rsquo;s lead paragraph.
              {executiveSummaryLinkedToIntro
                ? " Shared with the Introduction section."
                : null}
            </span>
          </Field>
        ) : null}
        <Field label="Prepared by">
          <input
            value={preparedBy}
            onChange={(event) => onPreparedByChange(event.target.value)}
            className="app-input"
          />
        </Field>
        <Field label="Date">
          <input
            value={value.date}
            onChange={(event) => onChange({ ...value, date: event.target.value })}
            type="date"
            className="app-input"
          />
        </Field>
        <Field label="Confidentiality">
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
          {confidentialityText ? (
            <p className="mt-2 text-xs leading-5 text-[var(--text-4)]">{confidentialityText}</p>
          ) : null}
        </Field>
      </div>

      <details className="app-subtle-panel overflow-hidden p-0">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-[var(--text-2)] [&::-webkit-details-marker]:hidden">
          <span>Branding &amp; logos</span>
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
            Optional
          </span>
        </summary>
        <div className="space-y-5 px-4 pb-5">
          <Field label="Product / project name">
            <input
              value={value.productName}
              onChange={(event) => onChange({ ...value, productName: event.target.value })}
              className="app-input"
            />
          </Field>

          <Field label="Cover lockup">
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
          </Field>

          {/* Cover logos — both editable here so you can swap the Foundry mark per-document and
              supply a client logo even for a prospect that isn't in Portal yet. */}
          <Field label="Brand logo">
            <LogoQuickSwap
              value={value.brandLogoUrl ?? ""}
              onChange={(brandLogoUrl) => onChange({ ...value, brandLogoUrl })}
            />
            <ImagePicker
              value={value.brandLogoUrl ?? ""}
              onChange={(brandLogoUrl) => onChange({ ...value, brandLogoUrl })}
            />
            <span className="mt-1.5 block text-xs leading-5 text-[var(--text-4)]">
              Overrides the cover&rsquo;s logo for this document. Leave blank to use the
              Settings → Branding logo.
            </span>
          </Field>

          {(value.brandLockup ?? "GITWORK") === "CLIENT_X_GITWORK" ? (
            <Field label="Client logo">
              <ImagePicker
                value={value.clientLogoUrl ?? ""}
                onChange={(clientLogoUrl) => onChange({ ...value, clientLogoUrl })}
              />
              {inheritsPortalLogo ? (
                <span className="mt-1.5 flex items-center gap-2 text-xs leading-5 text-[var(--text-4)]">
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
                <span className="mt-1.5 block text-xs leading-5 text-[var(--text-4)]">
                  Shown in the lockup beside the Foundry mark. Leave blank to show the client name as text.
                </span>
              )}
            </Field>
          ) : null}

          <p className="text-xs leading-5 text-[var(--text-4)]">
            Template-owned branding and confidentiality defaults still come from Settings, while
            document metadata is controlled here in the builder.
          </p>
        </div>
      </details>
    </div>
  );
}

/** A labelled field group — quiet label above its control(s), generous spacing for the narrow panel.
 *  A plain <div> (not <label>) since some groups hold non-text controls (style buttons, ImagePicker)
 *  where a wrapping label's control-association would be ambiguous. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">{label}</span>
      {children}
    </div>
  );
}
