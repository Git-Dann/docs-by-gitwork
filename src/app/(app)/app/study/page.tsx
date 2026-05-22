import { AppShell } from "@/components/app-shell";
import { StudyList } from "@/components/study/study-list";

export default function StudyPage() {
  return (
    <AppShell
      title="Study"
      subtitle="AI-powered user research — interview personas, capture insights, synthesise reports."
    >
      <StudyList />
    </AppShell>
  );
}
