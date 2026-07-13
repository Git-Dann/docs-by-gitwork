"use client";

import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { AppShell } from "@/components/app-shell";
import { PulseEmbedSettings } from "@/components/pulse/pulse-embed-settings";

export default function PulseEmbedSettingsPage() {
  return (
    <AppShell
      title="Public embed"
      subtitle="Settings for the free /embed/pulse widget used on gitwork.co.uk."
      hideContentHeader={true}
    >
      <div className="space-y-6">
        <Link
          href="/app/pulse"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-3)] hover:text-[var(--text-1)]"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Pulse
        </Link>

        <PulseEmbedSettings />
      </div>
    </AppShell>
  );
}
