import { DemoShell } from "@/components/demo/demo-shell";
import { DevSignalQueue } from "@/components/codeclear/devsignal/devsignal-queue";

/**
 * Public, no-auth demo of the DevSignal vetting queue. Real components, fed by
 * the demo `/api/*` interceptor — no DB, no login, no side effects. Click a
 * candidate row to open the assessment detail (rerouted to /demo/devsignal/[id]).
 */
export function DemoDevSignalExperience() {
  return (
    <DemoShell
      active="Code"
      title="Code"
      subtitle="Developer vetting — assess candidates, then promote the right ones into Code."
    >
      <DevSignalQueue />
    </DemoShell>
  );
}
