"use client";

import Link from "next/link";
import { ArrowRightIcon } from "@heroicons/react/24/outline";
import { getObjectiveIcon } from "@/components/proposals/icon-select";
import { buttonStyles } from "@/components/ui/button";
import { useClientList } from "@/hooks/use-proposals";
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
    <figure className="proposal-block-avoid overflow-hidden rounded-[20px] border border-[var(--border-2)] bg-[var(--surface-0)]">
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

          <div className="rounded-[14px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2 text-xs text-[var(--text-3)]">
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
              className="proposal-block-avoid rounded-[20px] border border-[var(--border-2)] bg-[var(--surface-0)] p-5"
            >
              <div className="flex items-start gap-4">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] bg-[var(--surface-brand)] text-[var(--brand-700)]">
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
              className="proposal-block-avoid rounded-[20px] border border-[var(--border-2)] bg-[var(--surface-0)] p-5"
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
                <p className="mt-4 rounded-[14px] bg-[var(--surface-brand)] px-4 py-3 text-sm leading-6 text-[var(--brand-700)]">
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
                className="proposal-block-avoid relative rounded-[18px] border border-[var(--border-2)] p-4"
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
              className="proposal-block-avoid rounded-[18px] border border-[var(--border-2)] p-4"
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
                    <th className="text-left">People</th>
                    <th className="text-left">Tech Stack</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Unit cost</th>
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

            <div className="proposal-block-avoid ml-auto max-w-xs space-y-1 rounded-[18px] border border-[var(--border-2)] bg-white p-4 text-sm shadow-[var(--shadow-xs)]">
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
                {data.paymentTerms ? (
                  <p>
                    <strong className="font-semibold text-[var(--text-1)]">{data.paymentTerms}</strong>
                  </p>
                ) : null}
                {data.vatNotice ? (
                  <p>
                    <strong className="font-semibold text-[var(--text-1)]">{data.vatNotice}</strong>
                  </p>
                ) : null}
                {data.ipTransferNotice ? <p>{data.ipTransferNotice}</p> : null}
              </div>

              {paymentSchedule.length ? (
                <div className="app-table-shell overflow-x-auto">
                  <table className="app-table min-w-full text-left text-sm">
                    <thead>
                      <tr>
                        <th className="text-left">Action</th>
                        <th className="text-left">Period Covered</th>
                        <th className="text-left">Included Work</th>
                        <th className="text-right">Amount (ex VAT)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentSchedule.map((row) => (
                        <tr key={row.id}>
                          <td className="align-top text-[var(--text-2)]">
                            {row.action || "-"}
                          </td>
                          <td className="align-top text-[var(--text-2)]">
                            {row.periodCovered || "-"}
                          </td>
                          <td className="align-top text-[var(--text-2)]">
                            {row.includedWork || "-"}
                          </td>
                          <td className="align-top text-right font-medium text-[var(--text-1)]">
                            {formatMilestoneAmount(row.amount, data.currency, data.taxRate)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ) : null}

          {additionalNotes.length ? (
            <div className="space-y-4">
              <h3 className="text-[26px] font-semibold tracking-[-0.03em] text-[var(--text-1)]">
                Additional notes
              </h3>
              <ul className="list-disc space-y-2 pl-8 text-[16px] leading-8 text-[var(--text-2)] marker:text-[var(--brand-600)]">
                {additionalNotes.map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
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
        <div className="proposal-block-avoid rounded-[22px] border border-[var(--border-2)] bg-[linear-gradient(180deg,#ffffff_0%,var(--surface-brand-soft)_100%)] p-6">
          <p className="app-eyebrow">Next Step</p>
          <p className="mt-3 text-[26px] font-semibold tracking-[-0.03em] text-[var(--text-1)]">
            {data.headline}
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--text-2)]">{data.body}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {primary ? (
              <a
                href={primary.destination}
                className={buttonStyles({ variant: "primary", size: "sm" })}
              >
                {primary.label}
              </a>
            ) : null}
            {secondary ? (
              <a
                href={secondary.destination}
                className={buttonStyles({ variant: "secondary", size: "sm" })}
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
                className="proposal-block-avoid rounded-[18px] border border-[var(--border-2)] p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-[var(--text-1)]">{link.label}</p>
                  <span className="rounded-full border border-[var(--border-2)] bg-[var(--surface-1)] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-4)]">
                    {link.type.replace(/_/g, " ")}
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
        signaturePlaceholder: boolean;
      };

      return (
        <div className="proposal-block-avoid grid gap-4 rounded-[22px] border border-[var(--border-2)] bg-[var(--surface-1)] p-5 md:grid-cols-[minmax(0,1fr)_220px]">
          <div className="space-y-3 text-sm leading-7 text-[var(--text-2)]">
            <p>
              Prepared by: <span className="font-medium text-[var(--text-1)]">{data.preparedBy}</span>
            </p>
            <p>Team: {data.team}</p>
            <p>Contact: {data.contactDetails}</p>
            {data.footerNote ? <p className="text-sm leading-7 text-[var(--text-3)]">{data.footerNote}</p> : null}
          </div>
          <div className="space-y-3">
            {data.signaturePlaceholder ? (
              <div className="rounded-[14px] border border-dashed border-[var(--border-2)] bg-white p-4 text-xs uppercase tracking-[0.12em] text-[var(--text-4)]">
                Signature placeholder
              </div>
            ) : null}
            {data.showBrandingBlock ? (
              <div className="rounded-[14px] bg-[var(--surface-brand)] px-4 py-3 text-xs font-medium uppercase tracking-[0.12em] text-[var(--brand-700)]">
                Docs by Gitwork
              </div>
            ) : null}
          </div>
        </div>
      );
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
  const introduction = proposal.sections.find((entry) => entry.key === "introduction")?.data as
    | {
        statement?: string;
      }
    | undefined;
  const signoff = proposal.sections.find((entry) => entry.key === "signoff_footer")?.data as
    | {
        preparedBy?: string;
        team?: string;
      }
    | undefined;
  const primaryCta = proposal.ctas.find((cta) => cta.role === "PRIMARY" && cta.label.trim().length > 0);
  const { data: clientListData } = useClientList();
  const brandLogoUrl = settings.templateBranding.coverBrandLogoUrl.trim() || undefined;
  const topAccentUrl = settings.templateBranding.coverTopAccentUrl.trim() || undefined;
  const bottomAccentUrl = settings.templateBranding.coverBottomAccentUrl.trim() || undefined;
  const confidentialityText = resolveConfidentialityText(
    data.confidentialityMode ?? "INTERNAL",
    settings,
    data.confidentiality,
  );
  const clientName = data.clientName || proposal.clientName || proposal.metadata.client || "Client";
  const matchedClient = (clientListData?.clients ?? []).find(
    (client) => client.name.trim().toLowerCase() === clientName.trim().toLowerCase(),
  );
  const clientLogoUrl = matchedClient?.logoUrl?.trim() || undefined;
  const authorLine = [signoff?.preparedBy, signoff?.team].filter(Boolean).join(" / ");

  return (
    <section
      id={sectionId}
      className="proposal-cover relative isolate overflow-hidden rounded-[32px] border border-[var(--border-2)] bg-[linear-gradient(180deg,#ffffff_0%,#fcfbff_100%)] px-8 py-10 sm:px-12 sm:py-12 print:rounded-none print:border-0"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(158,119,237,0.12),transparent_28%)]" />
      <CoverAccent position="top" assetUrl={topAccentUrl} altText="Top cover accent" />
      <CoverAccent
        position="bottom"
        assetUrl={bottomAccentUrl}
        altText="Bottom cover accent"
      />

      <div className="relative z-10 mx-auto grid min-h-[1080px] max-w-5xl gap-10 md:grid-cols-[minmax(0,1.2fr)_300px]">
        <div className="flex flex-col justify-between gap-12 pt-8">
          <div className="space-y-10">
            <div className="flex justify-start">
              {data.brandLockup === "CLIENT_X_GITWORK" ? (
                <ClientGitworkLockup
                  clientName={clientName}
                  clientLogoUrl={clientLogoUrl}
                  brandLogoUrl={brandLogoUrl}
                />
              ) : (
                <GitworkLockup brandLogoUrl={brandLogoUrl} />
              )}
            </div>

            <div className="max-w-3xl space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="app-chip border-transparent bg-[var(--surface-brand)] text-[var(--brand-700)]">
                  Proposal
                </span>
                <span className="app-chip">{data.date || "Date not set"}</span>
                <span className="app-chip">{proposal.updatedAt.slice(0, 10)}</span>
              </div>
              <h1 className="text-5xl font-semibold tracking-[-0.05em] text-[var(--text-1)] sm:text-6xl">
                {data.proposalTitle || proposal.title || "Untitled proposal"}
              </h1>
              <p className="text-[28px] tracking-[-0.03em] text-[var(--text-2)]">
                {data.subtitle || proposal.version || "Version not set"}
              </p>
              <p className="max-w-2xl text-lg leading-8 text-[var(--text-2)]">
                {data.productName || proposal.productName || "Product or project name not set"}
              </p>
              <div className="rounded-[18px] border border-[var(--border-2)] bg-white/80 px-5 py-4 backdrop-blur-sm">
                <p className="app-eyebrow">Confidentiality</p>
                <p className="mt-2 text-sm leading-7 text-[var(--text-2)]">
                  {confidentialityText || "Confidentiality statement not set"}
                </p>
              </div>
            </div>
          </div>

          <div className="max-w-3xl space-y-8">
            <div className="h-px w-full bg-[var(--border-2)]" />
            <p className="text-[22px] leading-[1.7] tracking-[-0.02em] text-[var(--text-1)]">
              {introduction?.statement || proposal.summary || "Proposal summary not yet set."}
            </p>

            {primaryCta ? (
              <div className="flex justify-start">
                <Link
                  href={primaryCta.destination || "#"}
                  className="inline-flex items-center gap-2 rounded-2xl bg-[var(--brand-600)] px-7 py-4 text-base font-semibold text-white shadow-[0_12px_24px_rgba(127,86,217,0.24)]"
                >
                  {primaryCta.label}
                  <ArrowRightIcon className="h-5 w-5" />
                </Link>
              </div>
            ) : null}
          </div>
        </div>

        <aside className="proposal-block-avoid self-end rounded-[24px] border border-[var(--border-2)] bg-white/85 p-6 shadow-[var(--shadow-lg)] backdrop-blur-sm">
          <p className="app-eyebrow">Snapshot</p>
          <div className="mt-4 space-y-4">
            <CoverDataRow label="Client" value={clientName} />
            <CoverDataRow
              label="Prepared by"
              value={authorLine || "Author / department not set"}
            />
            <CoverDataRow
              label="Project"
              value={data.productName || proposal.productName || "Not set"}
            />
            <CoverDataRow label="Created" value={data.date || "Not set"} />
            <CoverDataRow label="Last updated" value={proposal.updatedAt.slice(0, 10)} />
          </div>
        </aside>
      </div>
    </section>
  );
}

