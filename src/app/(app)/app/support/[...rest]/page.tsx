import { redirect } from "next/navigation";
import { legacySupportRedirect } from "@/lib/care-links";

/**
 * Any other path under the retired /app/support dashboard. It never had more than the two pages
 * beside this one, but a hand-typed or truncated link should still land somewhere real, so it is
 * treated like the bare /app/support: its query is translated and carried across into Care.
 */
export default async function SupportCatchAllRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(legacySupportRedirect(await searchParams));
}
