"use client";

/**
 * Standalone Foundry client-portal demo (`/demo/portal`). Renders the real
 * `ClientDetail` page for a sample client, fed by the demo fetch interceptor in
 * `DemoShell`. The wiki is reached exactly as in live — via the small "Wiki →"
 * link in the client header (DemoShell reroutes that /app link to /demo/wiki).
 * No auth, no database. See `src/lib/demo/dev-demo-data.ts`.
 */

import { ClientDetail } from "@/components/clients/client-detail";
import { DemoShell } from "@/components/demo/demo-shell";

// Must match the client seeded in dev-demo-data.ts (Northwind Studio).
const DEMO_SLUG = "northwind";

export function DemoClientPortal() {
  return (
    <DemoShell
      active="Portal"
      title="Portal"
      subtitle="Your clients — projects, platforms, designs and their knowledge wiki."
    >
      <ClientDetail slug={DEMO_SLUG} />
    </DemoShell>
  );
}
