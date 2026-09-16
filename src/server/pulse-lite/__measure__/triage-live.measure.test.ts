/**
 * End-to-end: run a real scan, then shape it exactly as the public route does,
 * and print what a visitor would actually receive. This is the acceptance check
 * for the free tier — the numbers here are the product.
 */
import { describe, it, expect } from "vitest";
import { runLiteScan } from "@/server/pulse-lite/run-lite-scan";
import { summarise, triage } from "@/server/pulse-lite/public-scan";
import { computeScoreBreakdown } from "@/server/pulse-checks/score-breakdown";

const urls = (process.env.PULSE_MEASURE_URLS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

describe.skipIf(urls.length === 0)("public view, end to end", () => {
  for (const url of urls) {
    it(`shapes ${url}`, async () => {
      const { checks, techStack } = await runLiteScan({ inputType: "URL", url, includePageSpeed: false });
      const score = computeScoreBreakdown(checks).finalScore;
      const s = summarise(checks);
      const t = triage(checks);

      console.log([
        ``,
        `${"=".repeat(74)}`,
        `WHAT A VISITOR SEES — ${url}`,
        `${"=".repeat(74)}`,
        `score ${score}/100   ·   ${techStack.slice(0, 4).join(", ") || "stack not detected"}`,
        `checked ${s.pass + s.warn + s.fail} · passed ${s.pass} · ${t.notEstablished.length} not established`,
        ``,
        `FREE — fix these (${t.actionable.length}):`,
        ...t.actionable.slice(0, 14).map((f, i) =>
          `  ${String(i + 1).padStart(2)}. [${f.tier}] ${f.label}\n      ${f.detail.slice(0, 108)}`),
        t.actionable.length > 14 ? `  … +${t.actionable.length - 14} more actionable` : ``,
        ``,
        `FREE — could not establish (${t.notEstablished.length}), e.g.:`,
        ...t.notEstablished.slice(0, 3).map((n) => `  · ${n.label}: ${n.reason.slice(0, 96)}`),
        ``,
        `GATED — ${t.advisoryCount} advisory checks + interpretation. Top categories:`,
        ...t.advisoryByCategory.slice(0, 5).map((a) => `  · ${a.category}: ${a.count}`),
      ].filter(Boolean).join("\n"));

      // Acceptance criteria for a shippable free report.
      expect(t.actionable.length, "actionable report must not be a wall").toBeLessThan(60);
      expect(score, "score must be a real number").toBeGreaterThan(0);
      for (const f of t.actionable) {
        expect(f.detail.trim(), `${f.checkKey} has no evidence`).not.toBe("");
        expect(f.label.trim(), `${f.checkKey} has no label`).not.toBe("");
      }
    }, 180_000);
  }
});
