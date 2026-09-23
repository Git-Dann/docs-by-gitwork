import type { Metadata } from "next";
import { DemoSummaryExperience } from "@/components/demo/demo-summary-experience";

export const metadata: Metadata = {
  title: "Foundry — Client summary demo",
  robots: { index: false, follow: false },
};

export default function DemoSummaryPage() {
  return <DemoSummaryExperience />;
}
