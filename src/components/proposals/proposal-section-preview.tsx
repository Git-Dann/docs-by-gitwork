"use client";

import Link from "next/link";
import { ArrowRightIcon } from "@heroicons/react/24/outline";
import { getObjectiveIcon } from "@/components/proposals/icon-select";
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
    <figure className="overflow-hidden rounded-lg border border-[var(--border-1)] bg-[var(--surface-0)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={altText} className="h-48 w-full object-cover" />
      <figcaption className="space-y-1 p-3">
        <p className="text-sm font-medium text-[var(--text-2)]">{title}</p>
        {caption ? <p className="text-xs text-[var(--text-3)]">{caption}</p> : null}
      </figcaption>
    </figure>
  );
}

export function ProposalSectionPreview({
  section,
  proposal,
}: {
  section: ProposalSection;
  proposal: ProposalDocument;
}) {
  const sectionId = `section-${section.id ?? section.key}`;

  if (!section.isVisible) {
    return null;
  }

  if (section.key === "cover") {
    return <CoverPagePreview section={section} proposal={proposal} sectionId={sectionId} />;
  }

  const sectionAssets = proposal.assets.filter((asset) => asset.placement === section.key);

  return (
    <section id={sectionId} className="space-y-4 border-b border-[var(--border-1)] pb-8 last:border-0 last:pb-0">
      <header>
        <h2 className="text-xl font-semibold tracking-tight text-[var(--text-1)]">{section.title}</h2>
        {section.description ? (
          <p className="mt-1 text-sm text-[var(--text-3)]">{section.description}</p>
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

          <div className="rounded-md border border-[var(--border-1)] bg-[var(--surface-1)] px-3 py-2 text-xs text-[var(--text-3)]">
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
        <div className="space-y-3 text-sm leading-6 text-[var(--text-2)]">
          <p>{data.statement}</p>
          <p>{data.summary}</p>
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
        <div className="grid gap-3 md:grid-cols-2">
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
        <div className="grid gap-3 md:grid-cols-2">
          {data.items.map((item) => (
            <article key={item.id} className="rounded-lg border border-[var(--border-1)] bg-[var(--surface-0)] p-4">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--surface-brand)] text-[var(--brand-700)]">
                  {(() => {
                    const Icon = getObjectiveIcon(item.icon);
                    return <Icon className="h-5 w-5" />;
                  })()}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="mt-1 text-sm text-[var(--text-2)]">{item.description}</p>
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
            <article key={touchpoint.id} className="rounded-lg border border-[var(--border-1)] bg-[var(--surface-0)] p-4">
              <h3 className="text-base font-semibold">{touchpoint.title}</h3>
              <p className="mt-1 text-sm text-[var(--text-2)]">{touchpoint.summary}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--text-2)]">
                {touchpoint.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              {touchpoint.notes ? <p className="mt-3 text-xs text-[var(--text-3)]">Notes: {touchpoint.notes}</p> : null}
              {touchpoint.callout ? (
                <p className="mt-2 rounded-md bg-[var(--surface-brand)] px-3 py-2 text-xs text-[var(--brand-700)]">
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
          <div className="space-y-3 border-l-2 border-[var(--border-1)] pl-4">
            {phases.map((phase) => (
              <div key={phase.id ?? phase.name} className="relative rounded-md border border-[var(--border-1)] p-3">
                <span className="absolute -left-[1.35rem] top-3 h-2.5 w-2.5 rounded-full bg-[var(--brand-500)]" />
                <p className="text-sm font-semibold">{phase.name}</p>
                <p className="text-xs text-[var(--text-3)]">{phase.duration}</p>
                <p className="mt-1 text-sm text-[var(--text-2)]">{phase.summary}</p>
                <p className="mt-2 text-xs text-[var(--text-3)]">
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
            <article key={phase.id ?? phase.name} className="rounded-lg border border-[var(--border-1)] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{phase.name}</p>
                <p className="text-xs text-[var(--text-3)]">{phase.duration}</p>
              </div>
              <p className="mt-1 text-sm text-[var(--text-2)]">{phase.summary}</p>
              <p className="mt-2 text-xs text-[var(--text-3)]">
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
            <h3 className="text-3xl font-semibold tracking-tight text-[var(--text-1)]">Budget Breakdown</h3>
            <div className="overflow-x-auto rounded-xl border border-[var(--border-1)] bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-[var(--surface-1)] text-[var(--text-3)]">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">People</th>
                    <th className="px-3 py-2 text-left font-medium">Tech Stack</th>
                    <th className="px-3 py-2 text-right font-medium">Qty</th>
                    <th className="px-3 py-2 text-right font-medium">Unit cost</th>
                    <th className="px-3 py-2 text-right font-medium">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id ?? `${item.category}-${item.itemName}`} className="border-t border-[var(--border-1)]">
                      <td className="px-3 py-2 text-[var(--text-2)]">{item.category || "-"}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1.5">
                          {parseTechStackValue(item.description).length ? (
                            parseTechStackValue(item.description).map((entry) => (
                              <span
                                key={entry}
                                className="rounded-full border border-[var(--border-1)] bg-[var(--surface-1)] px-2 py-0.5 text-xs font-medium text-[var(--text-2)]"
                              >
                                {entry}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-[var(--text-3)]">No stack selected</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-[var(--text-2)]">{item.quantity}</td>
                      <td className="px-3 py-2 text-right text-[var(--text-2)]">
                        {formatCurrency(item.unitCost, data.currency)}
                      </td>
                      <td className="px-3 py-2 text-right text-[var(--text-1)]">
                        {formatCurrency(item.subtotal, data.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="ml-auto max-w-xs space-y-1 rounded-xl border border-[var(--border-1)] bg-white p-3 text-sm">
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
              <h3 className="text-3xl font-semibold tracking-tight text-[var(--text-1)]">Payment Schedule</h3>
              <div className="space-y-4 text-lg leading-relaxed text-[var(--text-2)]">
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
                <div className="overflow-x-auto rounded-xl border border-[var(--border-1)] bg-white">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-[var(--surface-1)] text-[var(--text-3)]">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">
                          Action
                        </th>
                        <th className="px-3 py-2 text-left font-medium">
                          Period Covered
                        </th>
                        <th className="px-3 py-2 text-left font-medium">
                          Included Work
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Amount (ex VAT)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentSchedule.map((row) => (
                        <tr key={row.id} className="border-t border-[var(--border-1)]">
                          <td className="px-3 py-2 align-top text-[var(--text-2)]">
                            {row.action || "-"}
                          </td>
                          <td className="px-3 py-2 align-top text-[var(--text-2)]">
                            {row.periodCovered || "-"}
                          </td>
                          <td className="px-3 py-2 align-top text-[var(--text-2)]">
                            {row.includedWork || "-"}
                          </td>
                          <td className="px-3 py-2 align-top text-right font-medium text-[var(--text-1)]">
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
              <h3 className="text-4xl font-semibold tracking-tight text-[var(--text-1)]">Additional Notes</h3>
              <ul className="list-disc space-y-2 pl-8 text-xl leading-relaxed text-[var(--text-2)]">
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
        <div className="space-y-4 rounded-lg border border-[var(--border-1)] p-4">
          <p className="text-base font-semibold">{data.headline}</p>
          <p className="text-sm text-[var(--text-2)]">{data.body}</p>
          <div className="flex flex-wrap gap-2">
            {primary ? (
              <a
                href={primary.destination}
                className="rounded-md bg-[var(--brand-600)] px-3 py-2 text-sm font-medium text-white"
              >
                {primary.label}
              </a>
            ) : null}
            {secondary ? (
              <a
                href={secondary.destination}
                className="rounded-md border border-[var(--border-1)] px-3 py-2 text-sm font-medium text-[var(--text-2)]"
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
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-2)]">{data.notes}</p>
          <ul className="space-y-2">
            {proposal.links.map((link) => (
              <li key={link.id ?? link.url} className="rounded-md border border-[var(--border-1)] p-3">
                <p className="text-sm font-medium">{link.label}</p>
                <a href={link.url} className="text-xs text-[var(--brand-700)] underline-offset-2 hover:underline">
                  {link.url}
                </a>
                <p className="mt-1 text-xs text-[var(--text-3)]">
                  {link.type.replace("_", " ")}
                  {link.notes ? ` · ${link.notes}` : ""}
                </p>
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
        <ul className="list-disc space-y-2 pl-6 text-sm text-[var(--text-2)]">
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
        <div className="space-y-3 text-sm text-[var(--text-2)]">
          <p>
            Prepared by: <span className="font-medium text-[var(--text-1)]">{data.preparedBy}</span>
          </p>
          <p>Team: {data.team}</p>
          <p>Contact: {data.contactDetails}</p>
          {data.signaturePlaceholder ? (
            <div className="mt-3 rounded-md border border-dashed border-[var(--border-1)] p-3 text-xs text-[var(--text-3)]">
              Signature placeholder
            </div>
          ) : null}
          <p className="text-xs text-[var(--text-3)]">{data.footerNote}</p>
          {data.showBrandingBlock ? (
            <div className="rounded-md bg-[var(--surface-brand)] px-3 py-2 text-xs font-medium text-[var(--brand-700)]">
              Docs by Gitwork
            </div>
          ) : null}
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
      className="relative isolate overflow-hidden rounded-[28px] border border-[var(--border-1)] bg-white px-8 py-10 sm:px-16 sm:py-14"
    >
      <CoverAccent position="top" assetUrl={topAccentUrl} altText="Top cover accent" />
      <CoverAccent
        position="bottom"
        assetUrl={bottomAccentUrl}
        altText="Bottom cover accent"
      />

      <div className="relative z-10 mx-auto flex min-h-[1080px] max-w-4xl flex-col items-center justify-between text-center">
        <div className="w-full pt-10">
          <div className="flex justify-center">
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

          <div className="mt-24 space-y-5">
            <h1 className="text-5xl font-semibold tracking-[-0.04em] text-[var(--text-1)] sm:text-6xl">
              {data.proposalTitle || proposal.title || "Untitled proposal"}
            </h1>
            <p className="text-3xl tracking-[-0.03em] text-[var(--text-1)]">
              {data.subtitle || proposal.version || "Subtitle or version"}
            </p>
            <p className="text-2xl tracking-[-0.02em] text-[var(--text-2)]">{authorLine || "Author / Department"}</p>
            <p className="text-xl font-semibold tracking-[-0.02em] text-[var(--text-2)]">
              {data.date || "Date Created"} / {proposal.updatedAt.slice(0, 10)}
            </p>
            <p className="text-2xl italic tracking-[-0.02em] text-[var(--text-3)]">
              {confidentialityText || "Confidentiality Statement"}
            </p>
          </div>
        </div>

        <div className="w-full max-w-[920px]">
          <div className="mx-auto h-px w-full bg-[var(--border-1)]" />
          <p className="mx-auto mt-16 max-w-5xl text-2xl leading-[1.55] tracking-[-0.02em] text-[var(--text-1)]">
            {introduction?.statement ||
              proposal.summary ||
              "At Gitwork, we build practical, reliable software tailored to your business goals."}
          </p>

          {primaryCta ? (
            <div className="mt-14 flex justify-center">
              <Link
                href={primaryCta.destination || "#"}
                className="inline-flex items-center gap-2 rounded-2xl bg-[#1d95f2] px-8 py-4 text-xl font-semibold text-white shadow-[0_10px_24px_rgba(29,149,242,0.28)]"
              >
                {primaryCta.label}
                <ArrowRightIcon className="h-5 w-5" />
              </Link>
            </div>
          ) : null}
        </div>
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
        <div className="h-4 flex-1 rounded-b-[24px] bg-[#1d95f2]" />
        <div className="mx-6 h-20 w-[360px] rounded-b-[44px] bg-[#1d95f2]" />
        <div className="h-4 flex-1 rounded-b-[24px] bg-[#1d95f2]" />
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-center px-10">
      <div className="h-4 flex-1 rounded-t-[24px] bg-[#1d95f2]" />
      <div className="mx-6 h-20 w-[360px] rounded-t-[44px] bg-[#1d95f2]" />
      <div className="h-4 flex-1 rounded-t-[24px] bg-[#1d95f2]" />
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
        <span className="max-w-[320px] text-5xl font-semibold tracking-[-0.05em] text-[#1d4ed8]">{clientName}</span>
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
        fill="#1d95f2"
      />
      <path
        d="M62 18h-6v10h6c3.314 0 6 2.686 6 6v4h-12v10h12v14c0 3.314-2.686 6-6 6h-6v10h6c8.837 0 16-7.163 16-16V34c0-8.837-7.163-16-16-16Z"
        fill="#111827"
      />
      <path d="M48 28h8v10h-8z" fill="#111827" />
      <path d="M48 58h8v10h-8z" fill="#111827" />
      <path d="M40 18h8v10h-8z" fill="#1d95f2" />
      <path d="M40 68h8v10h-8z" fill="#1d95f2" />
    </svg>
  );
}

function InfoCard({ title, content }: { title: string; content: string }) {
  return (
    <article className="rounded-lg border border-[var(--border-1)] p-3">
      <p className="text-xs font-semibold tracking-wide text-[var(--text-3)] uppercase">{title}</p>
      <p className="mt-1 text-sm text-[var(--text-2)]">{content}</p>
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
