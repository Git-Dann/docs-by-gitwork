import { AppShell } from "@/components/app-shell";
import { StudyDetail } from "@/components/study/study-detail";

export default async function StudyDetailPage({ params }: { params: Promise<{ studyId: string }> }) {
  const { studyId } = await params;
  return (
    <AppShell title="Study">
      <StudyDetail studyId={studyId} />
    </AppShell>
  );
}
