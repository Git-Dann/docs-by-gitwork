export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { ProposalPreview } from "@/components/proposals/proposal-preview";
import { prisma } from "@/lib/prisma";
import { proposalInclude, serializeProposal } from "@/server/proposals";

interface PublicPreviewPageProps {
  params: Promise<{ id: string }>;
}

export default async function PublicPreviewPage({ params }: PublicPreviewPageProps) {
  const { id } = await params;

  const proposal = await prisma.document.findUnique({
    where: {
      id,
    },
    include: proposalInclude,
  });

  if (!proposal) {
    notFound();
  }

  const serialized = serializeProposal(proposal);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-4 rounded-lg border border-[var(--border-1)] bg-white p-3">
        <p className="text-xs font-semibold tracking-wide text-[var(--text-3)] uppercase">Shared proposal</p>
        <h1 className="text-base font-semibold">{serialized.title}</h1>
      </div>
      <ProposalPreview proposal={serialized} />
    </main>
  );
}
