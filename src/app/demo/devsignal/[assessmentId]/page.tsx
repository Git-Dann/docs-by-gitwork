import type { Metadata } from "next";
import { DemoDevSignalDetailExperience } from "@/components/demo/demo-devsignal-detail-experience";

export const metadata: Metadata = {
  title: "Foundry — DevSignal demo",
  robots: { index: false, follow: false },
};

export default async function DemoDevSignalAssessmentPage({
  params,
}: {
  params: Promise<{ assessmentId: string }>;
}) {
  const { assessmentId } = await params;
  return <DemoDevSignalDetailExperience id={assessmentId} />;
}
