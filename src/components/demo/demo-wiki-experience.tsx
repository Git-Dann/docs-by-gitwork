"use client";

/**
 * Standalone Foundry client-wiki demo (`/demo/wiki`). Renders the real internal
 * `WikiWorkspace` FULL-SCREEN — exactly as production does (the real wiki page
 * renders <WikiWorkspace> directly, NOT inside the app sidebar). So we use the
 * chrome-less `DemoProviders`, not `DemoShell`. Fed by the demo fetch interceptor
 * (GET /api/clients/{slug}/wiki → canned WikiDTO). No auth, no database.
 */

import { WikiWorkspace } from "@/components/clients/wiki/wiki-workspace";
import { DemoProviders } from "@/components/demo/demo-providers";

// Must match the wiki client seeded in dev-demo-data.ts (Northwind Studio).
const DEMO_SLUG = "northwind";
const DEMO_CLIENT = "Northwind Studio";

export function DemoWikiExperience() {
  return (
    <DemoProviders>
      <WikiWorkspace slug={DEMO_SLUG} clientName={DEMO_CLIENT} />
    </DemoProviders>
  );
}
