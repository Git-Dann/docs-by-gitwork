import type { Metadata } from "next";
import { DemoStudioExperience } from "@/components/demo/demo-studio-experience";

export const metadata: Metadata = {
  title: "Foundry — Studio demo",
  robots: { index: false, follow: false },
};

export default function DemoStudioPage() {
  return <DemoStudioExperience />;
}
