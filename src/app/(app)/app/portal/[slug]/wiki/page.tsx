import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { WikiWorkspace } from "@/components/clients/wiki/wiki-workspace";
import { notFound } from "next/navigation";

export default async function WikiPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { workspace } = await ensureBaseRecords();
  const workspaceId = workspace.id;

  const client = await prisma.workspaceClient.findUnique({
    where: { workspaceId_slug: { workspaceId, slug } },
    select: { name: true },
  });

  if (!client) notFound();

  return <WikiWorkspace slug={slug} clientName={client.name} />;
}
