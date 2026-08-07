"use client";

import { useWorkspaceBranding } from "@/hooks/use-workspace-branding";
import { useClientList } from "@/hooks/use-proposals";
import { ImagePicker } from "@/components/ui/image-picker";
import { LogoQuickSwap } from "@/components/ui/logo-quick-swap";
import { CoverDetailStrip } from "@/components/proposals/cover-detail-strip";
import { Switch } from "@/components/ui/switch";
import {
  COVER_ELEMENTS,
  coverElementEmpty,
  coverElementVisible,
  type CoverDetailContext,
  type CoverElementContext,
} from "@/lib/sections/cover-elements";
import type { CoverElementId, CoverSectionData } from "@/types/proposal";

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
  contentsPreview,
  elementContext,
  detailValues,
  partiesEditor,
  productName,
  onProductNameChange,
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
  /** The block titles the contents list WOULD show — derived, passed in so the toggle can say
   *  how many and name the first few rather than being an unexplained switch. */
  contentsPreview?: { number: number; title: string }[];
  /** Everything the element resolvers need — gathered by `cover.tsx`, which can see the document. */
  elementContext: CoverElementContext;
  /** Live values for the detail-strip preview, so each row shows what it will actually print. */
  detailValues: CoverDetailContext;
  /** The Parties block's own editor, rendered inline here. The data stays in that block — this
   *  panel edits it in place, the same way the executive summary edits the Introduction. */
  partiesEditor?: React.ReactNode;
  /** The DOCUMENT's product/project name — the one the cover actually renders. */
  productName?: string;
  onProductNameChange?: (next: string) => void;
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

  /** Write an explicit on/off. Explicit always beats the default, so a choice sticks. */
  const setElement = (id: CoverElementId, on: boolean) =>
    onChange({ ...value, elements: { ...(value.elements ?? {}), [id]: on } });

  /**
   * The controls belonging to one element, shown under its own toggle.
   *
   * ⚠️ A function CALLED into the tree (`renderElementBody(id)`), never a component rendered as
   * `<ElementBody id={id} />`. Defining a component inside another component gives it a new
   * identity on every render, so React unmounts and remounts its subtree — which drops focus out
   * of a text field on the keystroke after the one you typed. Calling it just inlines the JSX.
   */
  const renderElementBody = (id: CoverElementId): React.ReactNode => {
    switch (id) {
      case "executiveSummary":
        return onExecutiveSummaryChange ? (
          <Body>
            <textarea
              value={executiveSummary ?? ""}
              onChange={(event) => onExecutiveSummaryChange(event.target.value)}
              rows={4}
              aria-label="Executive summary"
              placeholder="The lead paragraph shown on the cover…"
              className="app-input min-h-[96px] resize-y leading-6"
            />
            {executiveSummaryLinkedToIntro ? (
              <Hint>Shared with the Introduction block.</Hint>
            ) : null}
          </Body>
        ) : null;

      case "covers":
        // Stored as a string[] and split/joined raw, so a newline you just typed survives; the
        // cover trims and drops blanks at render.
        return (
          <Body>
            <textarea
              value={(value.covers ?? []).join("\n")}
              onChange={(event) => onChange({ ...value, covers: event.target.value.split("\n") })}
              rows={3}
              aria-label="Covers"
              placeholder={"One per line, e.g.\nThe Matchmaker UK platform\nShuffle Love (in formation)"}
              className="app-input min-h-[76px] resize-y leading-6"
            />
          </Body>
        );

      case "contents":
        return (
          <Body>
            <Hint>
              {contentsPreview?.length
                ? `${contentsPreview.length} blocks, follows the document.`
                : "No blocks to list yet."}
            </Hint>
          </Body>
        );

      case "parties":
        return partiesEditor ? <Body>{partiesEditor}</Body> : null;

      case "confidentiality":
        return (
          <Body>
            <select
              value={confidentialityMode}
              aria-label="Confidentiality"
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
            {confidentialityText ? <Hint>{confidentialityText}</Hint> : null}
          </Body>
        );

      // Stats have no controls of their own — the numbers come from the document.
      case "stats":
        return null;
    }
  };

  const clientLogoOverride = (value.clientLogoUrl ?? "").trim();
  const inheritsPortalLogo = !clientLogoOverride && Boolean(linkedClientLogoUrl);

  // Single-column throughout — this panel lives in the ~300px outline drill-in, so the old
  // md:grid-cols-2 rows cramped badly. Generous vertical rhythm, fields grouped under quiet labels.
  return (
    <div className="space-y-5">
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
            <p className="mt-1.5 text-[11px] leading-[1.45] text-[var(--text-4)]">
              Linked to{" "}
              <span className="font-medium text-[var(--text-2)]">
                {linkedClientName?.trim() || "a Portal client"}
              </span>
              .
            </p>
          )}
        </Field>
      ) : null}

      {/* Cover style control removed: there are only two document themes now (Gitwork / Foundry),
          chosen with the theme toggle in the editor header. The cover derives its look from that. */}

      {/* ── Document ────────────────────────────────────────────────────────────────────
          The things that are true of every cover, whatever else is switched on. `Prepared by` and
          `Date` live HERE even though they also appear as detail-strip rows: a strip row shows the
          document's value read-only, so without these there would be no way to change it. */}
      <div className="space-y-4">
        {/* ⚠️ Writes the DOCUMENT's `productName`, not the cover section's. There were two fields
            with this exact label — this one and Document details — and this one wrote
            `CoverSectionData.productName`, which nothing has ever rendered. You could type in it
            all day and the cover never changed. */}
        <Field label="Product / project name">
          <input
            value={productName ?? ""}
            onChange={(event) => onProductNameChange?.(event.target.value)}
            className="app-input"
          />
        </Field>
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
      </div>

      {/* ── On this cover ──────────────────────────────────────────────────────────────
          One row per optional element, replacing five different implicit rules. Every element
          states whether it is on, and separately whether it has anything to show — the old
          behaviour conflated those, so an author could not tell "off" from "unfilled". */}
      <div className="space-y-3">
        <span className="block font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-4)]">
          On this cover
        </span>
        <div className="space-y-1.5">
          {COVER_ELEMENTS.map((element) => {
            const on = coverElementVisible(element.id, value, elementContext);
            const empty = coverElementEmpty(element.id, value, elementContext);
            return (
              <div
                key={element.id}
                className="rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)]"
              >
                <div className="flex items-start gap-2.5 p-2">
                  <Switch checked={on} onChange={(next) => setElement(element.id, next)} label={element.label} />
                  {/* min-w-0 — a flex child's automatic minimum is its content, so without it the
                      blurb pushes the row wider than the ~300px rail. */}
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-[13px] font-medium text-[var(--text-2)]">{element.label}</span>
                      {element.ownedBy ? (
                        <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--text-4)]">
                          {element.ownedBy}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-[1.45] text-[var(--text-4)]">
                      {on && empty ? "Nothing to show yet." : element.blurb}
                    </span>
                  </span>
                </div>

                {/* The element's own controls, revealed where it lives rather than in a separate
                    list somewhere else in the panel. */}
                {on ? renderElementBody(element.id) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── The detail strip ───────────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <span className="block font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-4)]">
          Detail strip
        </span>
        <CoverDetailStrip
          rows={value.details}
          onChange={(details) => onChange({ ...value, details })}
          values={detailValues}
        />
        <p className="text-[11px] leading-[1.45] text-[var(--text-4)]">
          Along the bottom of the cover. Empty rows never print.
        </p>
      </div>

      <details className="app-subtle-panel overflow-hidden p-0">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-[var(--text-2)] [&::-webkit-details-marker]:hidden">
          <span>Branding &amp; logos</span>
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
            Optional
          </span>
        </summary>
        <div className="space-y-5 px-4 pb-5">
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

/** The controls under an element's toggle — inset so they read as belonging to it. */
function Body({ children }: { children: React.ReactNode }) {
  return <div className="space-y-1.5 border-t border-[var(--border-2)] px-2 py-2">{children}</div>;
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] leading-[1.45] text-[var(--text-4)]">{children}</p>;
}

/** A labelled field group — quiet label above its control(s), generous spacing for the narrow panel.
 *  A plain <div> (not <label>) since some groups hold non-text controls (style buttons, ImagePicker)
 *  where a wrapping label's control-association would be ambiguous. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-1 block text-[13px] font-medium text-[var(--text-2)]">{label}</span>
      {children}
    </div>
  );
}
