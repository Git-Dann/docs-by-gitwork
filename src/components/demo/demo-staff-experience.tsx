"use client";

/**
 * Demo of Staff → People (`/demo/staff`): the real `StaffRoster`, fed by the DemoShell
 * interceptor (src/lib/demo/demo-staff.ts). No auth, no database. /app is auth-gated
 * with no staging, so this is where the roster can be checked in a browser.
 */

import { DemoShell } from "@/components/demo/demo-shell";
import { StaffRoster } from "@/components/staff/staff-roster";

export function DemoStaffExperience() {
  return (
    <DemoShell active="Staff" title="Staff" subtitle="Everyone on the team: roles, departments and the clients they're on.">
      <StaffRoster basePath="/demo/staff" />
    </DemoShell>
  );
}
