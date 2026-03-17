export const dynamic = "force-dynamic";

import { PrintToolbar } from "@/components/proposals/print-toolbar";
import { ProposalPreview } from "@/components/proposals/proposal-preview";
import { prisma } from "@/lib/prisma";
import { proposalInclude, serializeProposal } from "@/server/proposals";

interface ProposalPrintPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProposalPrintPage({ params }: ProposalPrintPageProps) {
  const { id } = await params;

  const proposal = await prisma.document.findUnique({
    where: {
      id,
    },
    include: proposalInclude,
  });

  if (!proposal) {
    return <p className="p-8 text-sm text-rose-700">Proposal not found.</p>;
  }

  const serialized = serializeProposal(proposal);

  return (
    <main className="mx-auto max-w-5xl space-y-3 px-4 py-4 print:max-w-none print:px-0 print:py-0">
      <PrintToolbar proposalId={id} />
      <ProposalPreview proposal={serialized} className="print:[&_.xl\:block]:!hidden" />
    </main>
  );
}
