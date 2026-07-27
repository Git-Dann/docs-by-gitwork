/**
 * Legacy route — see the sibling list page. Preserves the slug so an old bookmark or
 * Slack link lands on the same client, now with the tasks / wiki / design-system tabs
 * this copy never had.
 */
import { redirect } from "next/navigation";

export default async function LegacyClientDetailRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/app/portal/${slug}`);
}
