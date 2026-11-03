// ─────────────────────────────────────────────────────────────────────────────
// 103 EARLY HINTS, OBSERVED OVER HTTP/2.
//
// A 103 response is informational: it arrives before the real response and lets the
// browser start fetching critical CSS and fonts while the server is still working.
// Pulse's ordinary fetch never surfaces 1xx responses, which is why this key was
// withheld (it read an `x-early-hints` header that does not exist). Node's HTTP/2
// client does report informational header blocks, so the page is requested over
// HTTP/2 and any 103 is seen directly.
//
// Early hints are an optimisation, never a requirement, and CDNs (Cloudflare) only
// send them once they have learned hints from earlier responses. So:
//   PASS            a 103 was received;
//   NOT_APPLICABLE  none was received in two requests (absence is not a finding);
//   INCONCLUSIVE    the HTTP/2 connection could not be made.
// ─────────────────────────────────────────────────────────────────────────────

import { connect, constants } from "node:http2";
import type { PulseScanCheckInput } from "@/types/pulse";
import { CATEGORIES } from "./categories";
import { assertScannableUrl } from "@/server/pulse-lite/url-guard";

const TIMEOUT_MS = 6_000;
const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

export interface EarlyHintsObservation {
  /** "seen": a 103 arrived; "none": the response came with no 103; "no-h2": the server did not speak HTTP/2; "error": could not connect. */
  outcome: "seen" | "none" | "no-h2" | "error";
  /** The Link header values carried by the 103, when one arrived. */
  links: string[];
  reason?: string;
}

/** One HTTP/2 GET of the page, watching for a 103 before the final headers. */
export function observeEarlyHints(url: string): Promise<EarlyHintsObservation> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (o: EarlyHintsObservation) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // destroy, not close: everything needed has arrived, and a graceful close waits on the body.
      try { session.destroy(); } catch { /* already closed */ }
      resolve(o);
    };
    const target = new URL(url);
    const session = connect(target.origin, { ALPNProtocols: ["h2"] });
    const timer = setTimeout(() => done({ outcome: "error", links: [], reason: "the request timed out" }), TIMEOUT_MS);
    session.on("error", (e: NodeJS.ErrnoException) => {
      // A server that only negotiates HTTP/1.1 fails ALPN; that is "no HTTP/2", not a fault.
      const noH2 = e.code === "ERR_HTTP2_ERROR" || /ALPN|protocol/i.test(String(e.message));
      done({ outcome: noH2 ? "no-h2" : "error", links: [], reason: e.message });
    });
    session.on("connect", () => {
      const links: string[] = [];
      let saw103 = false;
      const req = session.request({
        [constants.HTTP2_HEADER_METHOD]: "GET",
        [constants.HTTP2_HEADER_PATH]: `${target.pathname}${target.search}` || "/",
        // A browser's request: CDNs (Cloudflare) send early hints only to browsers, so a bot
        // user agent was measured to get none from a site that sends them to everyone else.
        "user-agent": BROWSER_UA,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-GB,en;q=0.9",
      });
      // Informational (1xx) header blocks arrive as 'headers'; the final ones as 'response'.
      req.on("headers", (headers) => {
        if (Number(headers[constants.HTTP2_HEADER_STATUS]) === 103) {
          saw103 = true;
          const link = headers.link;
          links.push(...(Array.isArray(link) ? link : link ? [String(link)] : []));
        }
      });
      req.on("response", () => {
        done({ outcome: saw103 ? "seen" : "none", links });
      });
      req.on("error", (e) => done({ outcome: "error", links: [], reason: e.message }));
      req.end();
    });
  });
}

/** Up to two requests: a CDN may only send hints once a first response has taught it them. */
export async function probeEarlyHints(url: string): Promise<EarlyHintsObservation> {
  try {
    await assertScannableUrl(url);
  } catch {
    return { outcome: "error", links: [], reason: "the address is not one Pulse may connect to" };
  }
  const first = await observeEarlyHints(url);
  if (first.outcome !== "none") return first;
  const second = await observeEarlyHints(url);
  return second.outcome === "error" ? first : second;
}

/** The check, from what the probe saw. Pure. */
export function earlyHintsCheck(o: EarlyHintsObservation): PulseScanCheckInput {
  const base = { category: CATEGORIES.PERFORMANCE, checkKey: "early_hints_support", label: "103 Early Hints sent" };
  if (o.outcome === "seen") {
    return { ...base, status: "PASS", confidence: "HIGH", evidenceStrength: "VERIFIED", evidence: o.links.slice(0, 4).join(", ").slice(0, 400),
      detail: `The server sends 103 Early Hints over HTTP/2, so browsers can start loading ${o.links.length > 0 ? "the hinted resources" : "resources"} before the page itself arrives.` };
  }
  if (o.outcome === "error") {
    return { ...base, status: "INCONCLUSIVE", confidence: "LOW", detail: `Not assessed: the HTTP/2 request failed (${o.reason ?? "unknown error"}).` };
  }
  return { ...base, status: "NOT_APPLICABLE",
    detail: o.outcome === "no-h2"
      ? "The server does not offer HTTP/2, which early hints need in practice."
      : "No 103 Early Hints response was seen in two requests. Early hints are an optional speed-up, not a requirement." };
}
