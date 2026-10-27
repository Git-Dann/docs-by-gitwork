import type { Metadata } from "next";
import { DemoShell } from "@/components/demo/demo-shell";
import { DemoPulseNav } from "@/components/demo/demo-pulse-nav";
import { PulseMonitorsPanel } from "@/components/pulse/pulse-monitors-panel";

export const metadata: Metadata = { title: "Foundry — Pulse monitors demo", robots: { index: false, follow: false } };

/** Public demo of Pulse → Monitors, fed by the demo interceptor. */
export default function DemoPulseMonitorsPage() {
  return (
    <DemoShell active="Pulse" title="Monitors" subtitle="Projects Pulse re-scans on a schedule, and who hears about it.">
      <DemoPulseNav />
      <PulseMonitorsPanel number="01" />
    </DemoShell>
  );
}
