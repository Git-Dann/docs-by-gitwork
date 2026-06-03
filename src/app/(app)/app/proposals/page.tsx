/**
 * Legacy route. The Docs module canonicalised on /app/docs (matching the sidebar nav and the
 * "Docs" rename). This stub redirects so any old bookmarks / deep links keep working.
 */
import { redirect } from "next/navigation";

export default function LegacyProposalsListRedirect() {
  redirect("/app/docs");
}
