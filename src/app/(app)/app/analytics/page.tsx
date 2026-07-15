import { Suspense } from "react";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { isSuperAdmin } from "@/types/auth";
import { AppShell } from "@/components/app-shell";
import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  // Resolve role live from the DB (matches the Settings super-admin gate) rather than the JWT.
  const session = await auth();
  await ensureBaseRecords();
  const sessionUser = session?.user;
  const member =
    sessionUser?.id || sessionUser?.email
      ? await prisma.workspaceMember.findFirst({
          where: {
            user: sessionUser.id ? { id: sessionUser.id } : { email: sessionUser.email! },
            workspace: { slug: DEFAULT_WORKSPACE_SLUG },
          },
          select: { role: true },
        })
      : null;
  const role = member?.role ?? sessionUser?.role ?? "";
  if (!isSuperAdmin(role)) notFound();

  return (
    <AppShell
      title="Analytics"
      subtitle="Delivery and output across the workspace — throughput, mix, and per-dev and per-client activity."
    >
      <Suspense fallback={<p className="text-sm text-[var(--text-3)]">Loading analytics…</p>}>
        <AnalyticsDashboard />
      </Suspense>
    </AppShell>
  );
}
