/**
 * MEASUREMENT, not a test. Runs the real deterministic core with exactly the
 * public path's options and prints what a free scan actually emits, so the
 * headline "we check N things" claim is measured rather than estimated.
 *
 *   PULSE_MEASURE_URLS="https://example.com" npx vitest run free-tier.measure
 *
 * Skipped unless PULSE_MEASURE_URLS is set — it makes real outbound requests.
 */
import { describe, it, expect } from "vitest";
import { runLiteScan } from "@/server/pulse-lite/run-lite-scan";
import { computeScoreBreakdown } from "@/server/pulse-checks/score-breakdown";
import { CHECKS_REGISTRY } from "@/server/checks-registry";

const urls = (process.env.PULSE_MEASURE_URLS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const registryKeys = new Set(CHECKS_REGISTRY.map((c) => c.key));

describe.skipIf(urls.length === 0)("free-tier measurement", () => {
  for (const url of urls) {
    it(`measures ${url}`, async () => {
      const t0 = Date.now();
      const result = await runLiteScan({ inputType: "URL", url, includePageSpeed: false });
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      const checks = result.checks;

      const byStatus = new Map<string, number>();
      for (const c of checks) byStatus.set(c.status, (byStatus.get(c.status) ?? 0) + 1);
      const cats = new Set(checks.map((c) => c.category));
      const b = computeScoreBreakdown(checks);
      const measured = checks.filter((c) => c.status !== "SKIPPED" && c.status !== "NOT_APPLICABLE");
      const withDetail = checks.filter((c) => (c.detail ?? "").trim());
      const unregistered = [...new Set(checks.filter((c) => !registryKeys.has(c.checkKey)).map((c) => c.checkKey))];
      const dupes = checks.length - new Set(checks.map((c) => c.checkKey)).size;
      const noReason = checks.filter((c) => (c.status === "FAIL" || c.status === "WARN") && !(c.detail ?? "").trim());
      const noLabel = checks.filter((c) => !(c.label ?? "").trim());

      const lines = [
        ``,
        `${"=".repeat(72)}`,
        `${url}   (${elapsed}s)`,
        `${"=".repeat(72)}`,
        `score            ${result.healthScore}   (raw ${b.rawScore} / final ${b.finalScore})`,
        `completeness     ${b.completeness}%   bounds ${b.lowerBound}-${b.upperBound}`,
        `techStack        ${result.techStack.join(", ") || "(none)"}`,
        ``,
        `CHECKS EMITTED   ${checks.length}`,
        `  measured       ${measured.length}    <- the honest "we checked N things"`,
        `  not established${String(checks.length - measured.length).padStart(4)}    <- shown free, as a reason`,
        `  with evidence  ${withDetail.length} (${Math.round((withDetail.length / Math.max(checks.length, 1)) * 100)}%)`,
        `  categories     ${cats.size}`,
        `  status mix     ${[...byStatus.entries()].sort((a, b2) => b2[1] - a[1]).map(([k, v]) => `${k}:${v}`).join("  ")}`,
        ``,
        `INTEGRITY`,
        `  duplicate keys        ${dupes}`,
        `  unregistered keys     ${unregistered.length}${unregistered.length ? " -> " + unregistered.slice(0, 10).join(", ") : ""}`,
        `  FAIL/WARN no reason   ${noReason.length}${noReason.length ? " -> " + noReason.slice(0, 10).map((c) => c.checkKey).join(", ") : ""}`,
        `  checks with no label  ${noLabel.length}`,
      ];
      console.log(lines.join("\n"));

      // Integrity assertions — a free public report must not ship these defects.
      expect(dupes, "duplicate checkKeys in one scan").toBe(0);
      expect(unregistered, "checkKeys missing from checks-registry.ts").toEqual([]);
      expect(noLabel.length, "checks with no label").toBe(0);
      expect(checks.length, "scan emitted nothing").toBeGreaterThan(50);
    }, 180_000);
  }
});