function CoverAccent({
  position,
  assetUrl,
  altText,
}: {
  position: "top" | "bottom";
  assetUrl?: string;
  altText: string;
}) {
  if (assetUrl) {
    return (
      <div
        className={position === "top" ? "pointer-events-none absolute inset-x-0 top-0" : "pointer-events-none absolute inset-x-0 bottom-0"}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={assetUrl}
          alt={altText}
          className={position === "top" ? "w-full object-contain align-top" : "w-full object-contain align-bottom"}
        />
      </div>
    );
  }

  if (position === "top") {
    return (
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-center px-10">
        <div className="h-4 flex-1 rounded-b-[24px] bg-[var(--brand-600)]" />
        <div className="mx-6 h-20 w-[360px] rounded-b-[44px] bg-[var(--brand-600)]" />
        <div className="h-4 flex-1 rounded-b-[24px] bg-[var(--brand-600)]" />
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-center px-10">
      <div className="h-4 flex-1 rounded-t-[24px] bg-[var(--brand-600)]" />
      <div className="mx-6 h-20 w-[360px] rounded-t-[44px] bg-[var(--brand-600)]" />
      <div className="h-4 flex-1 rounded-t-[24px] bg-[var(--brand-600)]" />
    </div>
  );
}

function GitworkLockup({ brandLogoUrl }: { brandLogoUrl?: string }) {
  return (
    <div className="flex flex-col items-center gap-5">
      {brandLogoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brandLogoUrl} alt="Gitwork logo" className="h-24 w-auto object-contain" />
      ) : (
        <GitworkMark className="h-24 w-24" />
      )}
      <span className="text-2xl font-medium tracking-[-0.02em] text-[var(--text-2)]">Gitwork</span>
    </div>
  );
}

