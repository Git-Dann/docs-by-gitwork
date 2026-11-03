import { Suspense } from "react";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { findSessionMembership } from "@/server/auth/home-membership";
import { isSuperAdmin } from "@/types/auth";
import { AppShell } from "@/components/app-shell";
import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  // Resolve role live from the DB (matches the Settings super-admin gate) rather than the JWT.
  const session = await auth();
  const sessionUser = session?.user;
  // The workspace this session is signed in to (src/server/auth/home-membership.ts).
  const member = await findSessionMembership(sessionUser);
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
