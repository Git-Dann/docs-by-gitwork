import type { Metadata } from "next";
import { DemoCommitmentsExperience } from "@/components/demo/demo-commitments-experience";

export const metadata: Metadata = {
  title: "Foundry — Commitments demo",
  robots: { index: false, follow: false },
};

export default function DemoCommitmentsPage() {
  return <DemoCommitmentsExperience />;
}
