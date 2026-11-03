import { describe, expect, it } from "vitest";
import { answeredByCodeHealth, dependencyChecks, structureChecks } from "../checks";
import { DEMO_CODE_HEALTH } from "@/lib/demo/demo-code-health";
import type { CodeHealthReport, DependencyAudit } from "@/types/code-health";

const audit = (over: Partial<DependencyAudit>): DependencyAudit => ({
  status: "checked", reason: null, lockfiles: [{ path: "package-lock.json", ecosystem: "npm", packages: 10 }], packages: 10,
  vulnerable: [], counts: { critical: 0, high: 0, moderate: 0, low: 0, unknown: 0 }, checkedAt: "2026-10-23T00:00:00Z", ...over,
});
const withDeps = (d: DependencyAudit | null | undefined): CodeHealthReport => ({ ...DEMO_CODE_HEALTH, dependencies: d });

describe("dependencyChecks", () => {
  it("never passes an audit that did not run", () => {
    for (const status of ["unavailable", "no_lockfile"] as const) {
      const [c] = dependencyChecks(withDeps(audit({ status, reason: "OSV did not answer." })));
      expect(c.status).toBe("INCONCLUSIVE");
      expect(c.confidence).toBe("LOW");
    }
  });

  it("fails on critical or high, warns on the rest, passes when clean", () => {
    expect(dependencyChecks(withDeps(audit({})))[0].status).toBe("PASS");
    expect(dependencyChecks(withDeps(DEMO_CODE_HEALTH.dependencies!))[0].status).toBe("FAIL");
    const moderateOnly = audit({ vulnerable: [DEMO_CODE_HEALTH.dependencies!.vulnerable[2]], counts: { critical: 0, high: 0, moderate: 1, low: 0, unknown: 0 } });
    expect(dependencyChecks(withDeps(moderateOnly))[0].status).toBe("WARN");
  });

  it("emits nothing for a report from before the audit existed", () => {
    expect(dependencyChecks(withDeps(undefined))).toEqual([]);
  });
});

describe("answeredByCodeHealth", () => {
  it("replaces Dependabot's answer only when the lockfile audit actually ran", () => {
    expect(answeredByCodeHealth(withDeps(audit({}))).has("dependency_vulnerabilities")).toBe(true);
    expect(answeredByCodeHealth(withDeps(audit({ status: "unavailable" }))).has("dependency_vulnerabilities")).toBe(false);
    expect(answeredByCodeHealth(null).size).toBe(0);
  });
});

describe("structureChecks", () => {
  const s = DEMO_CODE_HEALTH.structure!;
  it("passes with no cycles, warns on small ones, fails on a large one", () => {
    expect(structureChecks({ ...DEMO_CODE_HEALTH, structure: { ...s, cycleCount: 0, filesInCycles: 0, cycles: [] } })[0].status).toBe("PASS");
    expect(structureChecks(DEMO_CODE_HEALTH)[0].status).toBe("WARN");
    const big = { files: Array.from({ length: 12 }, (_, i) => `f${i}.ts`), path: ["f0.ts", "f1.ts", "f0.ts"] };
    expect(structureChecks({ ...DEMO_CODE_HEALTH, structure: { ...s, cycleCount: 1, filesInCycles: 12, cycles: [big] } })[0].status).toBe("FAIL");
  });

  it("an unmapped graph is inconclusive, never a pass", () => {
    const [c] = structureChecks({ ...DEMO_CODE_HEALTH, structure: null });
    expect(c.status).toBe("INCONCLUSIVE");
  });

  it("drops to medium confidence when much of the graph could not be resolved", () => {
    const [c] = structureChecks({ ...DEMO_CODE_HEALTH, structure: { ...s, unresolvedShare: 0.5 } });
    expect(c.confidence).toBe("MEDIUM");
  });
});
