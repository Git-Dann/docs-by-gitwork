import type { Metadata } from "next";
import { DemoShell } from "@/components/demo/demo-shell";
import { MoneyWorkspace } from "@/components/money/money-workspace";

export const metadata: Metadata = {
  title: "Foundry — Money demo",
  robots: { index: false, follow: false },
};

/** The real Money page (/app/money) on invented figures, so it can be checked in a browser. */
export default function DemoMoneyPage() {
  return (
    <DemoShell active="Foundry HQ" title="Money" subtitle="Revenue under contract, what's still to bill, and what's in the pipeline.">
      <MoneyWorkspace />
    </DemoShell>
  );
}
