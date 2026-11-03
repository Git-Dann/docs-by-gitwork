import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PulseReportView } from "@/components/pulse/pulse-report-view";
import { examplePulseReportScans } from "@/lib/demo/dev-demo-data";
import { EXAMPLE_REPORTS, exampleReport } from "@/lib/pulse-example-reports";
import type { PulseScanRecord } from "@/types/pulse";

/**
 * An example Pulse report: the real report design over example data. Linked from
 * /pulse/features, and the page its PDF is printed from. Not indexed.
 */

// The demo data is dated relative to "now", so rebuild daily rather than freezing it.
export const revalidate = 86400;

export function generateStaticParams() {
  return EXAMPLE_REPORTS.map((r) => ({ id: r.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const report = exampleReport(id);
  return {
    title: report ? `Example Pulse report (${report.label.toLowerCase()}) · Gitwork` : "Example report",
    robots: { index: false, follow: false },
  };
}

export default async function ExampleReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!exampleReport(id)) notFound();
  const scan = examplePulseReportScans()[id] as PulseScanRecord | undefined;
  if (!scan) notFound();
  return <PulseReportView scan={scan} example />;
}
