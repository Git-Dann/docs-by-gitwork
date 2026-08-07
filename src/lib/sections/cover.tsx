/**
 * Section type: `cover` — the document's front page.
 *
 * The cover section is special: its preview is a full-page DocumentCover that doesn't fit
 * inside the standard section shell (numbered eyebrow + h2 title + body). It opts out via
 * `renderShell: false` so the dispatcher renders the cover at full bleed.
 */

import { BookOpenIcon } from "@heroicons/react/24/outline";
import { CoverEditor } from "@/components/proposals/cover-editor";
import { DocumentCover, DocumentVersionChip } from "@/components/document-cover";
import { useWorkspaceBranding } from "@/hooks/use-workspace-branding";
import { GITWORK, letterheadLines } from "@/lib/gitwork";
import { defineSection } from "@/lib/sections/types";
import type { SignatureBlockLike } from "@/lib/sections/parties-text";
import { coverPartiesFromSignatures, toCoverParties } from "@/lib/sections/parties-text";
import { coverContentsEntries } from "@/lib/sections/cover-contents";
import {
  coverElementVisible,
  resolveCoverDetails,
  type CoverDetailContext,
  type CoverElementContext,
} from "@/lib/sections/cover-elements";
import { approvalTrackApplies } from "@/lib/templates";
import { DEFAULT_DOC_THEME } from "@/types/proposal";
import type { CoverSectionData, DocumentType, PartyItem, ProposalSection } from "@/types/proposal";

// Cover eyebrow label per doc type (`FOUNDRY // {LABEL}`). Mono caps. Kept here (not imported
// from server/documents.ts) because that module pulls in Prisma and can't go client-side.
const DOC_TYPE_EYEBROW: Record<DocumentType, string> = {
  PROPOSAL: "PROPOSAL",
  SLA: "SLA",
  SOW: "SOW",
  MSA: "MSA",
  NDA: "NDA",
  CO: "CHANGE ORDER",
  DSA: "DSA",
  HANDOVER: "HANDOVER",
  REPORT: "STATUS REPORT",
  BRIEF: "BRIEF",
  DECK: "DECK",
  OTHER: "DOCUMENT",
};

const DEFAULT_COVER_DATA: CoverSectionData = {
  proposalTitle: "Untitled document",
  productName: "",
  clientName: "",
  subtitle: "v1.0",
  date: new Date().toISOString().slice(0, 10),
  confidentiality: "Confidential.",
  confidentialityMode: "INTERNAL",
  heroImage: "",
  brandLockup: "GITWORK",
};

function pickWatermark(status: string): string | undefined {
  switch (status) {
    case "DRAFT":
    case "PRODUCT_SIGN_OFF":
    case "TECH_SIGN_OFF":
    case "IN_REVIEW":
    case "APPROVED":
      return "DRAFT";
    case "SENT":
      return "OUT FOR SIGNATURE";
    case "ARCHIVED":
      return "ARCHIVED";
    default:
      return undefined;
  }
}

function statusLabelForCover(status: string): string {
  return status.replace(/_/g, " ");
}

