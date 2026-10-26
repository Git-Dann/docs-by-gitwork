import type { Metadata } from "next";
import { DemoShell } from "@/components/demo/demo-shell";
import { PulseProjectPage } from "@/components/pulse/pulse-projects";

export const metadata: Metadata = { title: "Foundry — Pulse project demo", robots: { index: false, follow: false } };

/** Public demo of a Pulse project's history page, fed by the demo interceptor. */
export default async function DemoPulseProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <DemoShell active="Pulse" title="Project history" subtitle="Every scan of this project, how it is trending, and what changed.">
      <PulseProjectPage slug={slug} />
    </DemoShell>
  );
}
