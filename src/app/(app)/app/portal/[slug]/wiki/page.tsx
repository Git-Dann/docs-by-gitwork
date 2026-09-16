import type { Metadata } from "next";
import { getClientNameBySlug } from "@/server/clients";
import { pageMetadataTitle } from "@/lib/page-title";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { WikiWorkspace } from "@/components/clients/wiki/wiki-workspace";
import { notFound } from "next/navigation";

/**
 * Names the tab after the CLIENT, not just the feature — with several client tabs
 * open, "Wiki · Foundry" four times over is what made them indistinguishable.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const name = await getClientNameBySlug(slug);
  return { title: pageMetadataTitle("Wiki", name) };
}

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
