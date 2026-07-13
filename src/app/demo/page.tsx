import type { Metadata } from "next";
import { DemoHub } from "@/components/demo/demo-hub";

export const metadata: Metadata = {
  title: "Foundry — Demo",
  robots: { index: false, follow: false },
};

/**
 * Front door for the demo suite. The individual /demo/* pages were previously
 * only reachable by knowing the exact URL — this lists them all.
 */
export default function DemoHubPage() {
  return <DemoHub />;
}
