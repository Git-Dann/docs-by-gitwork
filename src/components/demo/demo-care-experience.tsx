"use client";

/**
 * Standalone Foundry Care demo (`/demo/care`). Renders the real `CareWorkspace`
 * (client support triage), seeded via the DemoShell interceptor with a couple of
 * clients and sample conversations. No auth, no database.
 */

import { CareWorkspace } from "@/components/care/care-workspace";
import { DemoShell } from "@/components/demo/demo-shell";

export function DemoCareExperience() {
  return (
    <DemoShell
      active="Care"
      title="Care"
      subtitle="Client support — triage conversations from every channel in one place."
    >
      <CareWorkspace />
    </DemoShell>
  );
}
