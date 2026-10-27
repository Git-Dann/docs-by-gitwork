import { AppShell } from "@/components/app-shell";
import { PulseNav } from "@/components/pulse/pulse-nav";
import { PulseComparePage } from "@/components/pulse/pulse-projects";

/** Compare any two scans: ?from=<earlier scanId>&to=<later scanId>. */
export default async function PulseCompareRoute({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { from = "", to = "" } = await searchParams;
  return (
    <AppShell title="Compare scans" subtitle="What got fixed, what is new and what got worse between two scans.">
      <PulseNav />
      <PulseComparePage from={from} to={to} />
    </AppShell>
  );
}
