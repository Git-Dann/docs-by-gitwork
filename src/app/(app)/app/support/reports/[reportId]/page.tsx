import { redirect } from "next/navigation";
import { legacyReportRedirect } from "@/lib/care-links";

/** Monthly report links from before Care was one UI. The report now lives at /app/care/reports/[id]. */
export default async function SupportReportRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ reportId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { reportId } = await params;
  redirect(legacyReportRedirect(reportId, await searchParams));
}
