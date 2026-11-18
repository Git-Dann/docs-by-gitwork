import type { Metadata } from "next";
import { DemoHq } from "@/components/demo/demo-hq";

export const metadata: Metadata = {
  title: "Foundry — HQ demo",
  robots: { index: false, follow: false },
};

/**
 * Public, no-auth demo of Foundry HQ as an admin sees it: the today band, On your desk,
 * the daily roll-up and the module tiles. Sample data from the demo interceptor.
 */
export default function DemoHqPage() {
  return <DemoHq />;
}
