import type { Metadata } from "next";
import { DemoBackstageExperience } from "@/components/demo/demo-backstage-experience";

export const metadata: Metadata = {
  title: "Foundry — Backstage demo",
  robots: { index: false, follow: false },
};

export default function DemoBackstagePage() {
  return <DemoBackstageExperience />;
}
