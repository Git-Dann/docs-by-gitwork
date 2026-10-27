"use client";

import { AppShell } from "@/components/app-shell";
import { PulseNav } from "@/components/pulse/pulse-nav";
import { PulseEmbedSettings } from "@/components/pulse/pulse-embed-settings";

/**
 * Settings for the public embed, reached from Pulse → Growth (the nav marks Growth as the
 * current page here). Internal-only: `/app/pulse/embed` is in INTERNAL_ONLY_PREFIXES.
 */
export default function PulseEmbedSettingsPage() {
  return (
    <AppShell
      title="Public embed"
      subtitle="Settings for the /embed/pulse widget used on gitwork.co.uk."
      hideContentHeader={true}
    >
      <PulseNav />
      <PulseEmbedSettings />
    </AppShell>
  );
}
