import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { finaliseUrlChecks } from "@/server/pulse-scan";
import type { PulseScanCheckInput } from "@/types/pulse";

const SOURCE = readFileSync(join(process.cwd(), "src/server/pulse-scan.ts"), "utf8");

function check(
  checkKey: string,
  status: PulseScanCheckInput["status"],
  category: PulseScanCheckInput["category"] = "SEO",
): PulseScanCheckInput {
  return { category, checkKey, label: checkKey, status };
}

const BASE = {
  surfaceKind: "DEPLOYED_PRODUCT" as const,
  markets: [],
};

describe("finaliseUrlChecks", () => {
  it("reclassifies body-parse verdicts on a client-rendered shell", () => {
    const out = finaliseUrlChecks(
      [
        check("has_word_count", "FAIL"),
        check("has_heading_hierarchy", "FAIL"),
        check("internal_links_present", "FAIL"),
      ],
      { ...BASE, spaShell: true },
    );
    expect(out.map((c) => c.status)).toEqual([
      "INCONCLUSIVE",
      "INCONCLUSIVE",
      "INCONCLUSIVE",
    ]);
  });

  it("leaves the very same checks alone on a server-rendered page", () => {
    const out = finaliseUrlChecks([check("has_word_count", "FAIL")], { ...BASE, spaShell: false });
    expect(out[0].status).toBe("FAIL");
  });

  it("does not soften a fetched-evidence failure just because the page is a shell", () => {
    // ssl_valid, robots, privacy and terms are HTTP results, not body parses. A shell tells us
    // nothing about them, so their failures must survive — the score caps depend on it.
    const out = finaliseUrlChecks([check("ssl_valid", "FAIL", "Infrastructure")], {
      ...BASE,
      spaShell: true,
    });
    expect(out[0].status).toBe("FAIL");
  });
});

describe("the streamed waves and the final return are the same pipeline", () => {
  // This invariant is why the SPA reclassification never reached a scan: waves were filtered
  // but not reclassified, and runLiteScan keeps the FIRST status it sees per checkKey, so the
  // wave's uncorrected verdict won every time. Both call sites must go through one function.
  it("emits waves through finaliseUrlChecks", () => {
    expect(SOURCE).toMatch(/const emit = onWave[\s\S]{0,240}?onWave\(finaliseUrlChecks\(/);
  });

  it("reclassifies in exactly one place", () => {
    const calls = SOURCE.match(/reclassifySpaChecks\(/g) ?? [];
    expect(calls).toHaveLength(1);
    // …and that place is finaliseUrlChecks, not a second copy further down the file.
    const body = SOURCE.slice(
      SOURCE.indexOf("export function finaliseUrlChecks"),
      SOURCE.indexOf("export async function runUrlChecks"),
    );
    expect(body).toContain("reclassifySpaChecks(");
  });

  it("settles the final return through the same function", () => {
    expect(SOURCE).toMatch(/const finalChecks = finaliseUrlChecks\(rawChecks, \{/);
  });
});

describe("image_alt_coverage", () => {
  // A page with no images has no alt-text coverage to satisfy. PASS asserts a control was met;
  // on a shell whose images had not rendered that is a finding invented from absence (§35).
  it("does not manufacture a PASS from zero images", () => {
    expect(SOURCE).toMatch(/imgTags\.length === 0 \? "NOT_APPLICABLE"/);
    expect(SOURCE).not.toMatch(/imgTags\.length === 0 \? "PASS"/);
  });
});
