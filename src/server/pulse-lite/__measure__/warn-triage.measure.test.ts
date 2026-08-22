/**
 * WARN is the default outcome. Measured: stripe.com (one of the best engineering
 * orgs on the internet) emits 603 warnings; a blank IANA placeholder page emits 716.
 * A signal that barely varies between those two is not a signal.
 *
 * This asks whether that wall is TRIAGEABLE with machinery Pulse already has —
 * severity, priority tiers, trust buckets — or whether ~600 checks are genuinely
 * mis-calibrated and need re-grading.
 */
import { describe, it } from "vitest";
import { runLiteScan } from "@/server/pulse-lite/run-lite-scan";
import { rankFindings } from "@/server/pulse-checks/priority";

const urls = (process.env.PULSE_MEASURE_URLS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

describe.skipIf(urls.length === 0)("warn triage", () => {
  for (const url of urls) {
    it(`triages ${url}`, async () => {
      const { checks } = await runLiteScan({ inputType: "URL", url, includePageSpeed: false });
      const warns = checks.filter((c) => c.status === "WARN");
      const fails = checks.filter((c) => c.status === "FAIL");

      const tally = <T,>(rows: T[], key: (r: T) => string) => {
        const m = new Map<string, number>();
        for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
        return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join("  ");
      };

      const ranked = rankFindings(checks);
      const rankedNonPass = ranked.filter((r) => r.check.status === "FAIL" || r.check.status === "WARN");
      const byTier = tally(rankedNonPass, (r) => r.priority.tier ?? "?");

      console.log([
        ``,
        `${"=".repeat(72)}`,
        `${url}`,
        `${"=".repeat(72)}`,
        `FAIL ${fails.length}   WARN ${warns.length}`,
        ``,
        `warn severity      ${tally(warns, (c) => c.severity ?? "(unset)")}`,
        `warn confidence    ${tally(warns, (c) => c.confidence ?? "(unset)")}`,
        `warn evidence      ${tally(warns, (c) => c.evidenceStrength ?? "(unset)")}`,
        `warn trustBucket   ${tally(warns, (c) => c.trustBucket ?? "(unset)")}`,
        `warn scoreEligible ${tally(warns, (c) => String(c.scoreEligible ?? "(unset)"))}`,
        ``,
        `priority tiers (FAIL+WARN)   ${byTier}`,
        ``,
        `top 12 by priority:`,
        ...rankedNonPass.slice(0, 12).map((r, i) =>
          `  ${String(i + 1).padStart(2)}. [${r.priority.tier}] ${r.check.status.padEnd(4)} ${r.check.checkKey}`),
      ].join("\n"));
    }, 180_000);
  }
});
