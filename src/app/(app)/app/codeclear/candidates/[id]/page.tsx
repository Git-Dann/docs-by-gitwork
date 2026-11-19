import { redirect } from "next/navigation";
import { withSearch, type SearchParamsRecord } from "@/lib/legacy-redirect";

/** Legacy path (CLAUDE.md §87): the page moved under /app/staff. Kept so old links, notifications and bookmarks still land, query string included. */
export default async function LegacyCandidateRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParamsRecord>;
}) {
  const { id } = await params;
  redirect(withSearch(`/app/staff/hiring/candidates/${encodeURIComponent(id)}`, await searchParams));
}
