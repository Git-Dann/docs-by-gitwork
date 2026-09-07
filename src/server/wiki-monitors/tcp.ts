// TCP port connector — up when a TCP connection to host:port opens within the
// timeout (covers databases, SMTP, custom services). SSRF-guarded via
// assertPublicHost, then pinned to an approved address. Raw sockets work on the
// VPS runtime (not serverless).

import net from "node:net";
import type { WikiMonitor } from "@prisma/client";
import { assertPublicHost, UrlNotScannableError } from "@/server/pulse-lite/url-guard";
import type { MonitorConnector, MonitorProbeResult, MonitorStatus } from "./types";

const TIMEOUT_MS = 10_000;

function parseHostPort(target: string): { host: string; port: number } | null {
  const cleaned = (target ?? "").trim().replace(/^[a-z]+:\/\//i, "");
  const idx = cleaned.lastIndexOf(":");
  if (idx <= 0) return null;
  const host = cleaned.slice(0, idx).trim();
  const port = Number(cleaned.slice(idx + 1).trim());
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { host, port };
}

export const tcpConnector: MonitorConnector = {
  key: "TCP",
  label: "TCP port",
  targetHint: "db.example.com:5432",
  async run(monitor: WikiMonitor): Promise<MonitorProbeResult> {
    const parsed = parseHostPort(monitor.target);
    if (!parsed) {
      return { status: "DOWN", latencyMs: null, statusCode: null, error: 'Use "host:port" (e.g. db.example.com:5432)' };
    }
    let approvedAddresses: string[];
    try {
      approvedAddresses = (await assertPublicHost(parsed.host)).addresses;
    } catch (e) {
      return {
        status: "DOWN",
        latencyMs: null,
        statusCode: null,
        error: e instanceof UrlNotScannableError ? e.message : "Host can't be monitored",
      };
    }

    const started = Date.now();
    return new Promise<MonitorProbeResult>((resolve) => {
      const socket = new net.Socket();
      let settled = false;
      const finish = (result: MonitorProbeResult) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(result);
      };
      socket.setTimeout(TIMEOUT_MS);
      socket.once("connect", () => {
        const latencyMs = Date.now() - started;
        let status: MonitorStatus = "UP";
        if (monitor.degradedMs != null && latencyMs > monitor.degradedMs) status = "DEGRADED";
        finish({ status, latencyMs, statusCode: null, error: null });
      });
      socket.once("timeout", () =>
        finish({ status: "DOWN", latencyMs: null, statusCode: null, error: `Timed out after ${TIMEOUT_MS / 1000}s` }),
      );
      socket.once("error", (err) =>
        finish({ status: "DOWN", latencyMs: Date.now() - started, statusCode: null, error: err.message }),
      );
      // Connect to the exact address approved above. Supplying the hostname
      // here would perform a second DNS lookup and reopen a rebinding window.
      socket.connect(parsed.port, approvedAddresses[0]);
    });
  },
};
