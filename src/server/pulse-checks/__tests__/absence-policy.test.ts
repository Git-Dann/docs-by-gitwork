// @vitest-environment node
import { describe, expect, it } from "vitest";
import { applyAbsencePolicy, OPTIONAL_ABSENCE, UNOBSERVABLE_ABSENCE } from "@/server/pulse-checks/absence-policy";
import { readFileSync } from "node:fs";
import { GATE_POLICIES, gatePolicyById, resolveGatePolicy } from "@/server/pulse-checks/release-decision";
import { CATEGORIES } from "@/server/pulse-checks/categories";
import type { PulseScanCheckInput } from "@/types/pulse";

const check = (checkKey: string, status: PulseScanCheckInput["status"], detail = "No password reset link found.") =>
  ({ checkKey, status, detail, category: CATEGORIES.SECURITY, label: checkKey }) as PulseScanCheckInput;

describe("unobservable: not seeing it is not proof it is missing", () => {
  it("an adverse result becomes INCONCLUSIVE and keeps what the probe said as evidence", () => {
    const out = applyAbsencePolicy(check("password_reset", "WARN"));
    expect(out.status).toBe("INCONCLUSIVE");
    expect(out.detail).toMatch(/not established from outside/i);
    expect(out.evidence).toMatch(/No password reset link found/);
  });
  it("a PASS stands — presence was observed", () => {
    expect(applyAbsencePolicy(check("password_reset", "PASS", "Reset link found")).status).toBe("PASS");
  });
});

describe("optional: not having it is not a finding", () => {
  it("an adverse result is dropped as not applicable", () => {
    expect(applyAbsencePolicy(check("product_hunt_badge", "WARN")).status).toBe("NOT_APPLICABLE");
  });
  it("a PASS stands", () => {
    expect(applyAbsencePolicy(check("product_hunt_badge", "PASS")).status).toBe("PASS");
  });
});

describe("an API spec is looked for on the API, not the marketing site", () => {
  it("a website scan cannot establish a missing spec", () => {
    expect(applyAbsencePolicy(check("openapi_spec_served", "WARN"), "website").status).toBe("INCONCLUSIVE");
  });
  it("an API scan's missing spec stands", () => {
    expect(applyAbsencePolicy(check("openapi_spec_served", "WARN"), "api").status).toBe("WARN");
  });
});

describe("everything else is untouched", () => {
  it("a check in neither list keeps its FAIL", () => {
    const c = check("ssl_valid", "FAIL", "Certificate expired");
    expect(applyAbsencePolicy(c)).toBe(c);
  });
});

describe("the lists stay honest", () => {
  const registered = new Set((JSON.parse(readFileSync("src/server/pulse-checks/catalogue-baseline.json", "utf8")) as { keys: string[] }).keys);
  it("every key is a registered check", () => {
    for (const k of [...UNOBSERVABLE_ABSENCE, ...OPTIONAL_ABSENCE]) expect(registered.has(k), k).toBe(true);
  });
  it("no key is in both lists", () => {
    for (const k of UNOBSERVABLE_ABSENCE) expect(OPTIONAL_ABSENCE.has(k), k).toBe(false);
  });
  it("no release-gate blocker is softened", () => {
    const policies = [
      ...GATE_POLICIES,
      gatePolicyById("saas-production"),
      resolveGatePolicy({ inputType: "GITHUB_REPO" }),
      resolveGatePolicy({ targetUrl: "https://apps.apple.com/gb/app/x/id1", platform: "IOS_APP" }),
      resolveGatePolicy({ targetUrl: "https://play.google.com/store/apps/details?id=x", platform: "ANDROID_APP" }),
      resolveGatePolicy({ platform: "IOS_APP" }),
      resolveGatePolicy({ apiTarget: true }),
    ];
    for (const p of policies) for (const k of p.blockingKeys) {
      expect(UNOBSERVABLE_ABSENCE.has(k) || OPTIONAL_ABSENCE.has(k), `${p.id} blocks on ${k}`).toBe(false);
    }
  });
});
