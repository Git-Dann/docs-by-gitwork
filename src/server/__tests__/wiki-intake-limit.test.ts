import { describe, expect, it } from "vitest";
import { INTAKE_QUOTA, intakeQuotaBreach } from "@/server/wiki-intake-limit";

/**
 * The intake API is a PUBLIC write endpoint whose only gate is the client's
 * token, so these thresholds are the sole thing standing between a looping
 * integration and a buried Requests page. Pinning them here means a future edit
 * to the numbers is a deliberate decision rather than a silent one.
 */
describe("intakeQuotaBreach", () => {
  it("allows a normal push", () => {
    expect(intakeQuotaBreach({ hour: 0, day: 0 })).toBeNull();
    expect(intakeQuotaBreach({ hour: 12, day: 40 })).toBeNull();
  });

  it("allows a full 200-item batch on a fresh hour — bulk sync must not be blocked", () => {
    expect(intakeQuotaBreach({ hour: 200, day: 200 })).toBeNull();
  });

  it("allows the push that lands exactly ON the boundary minus one", () => {
    expect(intakeQuotaBreach({ hour: INTAKE_QUOTA.perHour - 1, day: 0 })).toBeNull();
    expect(intakeQuotaBreach({ hour: 0, day: INTAKE_QUOTA.perDay - 1 })).toBeNull();
  });

  it("rejects at the hourly cap", () => {
    const msg = intakeQuotaBreach({ hour: INTAKE_QUOTA.perHour, day: 0 });
    expect(msg).toContain("last hour");
    // The message must say existing items survive — a client seeing a 429 should
    // not think their earlier pushes were lost and re-send everything.
    expect(msg).toContain("unaffected");
  });

  it("rejects at the daily cap even when the hour is quiet", () => {
    const msg = intakeQuotaBreach({ hour: 0, day: INTAKE_QUOTA.perDay });
    expect(msg).toContain("Daily limit");
    expect(msg).toContain("unaffected");
  });

  it("reports the HOURLY breach first when both are exceeded — it's the sooner retry", () => {
    expect(intakeQuotaBreach({ hour: 10_000, day: 10_000 })).toContain("last hour");
  });

  it("keeps the hourly cap below the daily one, or the daily could never fire", () => {
    expect(INTAKE_QUOTA.perHour).toBeLessThan(INTAKE_QUOTA.perDay);
  });
});
