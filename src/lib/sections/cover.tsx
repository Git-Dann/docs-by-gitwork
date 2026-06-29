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
import type { CoverSectionData, DocumentType } from "@/types/proposal";

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
  // Cover opts out of the section shell — DocumentCover provides its own full-page layout.
  renderShell: false,
  Editor: ({ data, onChange, proposal, onProposalChange }) => (
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
  ),
  Preview: ({ data, proposal, section }) => {
    // Preview is a regular component rendered by the section dispatcher, so hook ordering is
    // stable within each render of this preview function.
    const brandingQuery = useWorkspaceBranding();
    const branding = brandingQuery.data;

    const signoff = proposal.sections.find((entry) => entry.key === "signoff_footer")?.data as
      | { preparedBy?: string; team?: string }
      | undefined;
    const intro = proposal.sections.find((entry) => entry.key === "introduction")?.data as
      | { statement?: string; summary?: string }
      | undefined;

    // Per-document override (cover builder) → workspace branding → bundled default.
    const brandLogoUrl =
      (data.brandLogoUrl ?? "").trim() ||
      (branding?.brandLogoUrl ?? "").trim() ||
      "/foundry-logo.png";
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
    const eyebrow = `FOUNDRY // ${docTypeLabel}`;

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
          title={titleLine}
          subtitle={coverSubtitle || undefined}
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
                  { count: formattedValue, label: "Value", color: "#1D4ED8" },
                ]
              : undefined
          }
          executiveSummary={summary || undefined}
          callout={confidentialityText ? { text: confidentialityText, tone: "neutral" } : undefined}
          dated={proposal.updatedAt.slice(0, 10)}
          logoUrl={brandLogoUrl}
          coBrand={
            data.brandLockup === "CLIENT_X_GITWORK" &&
            (resolvedClientLogo || (clientName && clientName !== "Client"))
              ? { clientName, clientLogoUrl: resolvedClientLogo || undefined }
              : undefined
          }
          variant="print"
          watermark={watermark}
          watermarkTone={watermarkTone}
        />
      </div>
    );
  },
});
