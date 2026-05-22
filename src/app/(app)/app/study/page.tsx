import { AppShell } from "@/components/app-shell";
import { ModulePlaceholder } from "@/components/foundry/module-placeholder";

export default function StudyPage() {
  return (
    <AppShell
      title="Study"
      subtitle="Research, validation, interviews, and insight trails that feed project decisions and docs."
    >
      <ModulePlaceholder
        moduleName="Study"
        eyebrow="Research"
        summary="Study should capture raw research and distil it into insights that link straight into project scope, delivery decisions, and document generation."
        nextSteps={[
          "Persist interviews, survey summaries, and validation notes as project-linked research records.",
          "Link insights to decisions, risks, and documents rather than leaving them as isolated notes.",
          "Use the existing Proof workspace as a precursor, not as a separate top-level product direction.",
        ]}
      />
    </AppShell>
  );
}
