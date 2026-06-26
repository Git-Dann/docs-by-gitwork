// Legacy redirect — old shares were minted as /wiki/<token> (no slug). Resolve the
// token and 307 to the clean /wiki/<slug>/<token> form so existing links keep
// working. (The dynamic segment is named [slug] to share a name with the canonical
// two-segment route; here it actually holds the share token.)

import { notFound, redirect } from "next/navigation";
import { resolvePublicWiki } from "@/server/wiki";

export default async function LegacyWikiRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: token } = await params;
  const resolved = await resolvePublicWiki(token);
  if (!resolved) notFound();
  redirect(`/wiki/${resolved.wiki.clientSlug}/${token}`);
}
