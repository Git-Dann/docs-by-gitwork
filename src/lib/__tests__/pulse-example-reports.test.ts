import { describe, expect, it } from "vitest";
import { EXAMPLE_REPORTS, exampleReport } from "@/lib/pulse-example-reports";
import { examplePulseReportScans } from "@/lib/demo/dev-demo-data";

describe("the /pulse/features example reports", () => {
  const scans = examplePulseReportScans() as Record<string, { healthScore: number; projectName: string; inputUrl: string | null; inputGithubRepo: string | null; clientName: string | null }>;

  it("each card shows the score its report actually carries", () => {
    for (const r of EXAMPLE_REPORTS) expect(scans[r.id]?.healthScore, r.id).toBe(r.score);
  });

  it("covers a strong, a middling and a weak result", () => {
    const [a, b, c] = EXAMPLE_REPORTS.map((r) => r.score);
    expect(a).toBeGreaterThanOrEqual(75);
    expect(b).toBeGreaterThanOrEqual(50);
    expect(b).toBeLessThan(75);
    expect(c).toBeLessThan(50);
  });

  it("never names a real domain or client: every subject is an example name", () => {
    for (const r of EXAMPLE_REPORTS) {
      const s = scans[r.id];
      expect(s.clientName).toBeNull();
      for (const v of [s.inputUrl, s.inputGithubRepo, r.subject].filter(Boolean) as string[]) {
        expect(v, v).toMatch(/\.example\b|^example\//);
      }
    }
  });

  it("follows the overview's copy rules", () => {
    for (const r of EXAMPLE_REPORTS) {
      const text = `${r.label} ${r.kind} ${r.summary}`;
      expect(text).not.toMatch(/—/);
      expect(text).not.toMatch(/\bfree\b/i);
    }
  });

  it("an unknown id resolves to nothing", () => {
    expect(exampleReport("nope")).toBeNull();
  });
});
