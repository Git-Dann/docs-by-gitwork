import { redirect } from "next/navigation";
import { legacySupportRedirect } from "@/lib/care-links";

/**
 * The legacy Care dashboard lived here. Care is one UI at /app/care now (CLAUDE.md §42.16), so this
 * is a redirect that keeps every old link working: `?client=…&tab=…&panel=…` is translated to the
 * matching Care section, and any other query parameter is carried across.
 */
export default async function SupportRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(legacySupportRedirect(await searchParams));
}
