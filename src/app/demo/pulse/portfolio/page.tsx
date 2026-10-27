import type { Metadata } from "next";
import { DemoShell } from "@/components/demo/demo-shell";
import { DemoPulseNav } from "@/components/demo/demo-pulse-nav";
import { CodePortfolioView } from "@/components/pulse/code-portfolio";
import { PulseOverview } from "@/components/pulse/pulse-overview";

export const metadata: Metadata = {
  title: "Foundry — Code portfolio demo",
  robots: { index: false, follow: false },
};

/** Public, no-auth demo of Pulse → Portfolio, fed by the demo fetch interceptor. Fictional repositories. */
export default function DemoCodePortfolioPage() {
  return (
    <DemoShell active="Pulse" title="Portfolio" subtitle="Every measured repository, and where the next days do the most good.">
      <DemoPulseNav />
      <div className="space-y-6">
        <CodePortfolioView />
        <PulseOverview number="04" title="SCAN HEALTH" />
      </div>
    </DemoShell>
  );
}
