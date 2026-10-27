import type { Metadata } from "next";
import { DemoShell } from "@/components/demo/demo-shell";
import { DemoPulseNav } from "@/components/demo/demo-pulse-nav";
import { PulseGrowthView } from "@/components/pulse/pulse-growth";
import { pulseCapabilityCounts } from "@/server/pulse-capabilities";

export const metadata: Metadata = { title: "Foundry — Pulse growth demo", robots: { index: false, follow: false } };

/** Public demo of Pulse → Growth (sales page, embed, About Pulse, leads), fed by the demo interceptor. */
export default function DemoPulseGrowthPage() {
  const { checks, areas } = pulseCapabilityCounts();
  return (
    <DemoShell active="Pulse" title="Growth" subtitle="The sales page, the public embed and the leads they bring in.">
      <DemoPulseNav />
      <PulseGrowthView checks={checks} areas={areas.length} />
    </DemoShell>
  );
}
