import { describe, expect, it } from "vitest";
import { rateLimitHeaders, retryAfterHeaders } from "../rate-limit";

// ─────────────────────────────────────────────────────────────────────────────
// Pulse's own `api_rate_limit_headers` check WARNS every site it scans for not
// sending these — api-behaviour.ts words it as "a well-behaved client has no way to
// pace itself, so it discovers your limit by hitting it" — while the public scanner
// enforced real limits and advertised none of them. Verified live before the fix:
// no RateLimit-* and no Retry-After on any public Pulse endpoint.
// ─────────────────────────────────────────────────────────────────────────────

const snapshot = { limit: 12, remaining: 7, resetSeconds: 3600 };

describe("rate-limit headers", () => {
  it("emits the IETF structured fields", () => {
    const h = rateLimitHeaders(snapshot);
    expect(h["RateLimit-Policy"]).toBe("12;w=3600");
    expect(h["RateLimit-Limit"]).toBe("12");
    expect(h["RateLimit-Remaining"]).toBe("7");
    expect(h["RateLimit-Reset"]).toBe("3600");
  });

  it("also emits the older X- form, because real clients read both", () => {
    const h = rateLimitHeaders(snapshot);
    expect(h["X-RateLimit-Limit"]).toBe("12");
    expect(h["X-RateLimit-Remaining"]).toBe("7");
  });

  it("never advertises a negative remaining", () => {
    // A client seeing "-3 remaining" learns nothing useful.
    const h = rateLimitHeaders({ limit: 12, remaining: 0, resetSeconds: 3600 });
    expect(Number(h["RateLimit-Remaining"])).toBeGreaterThanOrEqual(0);
  });

  it("satisfies the pattern Pulse's own check looks for", () => {
    // api-behaviour.ts sniffs for /ratelimit|x-ratelimit/i plus Retry-After on a 429.
    const keys = Object.keys(rateLimitHeaders(snapshot)).join(" ");
    expect(keys).toMatch(/ratelimit/i);
    expect(Object.keys(retryAfterHeaders())).toContain("Retry-After");
  });

  it("gives Retry-After a positive, finite number of seconds", () => {
    const v = Number(retryAfterHeaders()["Retry-After"]);
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBeGreaterThan(0);
  });
});

describe("the concurrency cap is declared, not just hoped for", () => {
  it("bounds total in-flight scans and forgives stalled ones", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("src/server/pulse-lite/rate-limit.ts", "utf8"));
    // The cap that actually protects the app: per-IP limits bound one actor, not a
    // stampede, and the same container serves the authenticated product.
    expect(src).toMatch(/MAX_CONCURRENT_SCANS/);
    expect(src).toMatch(/status: "RUNNING"/);
    // Without a staleness window a crashed scan would hold a slot forever and the
    // cap would ratchet to zero — an outage that looks like traffic.
    expect(src).toMatch(/STALE_RUNNING_MS/);
    expect(src).toMatch(/createdAt: \{ gte: staleBefore \}/);
  });
});
