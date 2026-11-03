import { describe, expect, it } from "vitest";
import { parseCapture } from "@/lib/pulse-capture";

const ok = { name: "Sam Buyer", business: "Acme Ltd", email: "Sam@Acme.test", termsAccepted: true };

describe("the unlock form", () => {
  it("accepts a complete submission and normalises it", () => {
    expect(parseCapture(ok)).toEqual({ ok: true, value: { name: "Sam Buyer", business: "Acme Ltd", email: "sam@acme.test" } });
  });

  it("requires every field", () => {
    expect(parseCapture({ ...ok, name: "  " }).ok).toBe(false);
    expect(parseCapture({ ...ok, business: "" }).ok).toBe(false);
    expect(parseCapture({ ...ok, email: "not-an-email" }).ok).toBe(false);
  });

  it("treats only a literal true as agreeing to the terms", () => {
    for (const termsAccepted of [false, undefined, "true", 1, "yes"]) {
      expect(parseCapture({ ...ok, termsAccepted }).ok).toBe(false);
    }
  });

  it("refuses over-long values rather than truncating them", () => {
    expect(parseCapture({ ...ok, name: "x".repeat(121) }).ok).toBe(false);
    expect(parseCapture({ ...ok, business: "x".repeat(161) }).ok).toBe(false);
  });
});
