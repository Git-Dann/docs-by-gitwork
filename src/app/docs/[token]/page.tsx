/**
 * Public, token-gated document view.
 *
 *   /docs/[token]  → renders any Document where shareToken === token and isShared === true.
 *
 * Replaces the legacy /preview/[id] route, which exposed documents by their internal ID and had
 * no on/off switch. The new route requires the workspace to mint a token via
 * `POST /api/documents/[id]/share` and can be revoked via DELETE on the same endpoint.
 *
 * Visually this page reuses the existing <ProposalPreview/> for now. Sprint 2 will replace the
 * proposal-specific cover with the unified <DocumentCover/> shared with Pulse reports.
 */

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { proposalInclude, serializeProposal } from "@/server/proposals";
import { ProposalPreview } from "@/components/proposals/proposal-preview";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
}

const DOC_TYPE_LABEL: Record<string, string> = {
  PROPOSAL: "Proposal",
  SLA: "Service Level Agreement",
  OTHER: "Document",
};

export async function generateMetadata({ params }: PageProps) {
  const { token } = await params;
  if (!token || token.length < 16) {
    return { title: "Document not found — Gitwork" };
  }

  const doc = await prisma.document.findFirst({
    where: { shareToken: token, isShared: true, archivedAt: null },
    select: {
      title: true,
      clientName: true,
      documentType: true,
      documentNumber: true,
    },
  });

  if (!doc) {
    return { title: "Document not found — Gitwork" };
  }

  const typeLabel = DOC_TYPE_LABEL[doc.documentType] ?? "Document";
  const prefix = doc.documentNumber ? `${doc.documentNumber} · ` : "";
  return {
    title: `${prefix}${doc.title} — Gitwork ${typeLabel}`,
    description: doc.clientName
      ? `${typeLabel} prepared by Gitwork for ${doc.clientName}.`
      : `${typeLabel} prepared by Gitwork.`,
    robots: { index: false, follow: false },
  };
}

export default async function PublicDocumentPage({ params }: PageProps) {
  const { token } = await params;
  if (!token || token.length < 16) notFound();

  const record = await prisma.document.findFirst({
    where: { shareToken: token, isShared: true, archivedAt: null },
    include: proposalInclude,
  });

  if (!record) notFound();

  const proposal = serializeProposal(record);
  const docNumber = proposal.documentNumber ?? "";
  const typeLabel = DOC_TYPE_LABEL[proposal.documentType] ?? "Document";

  return (
    <main className="min-h-screen bg-[var(--surface-canvas)]">
      {/* Slim public header — matches the /report/[token] aesthetic */}
      <div className="border-b border-[var(--border-2)] bg-white">
        <div className="mx-auto flex max-w-[920px] items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/foundry-logo.png" alt="Foundry by Gitwork" className="h-7 w-auto" />
            <div className="hidden h-6 w-px bg-[var(--border-2)] sm:block" />
            <span className="hidden font-mono text-[10px] font-medium uppercase tracking-[1.2px] text-[var(--text-4)] sm:inline">
              {docNumber ? `${docNumber} · ` : ""}{typeLabel.toUpperCase()}
            </span>
          </div>
          <a
            href="https://gitwork.io"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[10px] font-medium uppercase tracking-[1.2px] text-[var(--text-3)] hover:text-[var(--text-1)]"
          >
            GITWORK.IO ↗
          </a>
        </div>
      </div>

      <div className="px-4 py-8 sm:px-6 sm:py-12">
        <ProposalPreview
          proposal={proposal}
          showTableOfContents={false}
          frame
          className="mx-auto w-full max-w-[880px]"
        />
      </div>

      {/* CTA footer — same pattern as the Pulse public report */}
      <div className="border-t border-[var(--border-2)] bg-white">
        <div className="mx-auto max-w-[920px] px-4 py-12 text-center sm:px-6">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[1.2px] text-[var(--brand-700)]">
            POWERED BY FOUNDRY
          </p>
          <h2 className="mt-3 font-[family-name:var(--font-display)] text-[32px] font-normal leading-[1.15] tracking-[-0.5px] text-[var(--text-1)] sm:text-[40px]">
            From prompt <em>to production.</em>
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[var(--text-3)]">
            Gitwork specialises in taking AI-built apps from prototype to production-ready,
            shippable products.
          </p>
          <div className="mt-6">
            <a
              href="https://gitwork.io"
              target="_blank"
              rel="noopener noreferrer"
              className="app-button app-button-primary app-button-md inline-flex"
            >
              Talk to Gitwork
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
