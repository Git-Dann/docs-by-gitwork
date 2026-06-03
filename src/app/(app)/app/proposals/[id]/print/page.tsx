/**
 * Legacy route → canonical /app/docs/[id]/print.
 */
import { redirect } from "next/navigation";

export default async function LegacyProposalPrintRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/app/docs/${id}/print`);
}
