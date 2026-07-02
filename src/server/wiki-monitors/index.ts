// Connector registry — the single place that knows every monitor type. To add a
// new connector: implement MonitorConnector in this folder and register it here.

import type { WikiMonitor } from "@prisma/client";
import type { MonitorConnector, MonitorProbeResult } from "./types";
import { httpConnector } from "./http";
import { tcpConnector } from "./tcp";

export type { MonitorConnector, MonitorProbeResult, MonitorStatus } from "./types";

const CONNECTORS: Record<string, MonitorConnector> = {
  [httpConnector.key]: httpConnector,
  [tcpConnector.key]: tcpConnector,
};

/** Type metadata for the UI's "add monitor" picker (key, label, hint). */
export const MONITOR_CONNECTORS = Object.values(CONNECTORS).map((c) => ({
  key: c.key,
  label: c.label,
  targetHint: c.targetHint,
}));

/** Run the connector for a monitor's type. Unknown type → UNKNOWN result. */
export async function runProbe(monitor: WikiMonitor): Promise<MonitorProbeResult> {
  const connector = CONNECTORS[monitor.type];
  if (!connector) {
    return { status: "UNKNOWN", latencyMs: null, statusCode: null, error: `No connector for type ${monitor.type}` };
  }
  return connector.run(monitor);
}
