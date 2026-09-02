import type { Metadata } from "next";
import { getClientNameBySlug } from "@/server/clients";
import { pageMetadataTitle } from "@/lib/page-title";
import { AppShell } from "@/components/app-shell";
import { FoundryProjectDetail } from "@/components/foundry/foundry-project-detail";

/**
 * Names the tab after the CLIENT, not just the feature — with several client tabs
 * open, "Project · Foundry" four times over is what made them indistinguishable.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const name = await getClientNameBySlug(slug);
  return { title: pageMetadataTitle("Project", name) };
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // Same lookup as generateMetadata above; AppShell syncs the tab title on the
  // client, and without this it would overwrite the server title with a
  // context-less one on hydration.
  const clientName = await getClientNameBySlug(slug);

  return (
    <AppShell
      title="Project"
      titleContext={clientName ?? undefined}
      subtitle="Project-level delivery view across updates, blockers, docs, approvals, and next actions."
    >
      <FoundryProjectDetail slug={slug} />
    </AppShell>
  );
}
