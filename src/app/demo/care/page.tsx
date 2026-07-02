import type { Metadata } from "next";
import { DemoCareExperience } from "@/components/demo/demo-care-experience";

export const metadata: Metadata = {
  title: "Foundry — Care demo",
  robots: { index: false, follow: false },
};

export default function DemoCarePage() {
  return <DemoCareExperience />;
}
