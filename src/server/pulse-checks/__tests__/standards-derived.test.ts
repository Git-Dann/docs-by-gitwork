import { describe, expect, it } from "vitest";
import type { PulseScanCheckInput } from "@/types/pulse";
import { CHECKS_REGISTRY } from "@/server/checks-registry";
import { WITHHELD } from "../check-relevance-data";
import { decideRelevance, relevanceRuleFor, type ScanContext } from "../check-relevance";
import {
  DERIVED_STANDARDS,
  DERIVED_STANDARD_KEYS,
  derivationEvidenceKeys,
  deriveStandardVerdict,
  type StandardsDerivation,
} from "../standards-derived";
import { PULSE_VERIFICATION_CONTROLS, resolveEvidenceBackedControls } from "../standards-verification";
import { evaluateWebSourceChecks } from "../web-repo-source";
import type { RepoSnapshot } from "../native-mobile";

function obs(
  checkKey: string,
  status: PulseScanCheckInput["status"],
  confidence: PulseScanCheckInput["confidence"] = "HIGH",
): PulseScanCheckInput {
  return { category: "Security", checkKey, label: `Live ${checkKey}`, status, confidence, detail: `Observed ${checkKey}.` };
}

const derivation = (id: string): StandardsDerivation => {
  const found = DERIVED_STANDARDS.find((x) => x.controlId === id);
  expect(found, id).toBeDefined();
  return found!;
};

const byKey = (checks: PulseScanCheckInput[], key: string) => {
  const c = checks.find((x) => x.checkKey === key);
  expect(c, key).toBeDefined();
  return c!;
};

