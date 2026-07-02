"use client";

/**
 * Standalone Foundry client-wiki demo (`/demo/wiki`). Renders the real internal
 * `WikiWorkspace` for a sample client, fed by the demo fetch interceptor in
 * `DemoShell` (GET /api/clients/{slug}/wiki → canned WikiDTO). No auth, no
 * database. See `src/lib/demo/dev-demo-data.ts`.
 */

import { WikiWorkspace } from "@/components/clients/wiki/wiki-workspace";
import { DemoShell } from "@/components/demo/demo-shell";

// Must match the wiki client seeded in dev-demo-data.ts (Northwind Studio).
const DEMO_SLUG = "northwind";
const DEMO_CLIENT = "Northwind Studio";

export function DemoWikiExperience() {
  return (
    <DemoShell
      active="Portal"
      title={DEMO_CLIENT}
      subtitle="Client wiki — docs, changelog, timeline, monitors & status."
    >
      <WikiWorkspace slug={DEMO_SLUG} clientName={DEMO_CLIENT} />
    </DemoShell>
  );
}
