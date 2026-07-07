import { AppShell } from "@/components/app-shell";
import { AssessmentDetail } from "@/components/codeclear/devsignal/assessment-detail";

export default async function DevSignalAssessmentPage({
  params,
}: {
  params: Promise<{ assessmentId: string }>;
}) {
  const { assessmentId } = await params;
  return (
    <AppShell title="DevSignal" subtitle="Assessment review">
      <AssessmentDetail id={assessmentId} />
    </AppShell>
  );
}
