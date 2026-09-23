"use client";

/**
 * Standalone demo of the client summary board (`/demo/summary`). Renders the real
 * `ClientSummaryBoardView` against the DemoShell interceptor — no auth, no database.
 *
 * It exists because `/app/portal/summary` is auth-gated with no staging, so this is
 * the only place the board can be driven in a browser before it ships.
 */

import { ClientSummaryBoardView } from "@/components/clients/client-summary-board";
import { DemoShell } from "@/components/demo/demo-shell";

export function DemoSummaryExperience() {
  return (
    <DemoShell
      active="Portal"
      title="Client summary"
      subtitle="Every client on one board — what moved this week, what needs looking at."
    >
      <ClientSummaryBoardView />
    </DemoShell>
  );
}
