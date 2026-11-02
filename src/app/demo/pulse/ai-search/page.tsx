import type { Metadata } from "next";
import { DemoShell } from "@/components/demo/demo-shell";
import { DemoPulseNav } from "@/components/demo/demo-pulse-nav";
import { AiSearchView } from "@/components/pulse/ai-search";

export const metadata: Metadata = { title: "Foundry — Pulse AI search demo", robots: { index: false, follow: false } };

/** Public demo of Pulse → AI search, fed by the demo interceptor (no Google calls). */
export default function DemoPulseAiSearchPage() {
  return (
    <DemoShell active="Pulse" title="AI search" subtitle="How buyers find Gitwork on Google and through AI assistants.">
      <DemoPulseNav />
      <AiSearchView />
    </DemoShell>
  );
}
