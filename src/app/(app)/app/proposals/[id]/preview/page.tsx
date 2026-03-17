export const dynamic = "force-dynamic";

import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ProposalPreview } from "@/components/proposals/proposal-preview";
import { prisma } from "@/lib/prisma";
import { proposalInclude, serializeProposal } from "@/server/proposals";

interface ProposalPreviewPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProposalPreviewPage({ params }: ProposalPreviewPageProps) {
  const { id } = await params;

  const proposal = await prisma.document.findUnique({
    where: {
      id,
    },
    include: proposalInclude,
  });

  if (!proposal) {
    return (
      <AppShell title="Preview" subtitle="Proposal not found.">
        <p className="text-sm text-rose-700">Proposal not found.</p>
      </AppShell>
    );
  }

  const serialized = serializeProposal(proposal);

  return (
    <AppShell
      title="Proposal Preview"
      subtitle="Client-facing proposal output preview with print-ready structure."
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/app/proposals/${id}`}
            className="inline-flex h-9 items-center rounded-md border border-[var(--border-1)] bg-white px-3 text-xs font-medium text-[var(--text-2)]"
          >
            Back to editor
          </Link>
          <Link
            href={`/app/proposals/${id}/print`}
            className="inline-flex h-9 items-center rounded-md bg-[var(--brand-600)] px-3 text-xs font-medium text-white"
          >
            Open print view
          </Link>
        </div>

        <ProposalPreview proposal={serialized} />
      </div>
    </AppShell>
  );
}
