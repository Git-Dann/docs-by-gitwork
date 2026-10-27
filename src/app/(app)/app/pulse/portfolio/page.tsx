import { AppShell } from "@/components/app-shell";
import { InternalOnly } from "@/components/internal-only";
import { CodePortfolioView } from "@/components/pulse/code-portfolio";
import { PulseNav } from "@/components/pulse/pulse-nav";
import { PulseOverview } from "@/components/pulse/pulse-overview";

/**
 * Pulse → Portfolio: every measured repository, then the health of every scan in the
 * workspace. That second card is a workspace-wide roll-up, so it stays `InternalOnly` as it
 * was on the landing page; it comes LAST so a guest's numbering still runs 01–03.
 */
export default function CodePortfolioPage() {
  return (
    <AppShell title="Portfolio" subtitle="Every measured repository, and where the next days do the most good.">
      <PulseNav />
      <div className="space-y-6">
        <CodePortfolioView />
        <InternalOnly>
          <PulseOverview number="04" title="SCAN HEALTH" />
        </InternalOnly>
      </div>
    </AppShell>
  );
}
