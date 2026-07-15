import type { Metadata } from "next";
import { DemoPulse } from "@/components/demo/demo-pulse";

export const metadata: Metadata = {
  title: "Foundry — Pulse demo",
  robots: { index: false, follow: false },
};

/**
 * Public, no-auth demo of Pulse — the AI project-validation module. Lists sample
 * scans; each opens a full report at /demo/pulse/[scanId]. Data is served by the
 * client-side interceptor (see `DemoPulse` / `DemoShell`).
 */
export default function DemoPulsePage() {
  return <DemoPulse />;
}
