"use client";

/**
 * Standalone Foundry Studio demo (`/demo/studio`). Renders the real `StudioRoot` — the on-brand
 * social-asset creator — inside the demo shell. StudioRoot is fully client-side (presets +
 * localStorage, no API/session), so it needs no demo data or interceptor. No auth, no database.
 */

import { StudioRoot } from "@/components/studio/studio-root";
import { DemoShell } from "@/components/demo/demo-shell";

export function DemoStudioExperience() {
  return (
    <DemoShell
      active="Studio"
      title="Studio"
      subtitle="Create on-brand social assets — carousels, banners, posts and avatars."
    >
      <StudioRoot />
    </DemoShell>
  );
}
