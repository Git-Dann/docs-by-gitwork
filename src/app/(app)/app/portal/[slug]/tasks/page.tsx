import type { Metadata } from "next";
import { getClientNameBySlug } from "@/server/clients";
import { pageMetadataTitle } from "@/lib/page-title";
import { AppShell } from "@/components/app-shell";
import { ClientTasksWorkspace } from "@/components/tasks/client-tasks-workspace";

/**
 * Names the tab after the CLIENT, not just the feature — with several client tabs
 * open, "Tasks · Foundry" four times over is what made them indistinguishable.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const name = await getClientNameBySlug(slug);
  return { title: pageMetadataTitle("Tasks", name) };
}

export default async function ClientTasksPage({
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
      title="Tasks"
      subtitle="Feature blocks, board, and client timeline."
      titleContext={clientName ?? undefined}
    >
      <ClientTasksWorkspace slug={slug} />
    </AppShell>
  );
}
