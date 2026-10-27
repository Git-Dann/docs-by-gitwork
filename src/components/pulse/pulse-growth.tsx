"use client";

import { PulseSalesPagePanel } from "@/components/pulse/pulse-sales-page-panel";
import { PulseEmbedTopCard } from "@/components/pulse/pulse-embed-panel";
import { PulseAboutPanel } from "@/components/pulse/pulse-about-panel";
import { PulseLeadsPanel } from "@/components/pulse/pulse-leads-panel";

/**
 * Pulse → Growth, shared by the app page and the demo: the two doors to the public scanner
 * (the sales page gitwork.co.uk links to, and the widget dropped into someone else's page),
 * the shareable About Pulse page, then the leads they captured.
 *
 * Internal-only content; the CALLER wraps it (`InternalOnly` in the app) — see the page.
 */
export function PulseGrowthView({ checks, areas }: { checks: number; areas: number }) {
  return (
    <div className="space-y-6">
      <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
        <PulseSalesPagePanel number="01" />
        <PulseEmbedTopCard number="02" />
        <PulseAboutPanel number="03" checks={checks} areas={areas} />
      </div>
      <PulseLeadsPanel number="04" />
    </div>
  );
}
