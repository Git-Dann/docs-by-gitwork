// Connector framework for wiki uptime monitors. Each connector knows how to probe
// one kind of target (HTTP, TCP, …) and returns a normalised result. Adding a new
// connector = implement MonitorConnector + register it in ./index.ts.

import type { WikiMonitor } from "@prisma/client";

export type MonitorStatus = "UP" | "DEGRADED" | "DOWN" | "UNKNOWN";

export interface MonitorProbeResult {
  status: MonitorStatus;
  /** Round-trip latency in ms, when measurable. */
  latencyMs: number | null;
  /** HTTP status code (HTTP connector only). */
  statusCode: number | null;
  /** Human-readable failure reason when not UP; null when healthy. */
  error: string | null;
}

export interface MonitorConnector {
  /** Matches WikiMonitorType. */
  key: string;
  /** Shown in the "add monitor" type picker. */
  label: string;
  /** One-line hint for the target field, e.g. "https://api.example.com/health". */
  targetHint: string;
  run(monitor: WikiMonitor): Promise<MonitorProbeResult>;
}