function ClientGitworkLockup({
  clientName,
  clientLogoUrl,
  brandLogoUrl,
}: {
  clientName: string;
  clientLogoUrl?: string;
  brandLogoUrl?: string;
}) {
  return (
    <div className="flex items-center gap-8">
      {clientLogoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={clientLogoUrl} alt={clientName} className="max-h-24 max-w-[260px] object-contain" />
      ) : (
        <span className="max-w-[320px] text-5xl font-semibold tracking-[-0.05em] text-[var(--brand-700)]">{clientName}</span>
      )}
      <span className="text-5xl font-light text-[var(--text-1)]">×</span>
      {brandLogoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brandLogoUrl} alt="Gitwork logo" className="h-24 w-auto object-contain" />
      ) : (
        <GitworkMark className="h-24 w-24" />
      )}
    </div>
  );
}

function GitworkMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" fill="none" className={className} aria-label="Gitwork logo">
      <path
        d="M34 18c-8.837 0-16 7.163-16 16v28c0 8.837 7.163 16 16 16h6v-10h-6c-3.314 0-6-2.686-6-6V34c0-3.314 2.686-6 6-6h6V18h-6Z"
        fill="var(--brand-600)"
      />
      <path
        d="M62 18h-6v10h6c3.314 0 6 2.686 6 6v4h-12v10h12v14c0 3.314-2.686 6-6 6h-6v10h6c8.837 0 16-7.163 16-16V34c0-8.837-7.163-16-16-16Z"
        fill="var(--text-1)"
      />
      <path d="M48 28h8v10h-8z" fill="var(--text-1)" />
      <path d="M48 58h8v10h-8z" fill="var(--text-1)" />
      <path d="M40 18h8v10h-8z" fill="var(--brand-600)" />
      <path d="M40 68h8v10h-8z" fill="var(--brand-600)" />
    </svg>
  );
}

function CoverDataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]">{label}</p>
      <p className="text-sm leading-6 text-[var(--text-1)]">{value}</p>
    </div>
  );
}

function InfoCard({ title, content }: { title: string; content: string }) {
  return (
    <article className="proposal-block-avoid rounded-[18px] border border-[var(--border-2)] bg-[var(--surface-0)] p-4">
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
