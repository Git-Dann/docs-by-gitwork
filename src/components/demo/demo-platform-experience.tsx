"use client";

/**
 * Demo of the Platform console (`/demo/platform`) — the real `PlatformConsole`, fed by
 * the DemoShell interceptor (src/lib/demo/demo-platform.ts). No auth, no database.
 * It exists so the console can be checked in a browser: /app is auth-gated with no
 * staging environment.
 */

import { PlatformConsole } from "@/components/platform/platform-console";
import { DemoShell } from "@/components/demo/demo-shell";

export function DemoPlatformExperience() {
  return (
    <DemoShell active="Platform" title="Platform" subtitle="Every business on Foundry, and what each one has.">
      <PlatformConsole />
    </DemoShell>
  );
}
