import { AppShell } from "@/components/app-shell";
import { DocsWorkspace } from "@/components/foundry/docs-workspace";

export default function DocsPage() {
  return (
    <AppShell
      title="Docs"
      subtitle="Templates and generated outputs linked back to projects, milestones, and approvals."
    >
      <DocsWorkspace />
    </AppShell>
  );
}
