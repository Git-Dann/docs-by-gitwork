import type { Metadata } from "next";
import { DemoShell } from "@/components/demo/demo-shell";
import { CodePortfolioView } from "@/components/pulse/code-portfolio";

export const metadata: Metadata = {
  title: "Foundry — Code portfolio demo",
  robots: { index: false, follow: false },
};

/** Public, no-auth demo of the code portfolio, fed by the demo fetch interceptor. Fictional repositories. */
export default function DemoCodePortfolioPage() {
  return (
    <DemoShell active="Pulse" title="Code portfolio" subtitle="Every measured repository, and where the next days do the most good.">
      <CodePortfolioView />
    </DemoShell>
  );
}
