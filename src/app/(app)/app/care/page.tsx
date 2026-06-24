import { AppShell } from "@/components/app-shell";
import { CareWorkspace } from "@/components/care/care-workspace";

export default function CarePage() {
  return (
    <AppShell
      title="Care"
      subtitle="Monitor, triage and route support across every client channel."
      mainClassName="flex min-h-0 flex-1 overflow-hidden p-0"
    >
      <CareWorkspace />
    </AppShell>
  );
}
