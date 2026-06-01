import { AppShell } from "@/components/app-shell";
import { ClientTasksWorkspace } from "@/components/tasks/client-tasks-workspace";

export default async function ClientTasksPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <AppShell title="Tasks" subtitle="Feature blocks, board, and client timeline.">
      <ClientTasksWorkspace slug={slug} />
    </AppShell>
  );
}
