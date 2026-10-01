import { AppShell } from "@/components/app-shell";
import { CodeClearArchivedWorkspace } from "@/components/codeclear/codeclear-archived-workspace";

export const dynamic = "force-dynamic";

export default function CodeClearArchivedPage() {
  return (
    <AppShell title="Code" subtitle="Developers whose Foundry access has been removed.">
      <CodeClearArchivedWorkspace />
    </AppShell>
  );
}
