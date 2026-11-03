import type { Metadata } from "next";
import { DemoShell } from "@/components/demo/demo-shell";
import { MonitorsWorkspace } from "@/components/monitors/monitors-workspace";

export const metadata: Metadata = {
  title: "Foundry — Monitors demo",
  robots: { index: false, follow: false },
};

/**
 * The real Monitors page (/app/monitors), fed by the demo interceptor: no sign-in, no database.
 * It exists so the page and its Add monitor popup can be checked in a browser, since /app is
 * auth-gated with no staging.
 */
export default function DemoMonitorsPage() {
  return (
    <DemoShell active="Monitors" title="Monitors" subtitle="Every client's uptime, in one place.">
      <MonitorsWorkspace />
    </DemoShell>
  );
}
