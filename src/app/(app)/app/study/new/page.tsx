import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { StudyWizard } from "@/components/study/study-wizard";

export default function NewStudyPage() {
  return (
    <AppShell title="New Study" subtitle="Define your research brief and select personas.">
      <Suspense fallback={null}>
        <StudyWizard />
      </Suspense>
    </AppShell>
  );
}
