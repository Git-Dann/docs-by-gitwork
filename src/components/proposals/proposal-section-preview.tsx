"use client";

import { DocumentCover, DocumentVersionChip } from "@/components/document-cover";
import { getObjectiveIcon } from "@/components/proposals/icon-select";
import { buttonStyles } from "@/components/ui/button-styles";
import { formatCurrency } from "@/lib/format";
import { resolveConfidentialityText, useLocalSettings } from "@/lib/local-settings";
import type { CostingSectionData, ProposalDocument, ProposalSection } from "@/types/proposal";

function Graphic({
  title,
  url,
  caption,
  altText,
}: {
  title: string;
  url: string;
  caption?: string;
  altText: string;
}) {
  return (
    <figure className="proposal-block-avoid overflow-hidden rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={altText} className="h-56 w-full object-cover" />
      <figcaption className="space-y-1 p-4">
        <p className="text-sm font-semibold text-[var(--text-2)]">{title}</p>
        {caption ? <p className="text-sm leading-6 text-[var(--text-3)]">{caption}</p> : null}
      </figcaption>
    </figure>
  );
}

export function ProposalSectionPreview({
  section,
  proposal,
  index,
}: {
  section: ProposalSection;
  proposal: ProposalDocument;
  index: number;
}) {
  const sectionId = `section-${section.id ?? section.key}`;
  const sectionNumber = String(index + 1).padStart(2, "0");

  if (!section.isVisible) {
    return null;
  }

  if (section.key === "cover") {
    return <CoverPagePreview section={section} proposal={proposal} sectionId={sectionId} />;
  }

  const sectionAssets = proposal.assets.filter((asset) => asset.placement === section.key);

  return (
    <section
      id={sectionId}
      className="proposal-block-avoid space-y-6 border-b border-[var(--border-2)] pb-10 last:border-0 last:pb-0 print:pb-8"
    >
      <header className="max-w-3xl space-y-3">
        <p className="app-eyebrow">Section {sectionNumber}</p>
        <h2 className="text-[32px] font-semibold tracking-[-0.04em] text-[var(--text-1)] sm:text-[36px]">
          {section.title}
        </h2>
        {section.description ? (
          <p className="max-w-2xl text-sm leading-7 text-[var(--text-3)]">{section.description}</p>
        ) : null}
      </header>

      <SectionBody section={section} proposal={proposal} />

      {sectionAssets.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {sectionAssets.map((asset) => (
            <Graphic
              key={asset.id ?? `${asset.title}-${asset.url}`}
              title={asset.title}
              url={asset.url}
              caption={asset.caption}
              altText={asset.altText}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function SectionBody({
  section,
  proposal,
}: {
  section: ProposalSection;
  proposal: ProposalDocument;
}) {
  switch (section.key) {
    case "cover": {
      const data = section.data as {
        proposalTitle: string;
        productName: string;
        clientName: string;
        subtitle: string;
        date: string;
        confidentiality: string;
        heroImage?: string;
      };

      return (
        <div className="space-y-4">
          {data.heroImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.heroImage} alt={data.proposalTitle} className="h-48 w-full rounded-lg object-cover" />
          ) : null}

          <div className="space-y-1">
            <p className="text-xs font-semibold tracking-[0.12em] text-[var(--text-3)] uppercase">Proposal</p>
            <h3 className="text-2xl font-semibold tracking-tight">{data.proposalTitle}</h3>
            <p className="text-sm text-[var(--text-2)]">
              {data.productName || proposal.productName} by Gitwork
            </p>
            <p className="text-sm text-[var(--text-2)]">Client: {data.clientName || proposal.clientName}</p>
            <p className="text-sm text-[var(--text-3)]">{data.subtitle}</p>
            <p className="text-sm text-[var(--text-3)]">Date: {data.date}</p>
          </div>

          <div className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2 text-xs text-[var(--text-3)]">
            {data.confidentiality}
          </div>
        </div>
      );
    }

    case "introduction": {
      const data = section.data as {
        statement: string;
        summary: string;
        graphic?: string;
      };

      return (
        <div className="max-w-4xl space-y-5">
          {data.statement ? (
            <p className="text-[22px] leading-[1.7] tracking-[-0.02em] text-[var(--text-1)]">
              {data.statement}
            </p>
          ) : null}
          {data.summary ? (
            <p className="max-w-3xl text-[16px] leading-8 text-[var(--text-2)]">{data.summary}</p>
          ) : null}
        </div>
      );
    }

    case "product_overview": {
      const data = section.data as {
        platformDescription: string;
        audience: string;
        valueProposition: string;
        platformsSupported: string;
        workflowGraphic?: string;
      };

      return (
        <div className="grid gap-4 md:grid-cols-2">
          <InfoCard title="Platform" content={data.platformDescription} />
          <InfoCard title="Audience" content={data.audience} />
          <InfoCard title="Value" content={data.valueProposition} />
          <InfoCard title="Supported Platforms" content={data.platformsSupported} />
        </div>
      );
    }

    case "objectives": {
      const data = section.data as {
        items: Array<{ id: string; title: string; description: string; icon?: string }>;
      };

      return (
        <div className="grid gap-4 md:grid-cols-2">
          {data.items.map((item) => (
            <article
              key={item.id}
              className="proposal-block-avoid rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] p-5"
            >
              <div className="flex items-start gap-4">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-[10px] bg-[var(--surface-brand)] text-[var(--brand-700)]">
                  {(() => {
                    const Icon = getObjectiveIcon(item.icon);
                    return <Icon className="h-5 w-5" />;
                  })()}
                </span>
                <div className="min-w-0">
                  <p className="text-base font-semibold text-[var(--text-1)]">{item.title}</p>
                  <p className="mt-2 text-sm leading-7 text-[var(--text-2)]">{item.description}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      );
    }

    case "touchpoints": {
      const data = section.data as {
        items: Array<{
          id: string;
          title: string;
          summary: string;
          features: string[];
          notes?: string;
          callout?: string;
        }>;
      };

      return (
        <div className="space-y-4">
          {data.items.map((touchpoint) => (
            <article
              key={touchpoint.id}
              className="proposal-block-avoid rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] p-5"
            >
              <h3 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--text-1)]">
                {touchpoint.title}
              </h3>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--text-2)]">{touchpoint.summary}</p>
              {touchpoint.features.length ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {touchpoint.features.map((feature) => (
                    <span
                      key={feature}
                      className="rounded-full border border-[var(--border-2)] bg-white px-3 py-1 text-xs font-medium text-[var(--text-2)]"
                    >
                      {feature}
                    </span>
                  ))}
                </div>
              ) : null}
              {touchpoint.notes ? (
                <p className="mt-4 text-xs uppercase tracking-[0.12em] text-[var(--text-4)]">
                  Notes: <span className="normal-case tracking-normal text-[var(--text-3)]">{touchpoint.notes}</span>
                </p>
              ) : null}
              {touchpoint.callout ? (
                <p className="mt-4 rounded-[10px] bg-[var(--surface-brand)] px-4 py-3 text-sm leading-6 text-[var(--brand-700)]">
                  {touchpoint.callout}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      );
    }

    case "timeline": {
      const data = section.data as { viewMode: "LIST" | "MILESTONE" };
      const phases = [...proposal.timelinePhases].sort((a, b) => a.sortOrder - b.sortOrder);

      if (data.viewMode === "MILESTONE") {
        return (
          <div className="space-y-4 border-l-2 border-[var(--border-2)] pl-5">
            {phases.map((phase) => (
              <div
                key={phase.id ?? phase.name}
                className="proposal-block-avoid relative rounded-[10px] border border-[var(--border-2)] p-4"
              >
                <span className="absolute -left-[1.35rem] top-3 h-2.5 w-2.5 rounded-full bg-[var(--brand-500)]" />
                <p className="text-base font-semibold text-[var(--text-1)]">{phase.name}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.12em] text-[var(--text-4)]">{phase.duration}</p>
                <p className="mt-3 text-sm leading-7 text-[var(--text-2)]">{phase.summary}</p>
                <p className="mt-3 text-xs text-[var(--text-3)]">
                  Deliverables: {phase.deliverables.join(", ")}
                </p>
              </div>
            ))}
          </div>
        );
      }

      return (
        <div className="space-y-3">
          {phases.map((phase) => (
            <article
              key={phase.id ?? phase.name}
              className="proposal-block-avoid rounded-[10px] border border-[var(--border-2)] p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-base font-semibold text-[var(--text-1)]">{phase.name}</p>
                <p className="text-xs uppercase tracking-[0.12em] text-[var(--text-4)]">{phase.duration}</p>
              </div>
              <p className="mt-3 text-sm leading-7 text-[var(--text-2)]">{phase.summary}</p>
              <p className="mt-3 text-xs text-[var(--text-3)]">
                Deliverables: {phase.deliverables.join(", ")}
              </p>
            </article>
          ))}
        </div>
      );
    }

    case "costing": {
      const data = section.data as CostingSectionData;
      const items = [...proposal.costLineItems].sort((a, b) => a.sortOrder - b.sortOrder);
      const timelinePhases = [...proposal.timelinePhases].sort((a, b) => a.sortOrder - b.sortOrder);
      const timelinePhaseById = timelinePhases.reduce<Record<string, (typeof timelinePhases)[number]>>(
        (result, phase) => {
          if (phase.id) {
            result[phase.id] = phase;
          }
          return result;
        },
        {},
      );
      const subtotal = items.reduce((total, item) => total + item.subtotal, 0);
      const discountPercent = data.discount || 0;
      const discountAmount = subtotal * (discountPercent / 100);
      const discounted = Math.max(subtotal - discountAmount, 0);
      const taxValue = discounted * ((data.taxRate || 0) / 100);
      const paymentSchedule = data.paymentSchedule ?? [];
      const additionalNotes = data.additionalNotes ?? [];
      const total = discounted + taxValue;

      return (
        <div className="space-y-8">
          <div className="space-y-4">
            <h3 className="text-[26px] font-semibold tracking-[-0.03em] text-[var(--text-1)]">
              Budget breakdown
            </h3>
            <div className="app-table-shell overflow-x-auto">
              <table className="app-table min-w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left">Assignment</th>
                    <th className="text-left">Delivery focus</th>
                    <th className="text-right">Duration</th>
                    <th className="text-right">Monthly rate</th>
                    <th className="text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id ?? `${item.category}-${item.itemName}`}>
                      <td className="text-[var(--text-2)]">{item.category || "-"}</td>
                      <td>
                        <div className="flex flex-wrap gap-1.5">
                          {parseTechStackValue(item.description).length ? (
                            parseTechStackValue(item.description).map((entry) => (
                              <span
                                key={entry}
                                className="rounded-full border border-[var(--border-2)] bg-[var(--surface-1)] px-2 py-0.5 text-xs font-medium text-[var(--text-2)]"
                              >
                                {entry}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-[var(--text-3)]">No stack selected</span>
                          )}
                        </div>
                      </td>
                      <td className="text-right text-[var(--text-2)]">{item.quantity}</td>
                      <td className="text-right text-[var(--text-2)]">
                        {formatCurrency(item.unitCost, data.currency)}
                      </td>
                      <td className="text-right text-[var(--text-1)]">
                        {formatCurrency(item.subtotal, data.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="proposal-block-avoid ml-auto max-w-xs space-y-1 rounded-[10px] border border-[var(--border-2)] bg-white p-4 text-sm shadow-[var(--shadow-xs)]">
              <Row label="Subtotal" value={formatCurrency(subtotal, data.currency)} />
              <Row
                label={`Discount (${discountPercent}%)`}
                value={`-${formatCurrency(discountAmount, data.currency)}`}
              />
              <Row label={`VAT (${data.taxRate || 0}%)`} value={formatCurrency(taxValue, data.currency)} />
              <Row label="Grand total" value={formatCurrency(total, data.currency)} bold />
            </div>
          </div>

          {(data.paymentScheduleIntro ||
            data.paymentTerms ||
            data.vatNotice ||
            data.ipTransferNotice ||
            paymentSchedule.length) ? (
            <div className="space-y-4">
              <h3 className="text-[26px] font-semibold tracking-[-0.03em] text-[var(--text-1)]">
                Payment schedule
              </h3>
              <div className="max-w-4xl space-y-4 text-[16px] leading-8 text-[var(--text-2)]">
                {data.paymentScheduleIntro ? (
                  <p className="font-medium text-[var(--text-1)]">{data.paymentScheduleIntro}</p>
                ) : null}
                <div className="grid gap-3 md:grid-cols-3">
                  {data.paymentTerms ? <InfoCard title="Payment terms" content={data.paymentTerms} /> : null}
                  {data.vatNotice ? <InfoCard title="VAT note" content={data.vatNotice} /> : null}
                  {data.ipTransferNotice ? <InfoCard title="IP transfer" content={data.ipTransferNotice} /> : null}
                </div>
              </div>

              {paymentSchedule.length ? (
                <div className="grid gap-3">
                  {paymentSchedule.map((row, index) => (
                    <article
                      key={row.id}
                      className="proposal-block-avoid rounded-[10px] border border-[var(--border-2)] bg-white p-4"
                    >
                      {row.timelinePhaseId && timelinePhaseById[row.timelinePhaseId] ? (
                        <p className="mb-3 inline-flex rounded-full border border-[var(--border-2)] bg-[var(--surface-1)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-4)]">
                          Linked to {timelinePhaseById[row.timelinePhaseId]?.name}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]">
                            Milestone {index + 1}
                          </p>
                          <p className="mt-1 text-base font-semibold text-[var(--text-1)]">
                            {row.action || "Milestone"}
                          </p>
                          {row.periodCovered ? (
                            <p className="mt-1 text-sm text-[var(--text-3)]">{row.periodCovered}</p>
                          ) : null}
                        </div>
                        <p className="text-sm font-semibold text-[var(--text-1)]">
                          {formatMilestoneAmount(row.amount, data.currency, data.taxRate)}
                        </p>
                      </div>
                      {row.includedWork ? (
                        <p className="mt-3 text-sm leading-7 text-[var(--text-2)]">{row.includedWork}</p>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {additionalNotes.length ? (
            <div className="space-y-4">
              <h3 className="text-[26px] font-semibold tracking-[-0.03em] text-[var(--text-1)]">
                Commercial notes
              </h3>
              <ul className="space-y-3">
                {additionalNotes.map((item, index) => (
                  <li
                    key={`${item}-${index}`}
                    className="rounded-[10px] border border-[var(--border-2)] bg-white px-4 py-3 text-[16px] leading-8 text-[var(--text-2)]"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      );
    }

    case "cta_next_steps": {
      const data = section.data as { headline: string; body: string };
      const primary = proposal.ctas.find((cta) => cta.role === "PRIMARY");
      const secondary = proposal.ctas.find((cta) => cta.role === "SECONDARY");

      return (
        <div className="proposal-block-avoid rounded-[10px] border border-[var(--border-2)] bg-[linear-gradient(180deg,#ffffff_0%,var(--surface-brand-soft)_100%)] p-6">
          <p className="app-eyebrow">Next Step</p>
          <p className="mt-3 text-[26px] font-semibold tracking-[-0.03em] text-[var(--text-1)]">
            {data.headline}
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--text-2)]">{data.body}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {primary ? (
              <a
                href={primary.destination}
                className={buttonStyles({ variant: "primary", size: "md" })}
              >
                {primary.label}
              </a>
            ) : null}
            {secondary ? (
              <a
                href={secondary.destination}
                className={buttonStyles({ variant: "secondary", size: "md" })}
              >
                {secondary.label}
              </a>
            ) : null}
          </div>
        </div>
      );
    }

    case "supporting_links_assets": {
      const data = section.data as { notes: string };

      return (
        <div className="space-y-4">
          {data.notes ? <p className="max-w-4xl text-sm leading-7 text-[var(--text-2)]">{data.notes}</p> : null}
          <ul className="space-y-2">
            {proposal.links.map((link) => (
              <li
                key={link.id ?? link.url}
                className="proposal-block-avoid rounded-[10px] border border-[var(--border-2)] p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-[var(--text-1)]">{link.label}</p>
                  <span className="rounded-full border border-[var(--border-2)] bg-[var(--surface-1)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-4)]">
                    {formatLinkTypeLabel(link.type)}
                  </span>
                </div>
                <a
                  href={link.url}
                  className="mt-2 inline-flex text-sm leading-6 text-[var(--brand-700)] underline-offset-2 hover:underline"
                >
                  {link.url}
                </a>
                {link.notes ? <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">{link.notes}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      );
    }

    case "assumptions":
    case "out_of_scope": {
      const data = section.data as { items: string[] };

      return (
        <ul className="list-disc space-y-2 pl-6 text-[16px] leading-8 text-[var(--text-2)] marker:text-[var(--brand-600)]">
          {data.items.map((item, index) => (
            <li key={`${item}-${index}`}>{item}</li>
          ))}
        </ul>
      );
    }

    case "signoff_footer": {
      const data = section.data as {
        preparedBy: string;
        team: string;
        contactDetails: string;
        footerNote: string;
        showBrandingBlock: boolean;
        signatureName?: string;
        signatureDate?: string;
      };

      return (
        <div className="proposal-block-avoid grid gap-4 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-5 md:grid-cols-[minmax(0,1fr)_220px]">
          <div className="space-y-3 text-sm leading-7 text-[var(--text-2)]">
            <p>
              Prepared by: <span className="font-medium text-[var(--text-1)]">{data.preparedBy}</span>
            </p>
            <p>Team: {data.team}</p>
            <p>Contact: {data.contactDetails}</p>
            {data.footerNote ? <p className="text-sm leading-7 text-[var(--text-3)]">{data.footerNote}</p> : null}
          </div>
          <div className="space-y-3">
            <div className="space-y-3 rounded-[10px] border border-[var(--border-2)] bg-white p-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]">
                  Signature
                </p>
                <p className="mt-2 text-sm font-medium text-[var(--text-1)]">
                  {data.signatureName?.trim() || "Add signature name"}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]">
                  Date
                </p>
                <p className="mt-2 text-sm font-medium text-[var(--text-1)]">
                  {data.signatureDate?.trim() || "Add signature date"}
                </p>
              </div>
            </div>
            {data.showBrandingBlock ? (
              <div className="rounded-[10px] bg-[var(--surface-brand)] px-4 py-3 text-xs font-medium uppercase tracking-[0.12em] text-[var(--brand-700)]">
                Docs by Gitwork
              </div>
            ) : null}
          </div>
        </div>
      );
    }

    // ── SLA / contract previews (Sprint 3) ──────────────────────────────────────────────
    case "parties": {
      const data = section.data as import("@/types/proposal").PartiesSectionData;
      return <PartiesPreview data={data} />;
    }

    case "service_tiers": {
      const data = section.data as import("@/types/proposal").ServiceTiersSectionData;
      return <ServiceTiersPreview data={data} />;
    }

    case "response_times": {
      const data = section.data as import("@/types/proposal").ResponseTimesSectionData;
      return <ResponseTimesPreview data={data} />;
    }

    case "escalation": {
      const data = section.data as import("@/types/proposal").EscalationSectionData;
      return <EscalationPreview data={data} />;
    }

    case "exclusions": {
      const data = section.data as import("@/types/proposal").ExclusionsSectionData;
      return <ExclusionsPreview data={data} />;
    }

    case "penalties": {
      const data = section.data as import("@/types/proposal").PenaltiesSectionData;
      return <PenaltiesPreview data={data} />;
    }

    case "term": {
      const data = section.data as import("@/types/proposal").TermSectionData;
      return <TermPreview data={data} />;
    }

    case "signatures": {
      const data = section.data as import("@/types/proposal").SignaturesSectionData;
      return <SignaturesPreview data={data} />;
    }

    default:
      return <p className="text-sm text-[var(--text-2)]">Unsupported section type.</p>;
  }
}

function CoverPagePreview({
  section,
  proposal,
  sectionId,
}: {
  section: ProposalSection;
  proposal: ProposalDocument;
  sectionId: string;
}) {
  const data = section.data as {
    proposalTitle: string;
    productName: string;
    clientName: string;
    subtitle: string;
    date: string;
    confidentiality: string;
    confidentialityMode?: "INTERNAL" | "EXTERNAL";
    brandLockup?: "GITWORK" | "CLIENT_X_GITWORK";
  };
  const { settings } = useLocalSettings();
  const signoff = proposal.sections.find((entry) => entry.key === "signoff_footer")?.data as
    | {
        preparedBy?: string;
        team?: string;
      }
    | undefined;
  const intro = proposal.sections.find((entry) => entry.key === "introduction")?.data as
    | { statement?: string; summary?: string }
    | undefined;

  const brandLogoUrl = settings.templateBranding.coverBrandLogoUrl.trim() || "/foundry-logo.png";
  const confidentialityText = resolveConfidentialityText(
    data.confidentialityMode ?? "INTERNAL",
    settings,
    data.confidentiality,
  );

  // ── Map proposal fields onto the unified DocumentCover API ──────────────────────────────
  const clientName = data.clientName || proposal.clientName || proposal.metadata.client || "Client";
  const authorLine = [signoff?.preparedBy, signoff?.team].filter(Boolean).join(" / ");
  const titleLine = data.proposalTitle || proposal.title || "Untitled document";

  // The right-slot becomes a "version chip" — document number, big version figure, status.
  const docTypeLabel = proposal.documentType === "SLA" ? "SLA" : proposal.documentType === "OTHER" ? "DOCUMENT" : "PROPOSAL";
  const eyebrow = `FOUNDRY // ${docTypeLabel}`;

  // The 4-up stat strip surfaces the document's shape: sections / phases / touchpoints / value.
  const visibleSections = proposal.sections.filter((s) => s.isVisible).length;
  const phasesCount = proposal.timelinePhases.length;
  const touchpoints = proposal.sections.find((s) => s.key === "touchpoints")?.data as
    | { items?: Array<{ title?: string }> }
    | undefined;
  const touchpointsCount = touchpoints?.items?.length ?? 0;
  const grandTotal = proposal.costLineItems.reduce((sum, item) => sum + item.subtotal, 0);
  const currency = (proposal.sections.find((s) => s.key === "costing")?.data as { currency?: string } | undefined)?.currency ?? "GBP";
  const formattedValue = grandTotal
    ? new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(grandTotal)
    : "—";

  const meta: Array<{ label: string; value: string }> = [];
  if (clientName && clientName !== "Client") meta.push({ label: "Client", value: clientName });
  if (authorLine) meta.push({ label: "Prepared by", value: authorLine });

  // Executive summary is whatever the introduction section already says — falling back to the
  // proposal summary if introduction hasn't been filled in yet.
  const summary = intro?.statement?.trim() || proposal.summary?.trim() || data.subtitle?.trim() || "";

  // ── Watermark: derived from the document's lifecycle state. ─────────────────────────
  // The Sprint 4 e-sig flow drives this: documents that haven't yet been sent for signature
  // carry "DRAFT", those out for signature carry "OUT FOR SIGNATURE", declined requests get
  // "DECLINED". COMPLETED removes the watermark entirely (the doc is now binding).
  const watermark = pickWatermark(proposal.status);
  const watermarkTone: "neutral" | "warning" | "danger" =
    watermark === "DECLINED"
      ? "danger"
      : watermark === "OUT FOR SIGNATURE"
        ? "warning"
        : "neutral";

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
        callout={
          confidentialityText
            ? { text: confidentialityText, tone: "neutral" }
            : undefined
        }
        dated={proposal.updatedAt.slice(0, 10)}
        logoUrl={brandLogoUrl}
        variant="print"
        watermark={watermark}
        watermarkTone={watermarkTone}
      />
    </div>
  );
}

/**
 * Pick the watermark text for a document based on its current status. Returns undefined when no
 * watermark should be shown (i.e. the document is signed / sent / archived).
 *
 * Mapping is intentionally conservative: any document that has not been APPROVED is "DRAFT". A
 * document that's been SENT counts as binding (or in active signature workflow) and gets
 * "OUT FOR SIGNATURE". COMPLETED (post-signature) is the only state without a watermark.
 *
 * The SignatureRequest state (DECLINED / REVOKED) is layered on top by Sprint 4's
 * SignaturePanel-driven document status updates — we infer DECLINED here from the Document's
 * own status field rather than fetching the latest SR, to keep the cover render synchronous.
 */
function pickWatermark(status: string): string | undefined {
  switch (status) {
    case "DRAFT":
    case "PRODUCT_SIGN_OFF":
    case "TECH_SIGN_OFF":
    case "IN_REVIEW":
      return "DRAFT";
    case "APPROVED":
      // Approved but not yet sent — still a draft from the counterparty's perspective.
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

function InfoCard({ title, content }: { title: string; content: string }) {
  return (
    <article className="proposal-block-avoid rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] p-4">
      <p className="text-xs font-semibold tracking-wide text-[var(--text-4)] uppercase">{title}</p>
      <p className="mt-3 text-sm leading-7 text-[var(--text-2)]">{content || "Not set"}</p>
    </article>
  );
}

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className={bold ? "font-semibold text-[var(--text-1)]" : "text-[var(--text-2)]"}>{label}</p>
      <p className={bold ? "font-semibold text-[var(--text-1)]" : "text-[var(--text-2)]"}>{value}</p>
    </div>
  );
}

function formatMilestoneAmount(
  value: number | null | undefined,
  currency: "GBP" | "USD" | "EUR",
  taxRate: number,
) {
  if (value == null) {
    return "-";
  }

  return `${formatCurrency(value, currency)}${taxRate > 0 ? " + VAT" : ""}`;
}

function parseTechStackValue(value?: string) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function formatLinkTypeLabel(value: string) {
  switch (value) {
    case "WEBSITE":
      return "Website link";
    case "DECK":
      return "Deck link";
    case "DOCUMENT":
      return "Document link";
    case "EMAIL_LINK":
      return "Email link";
    case "INTERNAL_ROUTE":
      return "Internal page";
    default:
      return value
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/^\w/, (letter) => letter.toUpperCase());
  }
}

// ─── SLA / contract preview blocks (Sprint 3) ────────────────────────────────────────────

function SectionIntro({ intro }: { intro?: string }) {
  if (!intro?.trim()) return null;
  return <p className="text-sm leading-7 text-[var(--text-2)]">{intro}</p>;
}

function PrintTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="proposal-block-avoid overflow-hidden rounded-[10px] border border-[var(--border-2)] bg-white">
      <table className="w-full border-collapse text-sm">
        {children}
      </table>
    </div>
  );
}

function Th({ children, align = "left", width }: { children: React.ReactNode; align?: "left" | "center" | "right"; width?: string }) {
  return (
    <th
      style={{ textAlign: align, width }}
      className="border-b border-[var(--border-3)] bg-[var(--surface-canvas)] px-4 py-2.5 font-[var(--font-mono),'JetBrains_Mono',monospace] text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]"
    >
      {children}
    </th>
  );
}

function Td({ children, align = "left", strong, top }: { children: React.ReactNode; align?: "left" | "center" | "right"; strong?: boolean; top?: boolean }) {
  return (
    <td
      style={{ textAlign: align, verticalAlign: top ? "top" : "middle" }}
      className={`border-t border-[var(--border-3)] px-4 py-3 text-[13px] leading-6 ${strong ? "font-medium text-[var(--text-1)]" : "text-[var(--text-2)]"}`}
    >
      {children}
    </td>
  );
}

function PartiesPreview({ data }: { data: import("@/types/proposal").PartiesSectionData }) {
  return (
    <div className="space-y-4">
      <SectionIntro intro={data.intro} />
      <div className="grid gap-4 sm:grid-cols-2">
        {(data.parties ?? []).map((p) => (
          <div key={p.id} className="proposal-block-avoid rounded-[10px] border border-[var(--border-2)] bg-white p-4">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">{p.role || "Party"}</p>
            <p className="mt-2 text-base font-semibold text-[var(--text-1)]">{p.name || p.organization || "—"}</p>
            {p.organization && p.organization !== p.name ? (
              <p className="mt-0.5 text-sm text-[var(--text-3)]">{p.organization}</p>
            ) : null}
            {p.email ? (
              <p className="mt-2 text-sm text-[var(--text-3)]">{p.email}</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function ServiceTiersPreview({ data }: { data: import("@/types/proposal").ServiceTiersSectionData }) {
  return (
    <div className="space-y-4">
      <SectionIntro intro={data.intro} />
      <PrintTable>
        <thead>
          <tr>
            <Th width="22%">Tier</Th>
            <Th>Services included</Th>
            <Th width="14%" align="center">Uptime</Th>
            <Th width="22%">Support hours</Th>
          </tr>
        </thead>
        <tbody>
          {(data.tiers ?? []).map((t) => (
            <tr key={t.id}>
              <Td strong top>{t.name}</Td>
              <Td top>{t.services}</Td>
              <Td align="center" strong top>{t.uptimeTarget}</Td>
              <Td top>{t.supportHours}</Td>
            </tr>
          ))}
        </tbody>
      </PrintTable>
    </div>
  );
}

function ResponseTimesPreview({ data }: { data: import("@/types/proposal").ResponseTimesSectionData }) {
  return (
    <div className="space-y-4">
      <SectionIntro intro={data.intro} />
      <PrintTable>
        <thead>
          <tr>
            <Th width="22%">Priority</Th>
            <Th>Definition</Th>
            <Th width="20%">First response</Th>
            <Th width="20%">Resolution</Th>
          </tr>
        </thead>
        <tbody>
          {(data.priorities ?? []).map((p) => (
            <tr key={p.id}>
              <Td strong top>{p.priority}</Td>
              <Td top>{p.definition}</Td>
              <Td strong top>{p.firstResponse}</Td>
              <Td strong top>{p.resolution}</Td>
            </tr>
          ))}
        </tbody>
      </PrintTable>
    </div>
  );
}

function EscalationPreview({ data }: { data: import("@/types/proposal").EscalationSectionData }) {
  return (
    <div className="space-y-4">
      <SectionIntro intro={data.intro} />
      <ol className="space-y-3">
        {(data.levels ?? []).map((l) => (
          <li key={l.id} className="proposal-block-avoid flex gap-4 rounded-[10px] border border-[var(--border-2)] bg-white p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand-200)] font-[family-name:var(--font-display)] text-lg text-[var(--brand-700)]">
              {l.level}
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-medium text-[var(--text-1)]">{l.contact || "—"}</p>
              <p className="text-sm text-[var(--text-3)]">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em]">Trigger:</span>{" "}
                {l.timeframe}
              </p>
              <p className="text-sm text-[var(--text-2)]">{l.criteria}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ExclusionsPreview({ data }: { data: import("@/types/proposal").ExclusionsSectionData }) {
  return (
    <div className="space-y-4">
      <SectionIntro intro={data.intro} />
      <ul className="space-y-3">
        {(data.items ?? []).map((it) => (
          <li key={it.id} className="proposal-block-avoid rounded-[10px] border border-[var(--border-2)] bg-white p-4">
            <p className="font-medium text-[var(--text-1)]">{it.exclusion || "—"}</p>
            {it.rationale ? (
              <p className="mt-1 text-sm leading-6 text-[var(--text-3)]">{it.rationale}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PenaltiesPreview({ data }: { data: import("@/types/proposal").PenaltiesSectionData }) {
  return (
    <div className="space-y-4">
      <SectionIntro intro={data.intro} />
      <PrintTable>
        <thead>
          <tr>
            <Th>Trigger</Th>
            <Th width="28%">Service credit</Th>
            <Th width="28%">Cap</Th>
          </tr>
        </thead>
        <tbody>
          {(data.tiers ?? []).map((t) => (
            <tr key={t.id}>
              <Td top>{t.trigger}</Td>
              <Td strong top>{t.credit}</Td>
              <Td top>{t.cap || "—"}</Td>
            </tr>
          ))}
        </tbody>
      </PrintTable>
    </div>
  );
}

function TermPreview({ data }: { data: import("@/types/proposal").TermSectionData }) {
  const rows: Array<[string, string]> = [
    ["Effective date", data.effectiveDate || "—"],
    ["Initial term", `${data.initialTermMonths ?? 12} months`],
    ["Auto-renew", data.autoRenew ? "Yes" : "No"],
    ["Renewal term", data.renewalTerm || "—"],
    ["Notice period", `${data.noticePeriodDays ?? 60} days`],
    ["Governing law", data.governingLaw || "—"],
  ];
  return (
    <div className="space-y-4">
      <PrintTable>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <Td top>
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
                  {k}
                </span>
              </Td>
              <Td strong top>{v}</Td>
            </tr>
          ))}
        </tbody>
      </PrintTable>
      {data.terminationForCause ? (
        <div className="proposal-block-avoid rounded-[10px] border border-[var(--border-2)] bg-white p-4">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
            Termination for cause
          </p>
          <p className="mt-2 text-sm leading-7 text-[var(--text-2)]">{data.terminationForCause}</p>
        </div>
      ) : null}
    </div>
  );
}

function SignaturesPreview({ data }: { data: import("@/types/proposal").SignaturesSectionData }) {
  return (
    <div className="space-y-4">
      <SectionIntro intro={data.intro} />
      <div className="grid gap-4 sm:grid-cols-2">
        {(data.blocks ?? []).map((b) => (
          <div key={b.id} className="proposal-block-avoid rounded-[10px] border border-[var(--border-2)] bg-white p-5">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
              For and on behalf of
            </p>
            <p className="mt-2 text-base font-semibold text-[var(--text-1)]">{b.partyName || "—"}</p>

            {/* Signature line */}
            <div className="mt-6 border-b border-[var(--text-1)]" style={{ height: 32 }} />
            <p className="mt-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
              Signature
            </p>

            <div className="mt-4 space-y-1">
              <p className="text-sm text-[var(--text-2)]">
                <span className="text-[var(--text-4)]">Name: </span>
                <span className="font-medium text-[var(--text-1)]">{b.signatoryName || "—"}</span>
              </p>
              <p className="text-sm text-[var(--text-2)]">
                <span className="text-[var(--text-4)]">Role: </span>
                <span className="font-medium text-[var(--text-1)]">{b.signatoryRole || "—"}</span>
              </p>
              <p className="text-sm text-[var(--text-2)]">
                <span className="text-[var(--text-4)]">Date: </span>
                <span className="font-medium text-[var(--text-1)]">{b.signatureDate || "—"}</span>
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
