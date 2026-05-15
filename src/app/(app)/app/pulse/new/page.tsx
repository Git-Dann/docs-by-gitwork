import { AppShell } from "@/components/app-shell";
import { PulseNewScanForm } from "@/components/pulse/pulse-new-scan-form";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";

async function getClients() {
  const workspace = await prisma.workspace.findFirst({
    where: { slug: DEFAULT_WORKSPACE_SLUG },
    select: { id: true },
  });
  if (!workspace) return [];

  const clients = await prisma.workspaceClient.findMany({
    where: { workspaceId: workspace.id },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return clients;
}

export default async function PulseNewScanPage() {
  const clients = await getClients();

  return (
    <AppShell title="New scan" subtitle="Validate a client project with Gitwork Pulse.">
      <div className="max-w-lg">
        <PulseNewScanForm clients={clients} />
      </div>
    </AppShell>
  );
}
