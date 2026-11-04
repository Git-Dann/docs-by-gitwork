"use client";

/**
 * Backstage → Commitments demo (`/demo/backstage/commitments`). The real `CommitmentsWorkspace`,
 * fed by `src/lib/demo/demo-commitments.ts` through the DemoShell interceptor. No auth, no database.
 */

import { CommitmentsWorkspace } from "@/components/backstage/commitments-workspace";
import { DemoShell } from "@/components/demo/demo-shell";

export function DemoCommitmentsExperience() {
  return (
    <DemoShell
      active="Backstage"
      title="Commitments"
      subtitle="What you've promised, from email, Slack, meetings and your own notes."
    >
      <CommitmentsWorkspace />
    </DemoShell>
  );
}
