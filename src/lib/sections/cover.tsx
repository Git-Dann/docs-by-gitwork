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
import { defineSection } from "@/lib/sections/types";
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
      linkedClientLogoUrl={proposal.linkedClientLogoUrl ?? undefined}
      linkedClientName={proposal.clientName ?? proposal.metadata.client ?? undefined}
      linkedClientId={proposal.clientId ?? null}
      onLinkClient={(clientId, clientName) =>
        onProposalChange({
          ...proposal,
          clientId,
          // Linking sets the doc-level name; unlinking clears it so the cover override / free
          // text takes over. metadata.client mirrors it for legacy merge-variable resolution.
          clientName: clientId ? clientName : "",
          metadata: { ...proposal.metadata, client: clientId ? clientName : proposal.metadata.client },
        })
      }
    />
    );
  },
  Preview: ({ data, proposal, section, editable, onChange }) => {
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

    const clientName =
      data.clientName || proposal.clientName || proposal.metadata.client || "Client";
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
      left: [
        "GITWORK GROUP LTD  /  COMPANY NO. 15756347  /  VAT REG. 468314867",
        "3RD FLOOR, ANCHORAGE ONE, ANCHORAGE QUAY, SALFORD QUAYS, M50 3YJ",
      ],
      // Reference NDA footer copy — the positioning line, then the domain.
      right: ["GLOBAL BUILD CAPACITY. UK QUALITY CONTROL.", "GITWORK.CO.UK"],
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

    const meta: Array<{ label: string; value: string }> = [];
    if (clientName && clientName !== "Client") meta.push({ label: "Client", value: clientName });
    if (authorLine) meta.push({ label: "Prepared by", value: authorLine });
    meta.push({ label: "Date", value: prettyPrepared });
    if (proposal.version) meta.push({ label: "Version", value: proposal.version });

    // Contract-style documents (NDA / MSA / SLA / DSA) carry a Parties block — surface it on the
    // cover, which then leads with who is bound instead of the meta grid / stat strip. No visible
    // parties section → undefined, so the meta grid renders exactly as it does today.
    const partiesData = proposal.sections.find((s) => s.key === "parties" && s.isVisible)?.data as
      | { parties?: PartyItem[] }
      | undefined;
    const coverParties = (partiesData?.parties ?? [])
      .map((party) => ({
        label: undefined,
        name: (party.name || party.organization || "").trim(),
        lines: [
          party.organization && party.organization !== party.name ? party.organization : null,
          party.role,
          party.email,
        ]
          .map((line) => (line ?? "").trim())
          .filter(Boolean),
      }))
      .filter((party) => party.name || party.lines.length);

    const summary =
      intro?.statement?.trim() ||
      proposal.summary?.trim() ||
      coverSubtitle ||
      "";

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
              tone={(data.coverStyle ?? "light") === "bold" ? "light" : "dark"}
            />
          }
          coverStyle={data.coverStyle ?? "light"}
          heroImage={data.heroImage?.trim() || undefined}
          // The proposal-grade stat strip (Sections / Phases / Touchpoints / Value) only makes
          // sense for proposals — lightweight docs (handover, report, brief, blank) get a clean
          // cover with no zeroed-out metrics.
          stats={
            proposal.documentType === "PROPOSAL"
              ? [
                  { count: visibleSections, label: "Sections" },
                  { count: phasesCount, label: "Phases" },
                  { count: touchpointsCount, label: "Touchpoints" },
                  // The one dark tile — echoes the statement's "total" emphasis.
                  { count: formattedValue, label: "Value", bg: "#0C0C18", color: "#FFFFFF" },
                ]
              : undefined
          }
          executiveSummary={summary || undefined}
          callout={confidentialityText ? { text: confidentialityText, tone: "neutral" } : undefined}
          dated={prettyPrepared}
          classification={classification}
          companyFooter={companyFooter}
          parties={coverParties.length ? coverParties : undefined}
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
