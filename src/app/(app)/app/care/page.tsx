import { AppShell } from "@/components/app-shell";
import { ModulePlaceholder } from "@/components/foundry/module-placeholder";

export default function CarePage() {
  return (
    <AppShell
      title="Care"
      subtitle="Support backlog, SLA visibility, known issues, and post-launch reporting."
    >
      <ModulePlaceholder
        moduleName="Care"
        eyebrow="Aftercare"
        summary="Care becomes much simpler once support tickets, releases, monthly summaries, and client-visible updates all hang off the same project object."
        nextSteps={[
          "Introduce support tickets and retainers as first-class project-linked objects.",
          "Add monthly summary generation from support notes and release activity.",
          "Connect SLA status to response timestamps from the incoming support channel.",
        ]}
      />
    </AppShell>
  );
}
