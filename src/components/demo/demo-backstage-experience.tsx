"use client";

/**
 * Standalone Foundry Backstage demo (`/demo/backstage`) — calendar only. Renders
 * the real `CalendarTab` (team leave calendar), seeded via the DemoShell
 * interceptor with a few approved leave entries. No auth, no database.
 */

import { CalendarTab } from "@/components/backstage/calendar-tab";
import { DemoShell } from "@/components/demo/demo-shell";

export function DemoBackstageExperience() {
  return (
    <DemoShell
      active="Backstage"
      title="Backstage"
      subtitle="Team leave calendar — who's off, and when."
    >
      <CalendarTab number="01" />
    </DemoShell>
  );
}
