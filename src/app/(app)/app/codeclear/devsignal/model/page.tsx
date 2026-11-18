import { redirect } from "next/navigation";
import { withSearch, type SearchParamsRecord } from "@/lib/legacy-redirect";

/** Legacy path (CLAUDE.md §87): the page moved under /app/staff. Kept so old links, notifications and bookmarks still land, query string included. */
export default async function LegacyModelRedirect({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  redirect(withSearch("/app/staff/hiring/devsignal/model", await searchParams));
}
