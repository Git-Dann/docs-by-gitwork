/**
 * The IP every rate limit is keyed on (src/server/rate-limit.ts). nginx appends the connecting
 * address to whatever X-Forwarded-For the client sent, so the client controls the FIRST entry; a
 * limiter keyed on it could be dodged by sending a new value per request.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { clientIpFrom } from "../rate-limit";
import { clientIpFrom as pulseClientIpFrom } from "../pulse-lite/rate-limit";

const h = (init: Record<string, string>) => new Headers(init);

describe("the client IP for rate limits", () => {
  it("uses X-Real-IP, which our proxy sets and the client can't", () => {
    // Behind another hop the last X-Forwarded-For entry is that hop, not the visitor.
    expect(clientIpFrom(h({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "1.1.1.1, 10.0.0.2" }))).toBe("203.0.113.7");
  });

  it("a leading X-Forwarded-For entry the client wrote never changes the key", () => {
    const a = clientIpFrom(h({ "x-forwarded-for": "9.9.9.9, 203.0.113.7" }));
    const b = clientIpFrom(h({ "x-forwarded-for": "8.8.8.8, 203.0.113.7" }));
    expect(a).toBe("203.0.113.7");
    expect(b).toBe(a);
  });

  it("a single hop is that hop; nothing is null", () => {
    expect(clientIpFrom(h({ "x-forwarded-for": "203.0.113.9" }))).toBe("203.0.113.9");
    expect(clientIpFrom(h({}))).toBeNull();
    expect(clientIpFrom(h({ "x-forwarded-for": " , " }))).toBeNull();
  });

  it("Pulse's public scanner uses the same rule", () => {
    expect(pulseClientIpFrom).toBe(clientIpFrom);
  });
});
