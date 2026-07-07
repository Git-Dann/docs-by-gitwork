import { AppShell } from "@/components/app-shell";
import { DevSignalQueue } from "@/components/codeclear/devsignal/devsignal-queue";

export default function DevSignalPage() {
  return (
    <AppShell
      title="DevSignal"
      subtitle="Developer vetting — assess candidates, then promote the right ones into Code."
    >
      <DevSignalQueue />
    </AppShell>
  );
}
