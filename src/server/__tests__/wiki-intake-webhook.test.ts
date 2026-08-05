import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import { signWebhookBody } from "@/server/wiki-intake-webhook";

/**
 * The signature is the ONLY thing that lets a client distinguish our delivery
 * from anyone else's who learned their webhook URL. Get it wrong and the webhook
 * becomes a way to inject fake status changes into their tracker, so the exact
 * scheme is pinned here rather than left to be re-derived.
 */
describe("signWebhookBody", () => {
  const secret = "test-secret-value";
  const body = JSON.stringify({ event: "request.promoted", externalRef: "BWG-1421" });

  it("is HMAC-SHA256 over the raw body, prefixed sha256=", () => {
    const expected = `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
    expect(signWebhookBody(body, secret)).toBe(expected);
  });

  it("changes when the body changes — a tampered payload can't reuse a signature", () => {
    const tampered = body.replace("request.promoted", "request.closed");
    expect(signWebhookBody(tampered, secret)).not.toBe(signWebhookBody(body, secret));
  });

  it("changes when the secret changes — one client's secret can't sign for another", () => {
    expect(signWebhookBody(body, "other-secret")).not.toBe(signWebhookBody(body, secret));
  });

  it("is stable for the same input, so a receiver can recompute it", () => {
    expect(signWebhookBody(body, secret)).toBe(signWebhookBody(body, secret));
  });

  it("produces a hex digest of the expected length", () => {
    const sig = signWebhookBody(body, secret);
    expect(sig.startsWith("sha256=")).toBe(true);
    expect(sig.slice("sha256=".length)).toMatch(/^[0-9a-f]{64}$/);
  });
});
