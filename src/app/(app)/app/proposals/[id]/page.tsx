import { AppShell } from "@/components/app-shell";
import { ProposalEditorLayout } from "@/components/proposals/proposal-editor-layout";

interface ProposalEditorPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProposalEditorPage({ params }: ProposalEditorPageProps) {
  const { id } = await params;

  return (
    <AppShell
      title="Proposal Editor"
      hideContentHeader
      forceCollapsedSidebar
      mainClassName="min-h-0 flex-1 overflow-auto p-5 sm:p-6"
    >
      <ProposalEditorLayout proposalId={id} />
    </AppShell>
  );
}
