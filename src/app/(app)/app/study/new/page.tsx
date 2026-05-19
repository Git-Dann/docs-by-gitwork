import { AppShell } from "@/components/app-shell";
import { StudyWizard } from "@/components/study/study-wizard";

export default function NewStudyPage() {
  return (
    <AppShell title="New Study" subtitle="Define your research brief and select personas.">
      <StudyWizard />
    </AppShell>
  );
}
