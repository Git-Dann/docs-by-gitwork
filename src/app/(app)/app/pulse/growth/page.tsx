import { AppShell } from "@/components/app-shell";
import { InternalOnly } from "@/components/internal-only";
import { PulseNav } from "@/components/pulse/pulse-nav";
import { PulseGrowthView } from "@/components/pulse/pulse-growth";
import { pulseCapabilityCounts } from "@/server/pulse-capabilities";

/**
 * Pulse → Growth: how the outside world reaches Pulse, and who it brought in.
 *
 * ⚠️ Everything here is about GITWORK, not the signed-in user: our sales page, our public
 * embed, the shareable About Pulse page and a table of captured email addresses. It is
 * internal-only twice over, as it was on the landing page: `/app/pulse/growth` is in
 * INTERNAL_ONLY_PREFIXES, and the content sits inside `InternalOnly`.
 */
export default function PulseGrowthPage() {
  const { checks, areas } = pulseCapabilityCounts();
  return (
    <AppShell title="Growth" subtitle="The sales page, the public embed and the leads they bring in.">
      <PulseNav />
      <InternalOnly>
        <PulseGrowthView checks={checks} areas={areas.length} />
      </InternalOnly>
    </AppShell>
  );
}
