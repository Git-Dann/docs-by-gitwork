"use client";

/**
 * Standalone Foundry Docs demo (`/demo/docs`). Renders the real `ProposalList`,
 * seeded (via the DemoShell interceptor) with only the developer-visible doc
 * types — Handovers, Reports, Briefs, Notes. No auth, no database.
 */

import { ProposalList } from "@/components/proposals/proposal-list";
import { DemoShell } from "@/components/demo/demo-shell";

export function DemoDocsExperience() {
  return (
    <DemoShell
      active="Docs"
      title="Docs"
      subtitle="Handovers, reports and briefs — the documents a developer works with."
    >
      <ProposalList />
    </DemoShell>
  );
}
