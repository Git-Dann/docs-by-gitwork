import { AppShell } from "@/components/app-shell";
import { FoundryProjectDetail } from "@/components/foundry/foundry-project-detail";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <AppShell
      title="Project"
      subtitle="Project-level delivery view across updates, blockers, docs, approvals, and next actions."
    >
      <FoundryProjectDetail slug={slug} />
    </AppShell>
  );
}
