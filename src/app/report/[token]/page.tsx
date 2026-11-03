import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { serializePulseScan, pulseInclude } from "@/server/pulse";
import { parseWorkspaceBranding } from "@/server/documents";
import type { PulseScanRecord } from "@/types/pulse";
import { PulseReportView } from "@/components/pulse/pulse-report-view";

// A shared report is immutable once the scan completes, so it's cached per token
// (tag `pulse-report-<token>`). The share/unshare route revalidates that tag, and
// a 5-min TTL bounds staleness if a revalidate is ever missed — so an un-shared
// link stops resolving promptly instead of re-querying the DB on every hit.
const loadSharedReport = (token: string): Promise<PulseScanRecord | null> =>
  unstable_cache(
    async () => {
      const record = await prisma.pulseScan.findUnique({
        where: { shareToken: token, isShared: true },
        include: pulseInclude,
      });
      return record ? serializePulseScan(record) : null;
    },
    ["pulse-report", token],
    { tags: [`pulse-report-${token}`], revalidate: 300 },
  )();

// ─── Metadata ───────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const scan = await loadSharedReport(token);
  // Share links are private — never let them get indexed.
  const robots = { index: false, follow: false } as const;
  if (!scan) return { title: "Report not found — Gitwork Pulse", robots };
  return {
    title: `${scan.projectName} — Gitwork Pulse Report`,
    description: `Technical audit for ${scan.projectName}. Health score: ${scan.healthScore ?? "—"}/100. Powered by Gitwork Pulse.`,
    robots,
  };
}

export default async function PublicReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!token || token.length < 20) notFound();

  const scan = await loadSharedReport(token);
  if (!scan) notFound();

  // Brand the cover (+ the PDF, which renders this page) with the workspace logo if set.
  const ws = await prisma.workspace.findFirst({ select: { branding: true } });
  const brandLogoUrl = (parseWorkspaceBranding(ws?.branding).brandLogoUrl ?? "").trim() || undefined;

  return <PulseReportView scan={scan} brandLogoUrl={brandLogoUrl} />;
}
