import { formatCurrency } from "@/lib/format";
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
          {data.graphic ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.graphic} alt="Introduction graphic" className="h-40 w-full rounded-lg object-cover" />
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
        <div className="grid gap-3 md:grid-cols-2">
          <InfoCard title="Platform" content={data.platformDescription} />
          <InfoCard title="Audience" content={data.audience} />
          <InfoCard title="Value" content={data.valueProposition} />
          <InfoCard title="Supported Platforms" content={data.platformsSupported} />
          {data.workflowGraphic ? (
            <div className="md:col-span-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={data.workflowGraphic}
                alt="Workflow diagram"
                className="h-48 w-full rounded-lg object-cover"
              />
            </div>
          ) : null}
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
              <p className="text-sm font-semibold">{item.title}</p>
              <p className="mt-1 text-sm text-[var(--text-2)]">{item.description}</p>
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
