// @vitest-environment node
/**
 * The header-builder is unit-tested; this asserts the ROUTE actually attaches the
 * headers to a real response — the difference between "the function returns the
 * right strings" and "a client receives them".
 *
 * It could not be verified against production: Turnstile is enabled there and
 * correctly rejects a token-less request with a 400 *before* the quota check runs,
 * so the success path is unreachable without a genuine human challenge. Staging
 * has Turnstile unset (fail-open) but runs an 8-day-old image on a different tag.
 * Hence: exercise the handler directly.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const created = { id: "scan_new" };

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pulseLiteScan: {
      count: vi.fn(async () => 0),          // well under every cap
      create: vi.fn(async () => created),
    },
    pulseLead: { findFirst: vi.fn(async () => null) },
  },
}));
vi.mock("@/server/pulse-embed-workspace", () => ({
  getPulseEmbedWorkspaceConfig: vi.fn(async () => ({
    enabled: true, checkKeys: [], bookingUrl: "https://example.com/book",
    turnstileSiteKey: null, turnstileSecretKey: null, // fail-open, as in local dev
  })),
}));
vi.mock("@/server/pulse-lite/url-guard", () => ({
  assertScannableUrl: vi.fn(async () => ({ url: "https://example.com/", hostname: "example.com" })),
}));
vi.mock("@/server/pulse-lite/public-scan", () => ({ runPublicLiteScan: vi.fn(async () => {}) }));
vi.mock("@/server/pulse-lite/leads", () => ({ capturePulseLead: vi.fn(async () => ({ leadId: "l1" })) }));
vi.mock("next/server", async (orig) => {
  const actual = await orig<typeof import("next/server")>();
  return { ...actual, after: (fn: () => void) => { void fn; } };
});

function req(body: unknown) {
  return new Request("https://x.test/api/public/pulse/scan", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

beforeEach(() => vi.clearAllMocks());

describe("a successful scan advertises the limit it enforces", () => {
  it("returns 201 with both header families", async () => {
    const { POST } = await import("@/app/api/public/pulse/scan/route");
    const res = await POST(req({ url: "example.com" }));

    expect(res.status).toBe(201);
    // IETF structured fields…
    expect(res.headers.get("RateLimit-Policy")).toMatch(/^\d+;w=3600$/);
    expect(res.headers.get("RateLimit-Limit")).toBeTruthy();
    expect(Number(res.headers.get("RateLimit-Remaining"))).toBeGreaterThanOrEqual(0);
    // …and the older X- form, because real clients read both.
    expect(res.headers.get("X-RateLimit-Limit")).toBeTruthy();
  });

  it("still needs no email", async () => {
    const { POST } = await import("@/app/api/public/pulse/scan/route");
    const res = await POST(req({ url: "example.com" }));
    expect(res.status).toBe(201);
    const { capturePulseLead } = await import("@/server/pulse-lite/leads");
    expect(capturePulseLead).not.toHaveBeenCalled();
  });
});

describe("a throttled scan says when to come back", () => {
  it("returns 429 with Retry-After when CONCURRENCY specifically is saturated", async () => {
    const { prisma } = await import("@/lib/prisma");
    // ⚠️ Must saturate ONLY the in-flight probe. Returning 999 for every count()
    // also trips the per-IP cap, so the test would pass with the concurrency check
    // deleted — proved exactly that by removing it and watching this stay green.
    // The counts resolve in Promise.all array order: ipHour, ipDay, hostHour, inFlight.
    vi.mocked(prisma.pulseLiteScan.count)
      .mockResolvedValueOnce(0)   // ipHour   — well under
      .mockResolvedValueOnce(0)   // ipDay    — well under
      .mockResolvedValueOnce(0)   // hostHour — well under
      .mockResolvedValueOnce(999); // inFlight — saturated

    const { POST } = await import("@/app/api/public/pulse/scan/route");
    const res = await POST(req({ url: "example.com" }));

    expect(res.status).toBe(429);
    // A 429 without this tells a client nothing except "no" — which is exactly the
    // complaint api-behaviour.ts raises against the sites Pulse scans.
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("does not start a scan when it refuses one", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.pulseLiteScan.count)
      .mockResolvedValueOnce(0).mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0).mockResolvedValueOnce(999);
    const { POST } = await import("@/app/api/public/pulse/scan/route");
    await POST(req({ url: "example.com" }));
    expect(prisma.pulseLiteScan.create).not.toHaveBeenCalled();
  });

  it("distinguishes a concurrency refusal from a per-IP refusal", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { POST } = await import("@/app/api/public/pulse/scan/route");

    vi.mocked(prisma.pulseLiteScan.count)
      .mockResolvedValueOnce(0).mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0).mockResolvedValueOnce(999);
    const busy = await (await POST(req({ url: "example.com" }))).json();
    expect(busy.error).toMatch(/lot of scans are running/i);

    vi.mocked(prisma.pulseLiteScan.count).mockReset();
    vi.mocked(prisma.pulseLiteScan.count)
      .mockResolvedValueOnce(999).mockResolvedValueOnce(999)
      .mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    const perIp = await (await POST(req({ url: "example.com" }))).json();
    expect(perIp.error).toMatch(/run a lot of scans recently/i);
  });
});
