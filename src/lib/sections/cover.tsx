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
import type { CoverSectionData } from "@/types/proposal";

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

    const brandLogoUrl = (branding?.brandLogoUrl ?? "").trim() || "/foundry-logo.png";
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

    const docTypeLabel =
      proposal.documentType === "SLA"
        ? "SLA"
        : proposal.documentType === "SOW"
          ? "SOW"
          : proposal.documentType === "MSA"
            ? "MSA"
            : proposal.documentType === "NDA"
              ? "NDA"
              : proposal.documentType === "CO"
                ? "CHANGE ORDER"
                : proposal.documentType === "OTHER"
                  ? "DOCUMENT"
                  : "PROPOSAL";
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
      data.subtitle?.trim() ||
      "";

    const watermark = pickWatermark(proposal.status);
    const watermarkTone: "neutral" | "warning" | "danger" =
      watermark === "OUT FOR SIGNATURE" ? "warning" : "neutral";

    const sectionId = `section-${section.id ?? section.key}`;

    return (
      <div id={sectionId} className="proposal-cover">
        <DocumentCover
          eyebrow={eyebrow}
          title={titleLine}
          subtitle={data.subtitle?.trim() || undefined}
          meta={meta.length ? meta : undefined}
          rightSlot={
            <DocumentVersionChip
              documentNumber={proposal.documentNumber ?? undefined}
              version={proposal.version || "v1.0"}
              status={statusLabelForCover(proposal.status)}
            />
          }
          stats={[
            { count: visibleSections, label: "Sections" },
            { count: phasesCount, label: "Phases" },
            { count: touchpointsCount, label: "Touchpoints" },
            { count: formattedValue, label: "Value", color: "#1D4ED8" },
          ]}
          executiveSummary={summary || undefined}
          callout={confidentialityText ? { text: confidentialityText, tone: "neutral" } : undefined}
          dated={proposal.updatedAt.slice(0, 10)}
          logoUrl={brandLogoUrl}
          coBrand={
            data.brandLockup === "CLIENT_X_GITWORK" && clientName && clientName !== "Client"
              ? { clientName }
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
