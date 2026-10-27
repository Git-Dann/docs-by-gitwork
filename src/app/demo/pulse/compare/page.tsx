import type { Metadata } from "next";
import { DemoShell } from "@/components/demo/demo-shell";
import { DemoPulseNav } from "@/components/demo/demo-pulse-nav";
import { PulseComparePage } from "@/components/pulse/pulse-projects";

export const metadata: Metadata = { title: "Foundry — Pulse compare demo", robots: { index: false, follow: false } };

/** Public demo of comparing two Pulse scans. */
export default async function DemoPulseComparePage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { from = "", to = "" } = await searchParams;
  return (
    <DemoShell active="Pulse" title="Compare scans" subtitle="What got fixed, what is new and what got worse between two scans.">
      <DemoPulseNav />
      <PulseComparePage from={from} to={to} />
    </DemoShell>
  );
}