describe("DERIVED_STANDARDS is wired only to real, live evidence", () => {
  const registered = new Map(CHECKS_REGISTRY.map((c) => [c.key, c]));
  const controlIds = new Set(PULSE_VERIFICATION_CONTROLS.map((c) => c.id));

  it("names each catalogue control at most once, and only real ones", () => {
    const ids = DERIVED_STANDARDS.map((x) => x.controlId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(controlIds.has(id), id).toBe(true);
    expect(DERIVED_STANDARD_KEYS.size).toBe(ids.length);
  });

  it("reads only registered checks that a report can show", () => {
    const bad: string[] = [];
    for (const x of DERIVED_STANDARDS) {
      expect(x.refutedBy.length, x.controlId).toBeGreaterThan(0);
      for (const key of derivationEvidenceKeys(x)) {
        if (!registered.has(key) || key.startsWith("standards_") || Object.prototype.hasOwnProperty.call(WITHHELD, key)) {
          bad.push(`${x.controlId} → ${key}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("every proving key can also refute, so a failing prover is never ignored", () => {
    for (const x of DERIVED_STANDARDS) {
      for (const key of (x.provedBy ?? []).flat()) expect(x.refutedBy, `${x.controlId}: ${key}`).toContain(key);
    }
  });

  it("rationales are plain copy: no em dashes", () => {
    for (const x of DERIVED_STANDARDS) expect(x.rationale, x.controlId).not.toContain("—");
  });
});

describe("deriveStandardVerdict combines evidence honestly", () => {
  const supply = derivation("deep_supply_01");
  const network = derivation("deep_network_01");

  it("FAIL from any refuting check, whatever else passed", () => {
    const v = deriveStandardVerdict(network, [obs("ssl_valid", "PASS"), obs("http_redirect", "FAIL")]);
    expect(v.status).toBe("FAIL");
    expect(v.sources.map((s) => s.checkKey)).toEqual(["http_redirect"]);
  });

  it("FAIL outranks WARN, and a WARN alone is carried as WARN", () => {
    expect(deriveStandardVerdict(network, [obs("no_mixed_content", "WARN"), obs("ssl_valid", "FAIL")]).status).toBe("FAIL");
    expect(deriveStandardVerdict(network, [obs("no_mixed_content", "WARN")]).status).toBe("WARN");
  });

  it("a LOW-confidence or non-verdict source is no evidence at all", () => {
    for (const weak of [obs("ssl_valid", "FAIL", "LOW"), obs("ssl_valid", "INCONCLUSIVE"), obs("ssl_valid", "SKIPPED"), obs("ssl_valid", "NOT_APPLICABLE")]) {
      expect(deriveStandardVerdict(network, [weak]).status).toBe("INCONCLUSIVE");
    }
  });

  it("never passes a refute-only control, even when every refuting check passes", () => {
    const all = network.refutedBy.map((k) => obs(k, "PASS"));
    expect(network.provedBy).toBeUndefined();
    expect(deriveStandardVerdict(network, all).status).toBe("INCONCLUSIVE");
  });

  it("passes only on a complete proving group, never on absence", () => {
    expect(deriveStandardVerdict(supply, []).status).toBe("INCONCLUSIVE");
    expect(deriveStandardVerdict(supply, [obs("web_dependency_pinning", "PASS")]).status).toBe("PASS");
    expect(deriveStandardVerdict(supply, [obs("web_dependency_pinning", "PASS", "LOW")]).status).toBe("INCONCLUSIVE");
  });

  it("a passing prover does not outweigh adverse evidence from elsewhere", () => {
    const v = deriveStandardVerdict(supply, [obs("web_dependency_pinning", "PASS"), obs("android_dependency_pinning", "WARN")]);
    expect(v.status).toBe("WARN");
  });

  it("confidence is the weakest of the sources it rests on", () => {
    const v = deriveStandardVerdict(network, [obs("ssl_valid", "FAIL", "HIGH"), obs("http_redirect", "FAIL", "MEDIUM")]);
    expect(v.confidence).toBe("MEDIUM");
  });

  it("ignores checks the derivation does not name", () => {
    expect(deriveStandardVerdict(network, [obs("csp_header", "FAIL")]).status).toBe("INCONCLUSIVE");
  });

  // Two-sided for every row: each refuting check, failing alone, refutes; every
  // refuting check passing never yields PASS unless a proving group says so.
  it.each(DERIVED_STANDARDS.map((x) => [x.controlId, x] as const))("%s: refutes on each named check, passes only via provedBy", (_id, x) => {
    for (const key of x.refutedBy) {
      expect(deriveStandardVerdict(x, [obs(key, "FAIL")]).status, key).toBe("FAIL");
      expect(deriveStandardVerdict(x, [obs(key, "WARN", "MEDIUM")]).status, key).toBe("WARN");
    }
    const allPass = deriveStandardVerdict(x, derivationEvidenceKeys(x).map((k) => obs(k, "PASS")));
    expect(allPass.status).toBe(x.provedBy?.length ? "PASS" : "INCONCLUSIVE");
  });
});

describe("resolveEvidenceBackedControls uses the derivations", () => {
  it("a valid certificate alone no longer passes end-to-end transport encryption", () => {
    const passed = resolveEvidenceBackedControls("WEB_APP", [obs("ssl_valid", "PASS")]);
    expect(byKey(passed, "standards_deep_network_01").status).toBe("INCONCLUSIVE");
    const failed = resolveEvidenceBackedControls("WEB_APP", [obs("ssl_valid", "FAIL")]);
    const row = byKey(failed, "standards_deep_network_01");
    expect(row.status).toBe("FAIL");
    expect(row.evidence).toContain("ssl_valid");
    expect(row.detail).toContain("not met");
  });

  it("leaves controls with no derivation as manual items", () => {
    const resolved = resolveEvidenceBackedControls("WEB_APP", [obs("ssl_valid", "FAIL")]);
    const manual = byKey(resolved, "standards_deep_business_01");
    expect(manual.status).toBe("WARN");
    expect(manual.confidence).toBe("LOW");
  });

  it("derives from a real web repo snapshot, both ways", () => {
    const snap = (files: Record<string, string>): RepoSnapshot => ({
      owner: "acme", repo: "app", paths: Object.keys(files), files: new Map(Object.entries(files)), truncated: false, accessible: true,
    });
    const pkg = JSON.stringify({ name: "app", dependencies: { next: "15.0.3", react: "19.0.0" } });
    const page = `export default function Page() {\n  return <main>Hello</main>;\n}\n`;
    const unlocked = evaluateWebSourceChecks(snap({ "package.json": pkg, "app/page.tsx": page }));
    const locked = evaluateWebSourceChecks(snap({ "package.json": pkg, "app/page.tsx": page, "package-lock.json": "{}" }));
    expect(byKey(unlocked, "web_dependency_pinning").status).toBe("WARN");
    expect(byKey(locked, "web_dependency_pinning").status).toBe("PASS");

    expect(byKey(resolveEvidenceBackedControls("WEB_APP", unlocked), "standards_deep_supply_01").status).toBe("WARN");
    expect(byKey(resolveEvidenceBackedControls("WEB_APP", locked), "standards_deep_supply_01").status).toBe("PASS");
  });
});

describe("the relevance gate shows derived verdicts, not manual to-dos", () => {
  const ctx = { platform: "WEB_APP", target: { kind: "repo", shape: "web" }, features: new Set() } as unknown as ScanContext;
  const decide = (c: PulseScanCheckInput) => decideRelevance(c, relevanceRuleFor(c.checkKey), ctx).show;

  it("shows a derived WARN but hides a manual WARN and a derived INCONCLUSIVE", () => {
    const derived = byKey(resolveEvidenceBackedControls("WEB_APP", [obs("web_dependency_pinning", "WARN")]), "standards_deep_supply_01");
    expect(derived.status).toBe("WARN");
    expect(decide(derived)).toBe(true);

    const manual = byKey(resolveEvidenceBackedControls("WEB_APP", []), "standards_deep_business_01");
    expect(decide(manual)).toBe(false);

    const inconclusive = byKey(resolveEvidenceBackedControls("WEB_APP", []), "standards_deep_supply_01");
    expect(inconclusive.status).toBe("INCONCLUSIVE");
    expect(decide(inconclusive)).toBe(false);
  });
});
