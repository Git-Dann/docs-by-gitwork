import type { Metadata } from "next";
import { DemoPlatformExperience } from "@/components/demo/demo-platform-experience";

export const metadata: Metadata = {
  title: "Foundry — Platform console demo",
  robots: { index: false, follow: false },
};

export default function DemoPlatformPage() {
  return <DemoPlatformExperience />;
}
