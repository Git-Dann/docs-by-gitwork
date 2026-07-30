import { describe, expect, it } from "vitest";
import type { PulseScanCheckInput } from "@/types/pulse";
import type { RepoSnapshot } from "../native-mobile";
import {
  OPERATIONAL_DEPTH_KEYS,
  OPERATIONAL_DEPTH_REGISTRY,
  OPERATIONAL_DEPTH_RULES,
  evaluateOperationalDepthChecks,
  evaluateOperationalRuleText,
} from "../operational-depth";

function snap(files: Record<string, string>): RepoSnapshot {
  return {
    owner: "o",
    repo: "r",
    paths: Object.keys(files),
    files: new Map(Object.entries(files)),
    truncated: false,
    accessible: true,
  };
}

const at = (checks: PulseScanCheckInput[], key: string) => {
  const check = checks.find((candidate) => candidate.checkKey === key);
  if (!check) throw new Error(`No check emitted for ${key}`);
  return check;
};

describe("operational-depth catalogue contract", () => {
  it("registers and emits exactly 120 executable controls", () => {
    expect(OPERATIONAL_DEPTH_RULES).toHaveLength(120);
    expect(OPERATIONAL_DEPTH_REGISTRY).toHaveLength(120);
    expect(new Set(OPERATIONAL_DEPTH_KEYS).size).toBe(120);

    const emitted = evaluateOperationalDepthChecks(snap({ "README.md": "empty project" }));
    expect(emitted.map((check) => check.checkKey).sort()).toEqual([...OPERATIONAL_DEPTH_KEYS].sort());
  });

  it("adds eight controls to each selected high-value category", () => {
    const counts = new Map<string, number>();
    for (const row of OPERATIONAL_DEPTH_REGISTRY) {
      counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
    }

    expect(Object.fromEntries([...counts].sort())).toEqual({
      "AI Safety": 8,
      "API Quality": 8,
      Authentication: 8,
      "Business Operations": 8,
      "Email Deliverability": 8,
      "Global Distribution": 8,
      Infrastructure: 8,
      "Legal & Compliance": 8,
      "Missing Pages": 8,
      Observability: 8,
      Payments: 8,
      Performance: 8,
      "Roles & Permissions": 8,
      "SaaS Readiness": 8,
      "Vibe Code Hygiene": 8,
    });
  });

  it("proves every rule discriminates its positive and adverse fixture", () => {
    for (const rule of OPERATIONAL_DEPTH_RULES) {
      const positive = evaluateOperationalRuleText(rule, rule.positiveFixture);
      const adverse = evaluateOperationalRuleText(rule, rule.adverseFixture);

      expect(positive.status, `${rule.key} positive fixture`).toBe("PASS");
      expect(adverse.status, `${rule.key} adverse fixture`).toBe(rule.onMissing);
      expect(adverse.detail, `${rule.key} remediation`).toMatch(/Remediation:/);
    }
  });

  it("skips every control when its subject is absent", () => {
    const checks = evaluateOperationalDepthChecks(snap({ "README.md": "plain documentation only" }));
    expect(checks.every((check) => check.status === "SKIPPED")).toBe(true);
  });

  it("keeps absence findings low-confidence when repository sampling is thin", () => {
    const files = {
      "package.json": '{"dependencies":{"express":"^5","next-auth":"^5"}}',
      "src/auth.ts": "app.post('/login', login);",
    };
    const snapshot = snap(files);
    snapshot.paths.push(...Array.from({ length: 40 }, (_, index) => `src/unread-${index}.ts`));

    const check = at(evaluateOperationalDepthChecks(snapshot), "auth_depth_csrf_state_change");
    expect(check.status).toBe("WARN");
    expect(check.confidence).toBe("LOW");
    expect(check.confidenceReason).toMatch(/1 of 41 source files/i);
  });

  it("reports the exact source file that contains adverse evidence", () => {
    const checks = evaluateOperationalDepthChecks(snap({
      "package.json": '{"dependencies":{"express":"^5","cookie-session":"^2"}}',
      "src/session.ts": "app.use(session({ cookie: { secure: false } }));",
    }));

    const check = at(checks, "auth_depth_session_cookie_flags");
    expect(check.status).toBe("FAIL");
    expect(check.evidence).toContain("src/session.ts");
  });
});
