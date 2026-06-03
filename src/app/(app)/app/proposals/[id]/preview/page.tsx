/**
 * Legacy route → canonical /app/docs/[id]/preview.
 */
import { redirect } from "next/navigation";

export default async function LegacyProposalPreviewRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/app/docs/${id}/preview`);
}
