import type { Metadata } from "next";
import { DemoStaffExperience } from "@/components/demo/demo-staff-experience";

export const metadata: Metadata = {
  title: "Foundry — Staff demo",
  robots: { index: false, follow: false },
};

export default function DemoStaffPage() {
  return <DemoStaffExperience />;
}
