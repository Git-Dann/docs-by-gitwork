import { redirect } from "next/navigation";
import { withSearch, type SearchParamsRecord } from "@/lib/legacy-redirect";

/**
 * The old Staff → Archived tab. Everyone who has left, developers included, is now under
 * Staff → People → Archived (docs/hr-platform.md), so old links land there.
 */
export default async function CodeClearArchivedPage({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  redirect(withSearch("/app/staff?view=archived", await searchParams));
}
