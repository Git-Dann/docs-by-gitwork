import type { Metadata } from "next";
import { DemoPulseReport } from "@/components/demo/demo-pulse-report";

export const metadata: Metadata = {
  title: "Foundry — Pulse report demo",
  robots: { index: false, follow: false },
};

/**
 * Public, no-auth demo of a Pulse scan report. The scanId maps to a seeded scan
 * in the demo interceptor (scan-northwind / scan-cadenza / scan-fairway).
 */
export default async function DemoPulseReportPage({
  params,
}: {
  params: Promise<{ scanId: string }>;
}) {
  const { scanId } = await params;
  return <DemoPulseReport scanId={scanId} />;
}
