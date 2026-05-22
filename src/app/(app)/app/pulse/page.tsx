import { AppShell } from "@/components/app-shell";
import { PulseWorkspace } from "@/components/foundry/pulse-workspace";

export default function PulsePage() {
  return (
    <AppShell
      title="Pulse"
      subtitle="Delivery health from updates, blockers, cadence, and integration signals."
    >
      <PulseWorkspace />
    </AppShell>
  );
}
