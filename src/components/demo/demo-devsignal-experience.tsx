import Link from "next/link";
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
      {/* Entry into the candidate-facing 8-step funnel (the /vet flow). */}
      <Link
        href="/demo/vet/demo-token-octocat"
        className="mb-6 flex items-center justify-between rounded-[10px] border border-[var(--brand-200)] bg-[var(--surface-brand)] px-5 py-4 transition hover:border-[var(--brand-300)]"
      >
        <div>
          <p className="widget-data-label text-[var(--brand-700)]">Candidate flow</p>
          <p className="mt-0.5 text-sm font-medium text-[var(--text-1)]">Walk the 8-step assessment as a candidate</p>
          <p className="text-sm text-[var(--text-3)]">
            Intake → GitHub → coding challenge → video → done. The coding challenge runs for real.
          </p>
        </div>
        <span className="font-mono text-sm text-[var(--brand-700)]">Open →</span>
      </Link>

      <DevSignalQueue />
    </DemoShell>
  );
}
