import Link from "next/link";
import { DemoShell, DemoSectionHeading } from "@/components/demo/demo-shell";
import { DevSignalQueue } from "@/components/codeclear/devsignal/devsignal-queue";

const PIPELINE_STEPS = [
  {
    n: "01",
    label: "Automated signal",
    body: "GitHub history, code quality, and delivery readiness are scored the moment a candidate applies — no one's time spent yet.",
  },
  {
    n: "02",
    label: "Timed challenge + video",
    body: "A real coding challenge under time pressure, plus a short video screen, both scored automatically against the same rubric.",
  },
  {
    n: "03",
    label: "Human gate",
    body: "Only a person can promote a candidate into Code. The score informs the call; it never makes it — nothing ships without sign-off.",
  },
] as const;

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
      {/* Value framing: why this exists, before the ops-facing queue below. */}
      <div className="mb-6">
        <DemoSectionHeading number="00" label="How DevSignal vets a candidate" />
        <div className="grid gap-3 sm:grid-cols-3">
          {PIPELINE_STEPS.map((s) => (
            <div key={s.n} className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] p-4">
              <p className="widget-data-label text-[var(--brand-700)]">
                <span className="text-[var(--text-4)]">{s.n}</span> {s.label}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-3)]">{s.body}</p>
            </div>
          ))}
        </div>
      </div>

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
