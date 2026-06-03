/**
 * Legacy route → canonical /app/docs/[id]. Kept as a redirect so old Slack/email deep links
 * (which can't be edited retroactively) still resolve.
 */
import { redirect } from "next/navigation";

export default async function LegacyProposalEditorRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/app/docs/${id}`);
}
