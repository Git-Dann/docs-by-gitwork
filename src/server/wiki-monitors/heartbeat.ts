// HEARTBEAT connector: nothing is fetched. The job pings /api/public/heartbeat/<token> each time
// it runs; this reads when it last did, and whether it said it failed (src/lib/monitor-expiry.ts).

import type { MonitorConnector } from "./types";
import { heartbeatStatus } from "@/lib/monitor-expiry";

export const heartbeatConnector: MonitorConnector = {
  key: "HEARTBEAT",
  label: "Heartbeat (cron / job)",
  targetHint: "The job calls the ping URL Foundry gives you each time it runs",
  async run(monitor) {
    const { status, error } = heartbeatStatus(monitor, new Date());
    return { status, latencyMs: null, statusCode: null, error };
  },
};