export const coverSection = defineSection<CoverSectionData>({
  key: "cover",
  displayName: "Cover",
  description: "Front page and confidentiality metadata.",
  category: "structure",
  icon: BookOpenIcon,
  defaultData: DEFAULT_COVER_DATA,
  defaultTitle: "Cover",
  defaultDescription: "Front page and confidentiality metadata.",
  aiExpandable: false,
  inlineEditable: true,
  hasOptions: true,
  // Cover opts out of the section shell — DocumentCover provides its own full-page layout.
  renderShell: false,
  Editor: ({ data, onChange, proposal, onProposalChange }) => {
    // The cover's executive summary is sourced from the Introduction section's statement, then
    // the document-level summary (mirrors the Preview precedence below). It looked like static,
    // uneditable cover text because it has no inline handle and wasn't in this panel — surface it
    // here so it's editable from the cover. Edits write back to whichever source supplies it,
    // defaulting to the Introduction statement when that block exists, else the document summary.
    const introIndex = proposal.sections.findIndex((entry) => entry.key === "introduction");
    const introData =
      introIndex >= 0
        ? (proposal.sections[introIndex].data as { statement?: string } | undefined)
        : undefined;
    const summaryTarget: "intro" | "doc" = introData?.statement?.trim()
      ? "intro"
      : proposal.summary?.trim()
        ? "doc"
        : introData
          ? "intro"
          : "doc";
    const executiveSummary =
      summaryTarget === "intro" ? (introData?.statement ?? "") : (proposal.summary ?? "");
    const handleExecutiveSummaryChange = (next: string) => {
      if (summaryTarget === "intro" && introIndex >= 0) {
        const sections = proposal.sections.map((entry, index) =>
          index === introIndex
            ? {
                ...entry,
                data: {
                  ...(entry.data as unknown as Record<string, unknown>),
                  statement: next,
                } as unknown as ProposalSection["data"],
              }
            : entry,
        );
        onProposalChange({ ...proposal, sections });
      } else {
        onProposalChange({ ...proposal, summary: next });
      }
    };

    // The same inputs the Preview resolves, so the panel's toggles agree with the page. Parties
    // are read (not owned) here — exactly as the Preview reads them — because the data lives in
    // the `parties` block; see the Preview's note.
    const partiesForCtx = (
      proposal.sections.find((s) => s.key === "parties" && s.isVisible)?.data as
        | { parties?: PartyItem[] }
        | undefined
    )?.parties;
    const signaturesForCtx = (
      proposal.sections.find((s) => s.key === "signatures" && s.isVisible)?.data as
        | { blocks?: SignatureBlockLike[] }
        | undefined
    )?.blocks;
    const hasParties =
      toCoverParties(partiesForCtx ?? []).length > 0 ||
      coverPartiesFromSignatures(signaturesForCtx ?? []).length > 0;

    const elementContext: CoverElementContext = {
      documentType: proposal.documentType,
      sections: proposal.sections,
      executiveSummary,
      hasParties,
      confidentiality: data.confidentiality,
    };

    const detailValues: CoverDetailContext = {
      client: proposal.clientName ?? proposal.metadata.client ?? undefined,
      preparedBy: proposal.metadata.owner || undefined,
      date: data.date || undefined,
      version: proposal.version || undefined,
      status: statusLabelForCover(proposal.status),
      documentNumber: proposal.documentNumber ?? undefined,
    };

    return (
    <CoverEditor
      value={data}
      onChange={(next) => onChange(next as CoverSectionData)}
      preparedBy={proposal.metadata.owner}
      onPreparedByChange={(owner) =>
        onProposalChange({
          ...proposal,
          metadata: { ...proposal.metadata, owner },
        })
      }
      executiveSummary={executiveSummary}
      onExecutiveSummaryChange={handleExecutiveSummaryChange}
      executiveSummaryLinkedToIntro={summaryTarget === "intro"}
      contentsPreview={coverContentsEntries(proposal.sections)}
      productName={proposal.productName ?? ""}
      onProductNameChange={(productName) => onProposalChange({ ...proposal, productName })}
      elementContext={elementContext}
      detailValues={detailValues}
      linkedClientLogoUrl={proposal.linkedClientLogoUrl ?? undefined}
      // ⚠️ `||` not `??`, matching the cover's own resolution. `??` does not fall through an
      // EMPTY STRING, so a cleared name showed blank in the field while the cover fell through to
      // a stale one — the two disagreed about the same document.
      linkedClientName={proposal.clientName || proposal.metadata.client || ""}
      linkedClientId={proposal.clientId ?? null}
      onLinkClient={(clientId, clientName) =>
        onProposalChange({
          ...proposal,
          clientId,
          // The passed name ALWAYS becomes the doc-level clientName — linked (from the picker) or
          // unlinked (a prospect typed by hand). It used to be forced to "" when unlinked, which
          // made a prospect name set at creation permanently uneditable (a typo was stuck forever).
          clientName,
          // ⚠️ `clientName` verbatim, NOT `clientName || proposal.metadata.client`. That fallback
          // meant unlinking a client cleared the field but LEFT the old name in metadata — and the
          // cover's own resolution (`proposal.clientName || data.clientName || metadata.client`)
          // fell straight through the now-empty values onto it. So the editor showed an empty
          // client while the cover still printed the previous one, with no way to clear it.
          metadata: { ...proposal.metadata, client: clientName },
          // The cover section's own copy is a third place the same name can hide. Clear it too, or
          // it becomes the next stale fallback.
          sections: proposal.sections.map((entry) =>
            entry.key === "cover"
              ? {
                  ...entry,
                  data: {
                    ...(entry.data as unknown as Record<string, unknown>),
                    clientName: "",
                  } as unknown as ProposalSection["data"],
                }
              : entry,
          ),
        })
      }
    />
    );
  },
  Preview: ({ data, proposal, section, editable, onChange }) => {
    // There are TWO themes — Gitwork and Foundry — and nothing else. `coverStyle`
    // (light | minimal | bold) is stranded legacy: its control was removed in 43506dd6, so no UI
    // can change a stored value, yet older documents still carry one and it still steered the
    // render. That is how a contract lost its parties with no way for the author to fix it —
    // `minimal` zeroed the strip, and `bold` selected a different cover renderer that has no
    // parties strip at all.
    //
    // So the stored value is ignored outright rather than clamped case by case. The cover is the
    // statement cover, themed by `data-doc-theme`. Deleting the field is a data-losing schema
    // change, so it stays on the type and is simply not read.
    const coverStyle = "light" as const;
    // Preview is a regular component rendered by the section dispatcher, so hook ordering is
    // stable within each render of this preview function.
    const editing = Boolean(editable && onChange);
    const brandingQuery = useWorkspaceBranding();
    const branding = brandingQuery.data;

    const signoff = proposal.sections.find((entry) => entry.key === "signoff_footer")?.data as
      | { preparedBy?: string; team?: string }
      | undefined;
    const intro = proposal.sections.find((entry) => entry.key === "introduction")?.data as
      | { statement?: string; summary?: string }
      | undefined;

    // A white-label / demo workspace sets companyName to "" to de-brand the render (no default
    // wordmark, no letterhead footer). The live product leaves branding unset → Gitwork defaults.
    const deBranded = branding?.companyName === "";
    // Per-document override (cover builder) → workspace branding → bundled default.
    const brandLogoUrl =
      (data.brandLogoUrl ?? "").trim() ||
      (branding?.brandLogoUrl ?? "").trim() ||
      (deBranded ? "" : "/foundry-logo.svg");
    // Client lockup logo: per-document override → linked Portal client's logo → (none, show name).
    const resolvedClientLogo =
      (data.clientLogoUrl ?? "").trim() || (proposal.linkedClientLogoUrl ?? "").trim() || "";
    const mode = data.confidentialityMode ?? "INTERNAL";
    const confidentialityText =
      (mode === "EXTERNAL"
        ? branding?.defaultConfidentialityExternal
        : branding?.defaultConfidentialityInternal) ||
      data.confidentiality ||
      "";

    // Document-level `clientName` WINS over the cover section's own copy.
    //
    // It was the other way round, and that is why editing the client left the cover unchanged:
    // the crumb, the Details page and `applyClientNameToSections` all write the document-level
    // field, while the cover kept rendering a stale copy frozen into its section data when the
    // document was created. Two fields, one concept, and the one nothing writes was winning.
    // `data.clientName` stays as the fallback so a document that only ever had the section copy
    // still renders.
    const clientName =
      proposal.clientName || data.clientName || proposal.metadata.client || "Client";
    // "Prepared by" is edited on the cover itself (it writes proposal.metadata.owner), so the
    // cover preview must read it from there first — otherwise edits to the field never showed.
    // Fall back to the signoff footer's prepared-by / team only when owner is blank.
    const authorLine =
      proposal.metadata.owner?.trim() ||
      [signoff?.preparedBy, signoff?.team].filter(Boolean).join(" / ");
    const titleLine = data.proposalTitle || proposal.title || "Untitled document";

    // Suppress a subtitle that just restates the prepared-by line — a common data smell on
    // generated docs (e.g. subtitle "Prepared by Syed" shown above the "PREPARED BY: SYED" meta).
    const rawSubtitle = data.subtitle?.trim() ?? "";
    const subtitleEchoesAuthor =
      !!authorLine &&
      rawSubtitle.replace(/^prepared by\s*/i, "").trim().toLowerCase() ===
        authorLine.trim().toLowerCase();
    const coverSubtitle = subtitleEchoesAuthor ? "" : rawSubtitle;

    const docTypeLabel =
      DOC_TYPE_EYEBROW[proposal.documentType] ?? "DOCUMENT";
    // Statement cover: the accent eyebrow reads "CLIENT  /  DOC TYPE".
    const eyebrow = [
      clientName && clientName !== "Client" ? clientName : null,
      docTypeLabel,
    ]
      .filter(Boolean)
      .join("  /  ")
      .toUpperCase();

    // Prepared date — the cover's `date` override, else the doc's updated date. Pretty form
    // ("1 JULY 2026") for the classification stack + meta grid.
    const preparedIso = (data.date?.trim() || proposal.updatedAt).slice(0, 10);
    const preparedDate = new Date(preparedIso);
    const prettyPrepared = Number.isNaN(preparedDate.getTime())
      ? preparedIso
      : preparedDate
          .toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
          .toUpperCase();

    // Top-right classification stack (doc type · prepared · confidential).
    const classification = [
      docTypeLabel,
      `PREPARED ${prettyPrepared}`,
      confidentialityText ? "CONFIDENTIAL" : null,
    ].filter(Boolean) as string[];

    // Company footer (agency letterhead). From workspace branding when provided, else the Gitwork
    // default — so the live product is unchanged and a white-label / demo workspace can override or
    // blank it (empty arrays → the cover renders no footer strip).
    const companyFooter = branding?.companyFooter ?? {
      left: letterheadLines("/"),
      // Reference NDA footer copy — the positioning line, then the domain.
      right: [GITWORK.strapline.toUpperCase(), GITWORK.website.toUpperCase()],
    };

    const visibleSections = proposal.sections.filter((s) => s.isVisible).length;
    const phasesCount = proposal.timelinePhases.length;
    const touchpoints = proposal.sections.find((s) => s.key === "touchpoints")?.data as
      | { items?: Array<{ title?: string }> }
      | undefined;
    const touchpointsCount = touchpoints?.items?.length ?? 0;
    const grandTotal = proposal.costLineItems.reduce((sum, item) => sum + item.subtotal, 0);
    const currency =
      (proposal.sections.find((s) => s.key === "costing")?.data as { currency?: string } | undefined)
        ?.currency ?? "GBP";
    const formattedValue = grandTotal
      ? new Intl.NumberFormat("en-GB", {
          style: "currency",
          currency,
          maximumFractionDigits: 0,
        }).format(grandTotal)
      : "—";


    // Contract-style documents (NDA / MSA / SLA / DSA) carry a Parties block — surface it on the
    // cover, which then leads with who is bound instead of the meta grid / stat strip. No visible
    // parties section → undefined, so the meta grid renders exactly as it does today.
    const partiesData = proposal.sections.find((s) => s.key === "parties" && s.isVisible)?.data as
      | { parties?: PartyItem[] }
      | undefined;
    // One shared normaliser with the `parties` block's own prose render, so the cover columns and
    // the clause list can never disagree: label = the authored role (else the cover's auto
    // `PARTY A/B/C…`), lines = `details` with organisation/email as the back-compat fallback.
    // Fall back to the SIGNATURES block when the parties block is empty. A contract's
    // signatories are its parties, and older documents carry the names in only one of the two —
    // NDA-2026-002 has an empty `parties` block (it predates the current template) and its real
    // parties in `signatures`, so the cover found nothing and silently showed the meta grid.
    const signatureBlocks = (
      proposal.sections.find((s) => s.key === "signatures" && s.isVisible)?.data as
        | { blocks?: SignatureBlockLike[] }
        | undefined
    )?.blocks;
    const authoredParties = toCoverParties(partiesData?.parties ?? []);
    const coverParties = authoredParties.length
      ? authoredParties
      : coverPartiesFromSignatures(signatureBlocks ?? []);

    // The bordered `COVERS · … · …` scope strip. Authored on the cover (one entry per line in the
    // cover editor) — trimmed and emptied out here, so a blank or whitespace-only list passes
    // `undefined` and DocumentCover omits the strip entirely rather than drawing an empty frame.
    const coversStrip = (data.covers ?? [])
      .map((item) => (item ?? "").trim())
      .filter(Boolean);

    const summary =
      intro?.statement?.trim() ||
      proposal.summary?.trim() ||
      coverSubtitle ||
      "";

    // ── What is on this cover ───────────────────────────────────────────────────────────
    // One resolver for every optional element, replacing five different implicit rules. See
    // `cover-elements.ts`; the author's explicit choice always wins over the per-type default.
    const elementCtx: CoverElementContext = {
      documentType: proposal.documentType,
      sections: proposal.sections,
      executiveSummary: summary,
      hasParties: coverParties.length > 0,
      confidentiality: confidentialityText,
    };
    const showElement = (id: Parameters<typeof coverElementVisible>[0]) =>
      coverElementVisible(id, data, elementCtx);

    // The bottom detail strip, composed by the author. `data.details === undefined` means "never
    // edited" and resolves to the exact four rows the strip was hard-coded to, so an untouched
    // document — including one already sent to a client — is unchanged.
    const meta = resolveCoverDetails(data.details, {
      client: clientName && clientName !== "Client" ? clientName : undefined,
      preparedBy: authorLine,
      date: prettyPrepared,
      version: proposal.version || undefined,
      status: statusLabelForCover(proposal.status),
      documentNumber: proposal.documentNumber ?? undefined,
    });

    // Lightweight docs (handover, report, brief, blank) live in DRAFT until shared — they have no
    // review track, so the "DRAFT" watermark is misleading on a finished doc. Suppress it there;
    // keep the SENT / ARCHIVED watermarks for everyone.
    let watermark = pickWatermark(proposal.status);
    if (watermark === "DRAFT" && !approvalTrackApplies(proposal.documentType, proposal.metadata)) {
      watermark = undefined;
    }
    const watermarkTone: "neutral" | "warning" | "danger" =
      watermark === "OUT FOR SIGNATURE" ? "warning" : "neutral";

    const sectionId = `section-${section.id ?? section.key}`;

    return (
      <div id={sectionId} className="proposal-cover">
        <DocumentCover
          eyebrow={eyebrow}
          title={editing ? data.proposalTitle || "" : titleLine}
          subtitle={editing ? data.subtitle ?? "" : coverSubtitle || undefined}
          onTitleChange={editing ? (next) => onChange!({ ...data, proposalTitle: next }) : undefined}
          onSubtitleChange={editing ? (next) => onChange!({ ...data, subtitle: next }) : undefined}
          meta={meta.length ? meta : undefined}
          rightSlot={
            <DocumentVersionChip
              documentNumber={proposal.documentNumber ?? undefined}
              version={proposal.version || "v1.0"}
              status={statusLabelForCover(proposal.status)}
              tone="dark"
            />
          }
          coverStyle={coverStyle}
          heroImage={data.heroImage?.trim() || undefined}
          // The proposal-grade stat strip (Sections / Phases / Touchpoints / Value) only makes
          // sense for proposals — lightweight docs (handover, report, brief, blank) get a clean
          // cover with no zeroed-out metrics.
          stats={
            showElement("stats")
              ? [
                  { count: visibleSections, label: "Sections" },
                  { count: phasesCount, label: "Phases" },
                  { count: touchpointsCount, label: "Touchpoints" },
                  // The one dark tile — echoes the statement's "total" emphasis.
                  { count: formattedValue, label: "Value", bg: "#0C0C18", color: "#FFFFFF" },
                ]
              : undefined
          }
          executiveSummary={showElement("executiveSummary") ? summary || undefined : undefined}
          callout={
            showElement("confidentiality") && confidentialityText
              ? { text: confidentialityText, tone: "neutral" }
              : undefined
          }
          dated={prettyPrepared}
          classification={classification}
          covers={showElement("covers") && coversStrip.length ? coversStrip : undefined}
          // Derived from the LIVE document every render — never stored. Rename a block and the
          // contents entry follows it, with no save and nothing to keep in sync.
          contents={showElement("contents") ? coverContentsEntries(proposal.sections) : undefined}
          productName={proposal.productName ?? undefined}
          companyFooter={companyFooter}
          parties={showElement("parties") && coverParties.length ? coverParties : undefined}
          logoUrl={brandLogoUrl}
          boldPalette="navy"
          coBrand={
            data.brandLockup === "CLIENT_X_GITWORK" &&
            (resolvedClientLogo || (clientName && clientName !== "Client"))
              ? { clientName, clientLogoUrl: resolvedClientLogo || undefined }
              : undefined
          }
          variant="print"
          docTheme={proposal.metadata.docTheme ?? DEFAULT_DOC_THEME}
          watermark={watermark}
          watermarkTone={watermarkTone}
        />
      </div>
    );
  },
});
