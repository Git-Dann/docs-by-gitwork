/**
 * Only PRODUCTION monitors reach the client (Shahab, Nov 2026): a staging box being redeployed
 * must never read as their outage. These are the rules every reader applies.
 */
import { describe, expect, it } from "vitest";
import {
  clientVisibleIncidents,
  clientVisibleMonitors,
  isClientVisibleEnvironment,
  nameWithEnvironment,
} from "@/lib/monitor-environment";

describe("isClientVisibleEnvironment", () => {
  it("is production and nothing else", () => {
    expect(isClientVisibleEnvironment("production")).toBe(true);
    for (const env of ["staging", "development", "testing", "Production", "", "qa-box", null, undefined]) {
      expect(isClientVisibleEnvironment(env), String(env)).toBe(false);
    }
  });
});

describe("what the client sees", () => {
  const monitors = [
    { id: "p", environment: "production" },
    { id: "s", environment: "staging" },
    { id: "x", environment: "something-new" },
  ];

  it("keeps only production monitors", () => {
    expect(clientVisibleMonitors(monitors).map((m) => m.id)).toEqual(["p"]);
  });

  it("keeps only incidents on a production monitor", () => {
    const incidents = [{ id: "i1", monitorId: "p" }, { id: "i2", monitorId: "s" }, { id: "i3", monitorId: "gone" }];
    expect(clientVisibleIncidents(incidents, monitors).map((i) => i.id)).toEqual(["i1"]);
  });
});

describe("nameWithEnvironment", () => {
  it("leaves production names alone and labels the rest", () => {
    expect(nameWithEnvironment("API", "production")).toBe("API");
    expect(nameWithEnvironment("API", "staging")).toBe("API (Staging)");
  });
});
