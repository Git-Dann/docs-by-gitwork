// HTTP(S) uptime connector. Up when the response status matches (exact
// expectedStatus, else any 2xx/3xx) and — if set — the body contains `keyword`.
// DEGRADED when up but slower than `degradedMs`. SSRF-guarded via assertScannableUrl.

import type { WikiMonitor } from "@prisma/client";
import { fetchScannableUrl } from "@/server/pulse-lite/url-guard";
import type { MonitorConnector, MonitorProbeResult, MonitorStatus } from "./types";

const TIMEOUT_MS = 15_000;
/** Cap the body we read for keyword matching so a huge page can't blow memory. */
const MAX_BODY_BYTES = 512 * 1024;

export const httpConnector: MonitorConnector = {
  key: "HTTP",
  label: "HTTP / HTTPS",
  targetHint: "https://api.example.com/health",
  async run(monitor: WikiMonitor): Promise<MonitorProbeResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const started = Date.now();
    try {
      const res = await fetchScannableUrl(monitor.target, {
        method: monitor.method || "GET",
        signal: controller.signal,
        headers: { "User-Agent": "Foundry-Monitor/1.0 (+https://gitwork.co.uk)" },
        cache: "no-store",
      });
      const latencyMs = Date.now() - started;

      let ok =
        monitor.expectedStatus != null
          ? res.status === monitor.expectedStatus
          : res.status >= 200 && res.status < 400;
      let error: string | null = ok ? null : `Unexpected status ${res.status}`;

      if (ok && monitor.keyword) {
        const body = await readCapped(res);
        if (!body.includes(monitor.keyword)) {
          ok = false;
          error = `Keyword "${monitor.keyword}" not found in response`;
        }
      }

      let status: MonitorStatus = ok ? "UP" : "DOWN";
      if (status === "UP" && monitor.degradedMs != null && latencyMs > monitor.degradedMs) {
        status = "DEGRADED";
      }
      return { status, latencyMs, statusCode: res.status, error };
    } catch (e) {
      const latencyMs = Date.now() - started;
      const aborted = e instanceof Error && e.name === "AbortError";
      return {
        status: "DOWN",
        latencyMs: aborted ? null : latencyMs,
        statusCode: null,
        error: aborted
          ? `Timed out after ${TIMEOUT_MS / 1000}s`
          : e instanceof Error
            ? e.message
            : "Request failed",
      };
    } finally {
      clearTimeout(timer);
    }
  },
};

/** Read a response body but stop after MAX_BODY_BYTES so keyword checks are bounded. */
async function readCapped(res: Response): Promise<string> {
  if (!res.body) return await res.text().catch(() => "");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let out = "";
  let read = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      read += value.byteLength;
      out += decoder.decode(value, { stream: true });
      if (read >= MAX_BODY_BYTES) break;
    }
  } catch {
    /* partial body is fine for a keyword check */
  } finally {
    await reader.cancel().catch(() => {});
  }
  return out;
}
