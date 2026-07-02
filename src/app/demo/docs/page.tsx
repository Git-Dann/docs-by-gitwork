import type { Metadata } from "next";
import { DemoDocsExperience } from "@/components/demo/demo-docs-experience";

export const metadata: Metadata = {
  title: "Foundry — Docs demo",
  robots: { index: false, follow: false },
};

export default function DemoDocsPage() {
  return <DemoDocsExperience />;
}
