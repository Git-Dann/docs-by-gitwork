import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildCvData } from "../build-cv";
import { renderCvHtml } from "../render-cv";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/**
 * A dev CV is a document Gitwork hands to a CLIENT. `CvData` has nowhere to put a
 * rate, a score or a pipeline state — but a type is a compile-time guarantee only,
 * and the risk is a future change widening `buildCvData` or the route's `select`.
 * These tests are the runtime half.
 */
describe("the CV cannot carry commercial or internal-assessment data", () => {
  // Deliberately passed fields the CV type does not declare: this is what a
  // careless spread of the candidate record would look like.
  const loaded = {
    name: "Alice Fernandez",
    primaryStack: "React Native",
    techStacks: ["TypeScript"],
    location: "Manchester",
    timezone: "GMT",
    yearsExperience: 8,
    bio: "A bio.",
    githubHandle: "alicef",
    hourlyRate: 425,
    monthlyRate: 7400,
    currency: "GBP",
    tier: "TIER_3",
    effectiveTier: "TIER_2",
    overallScore: 41,
    technicalDepth: 12,
    identityConfidence: "LOW",
    status: "SOURCED",
    devGroup: "PRO_BONO",
    published: false,
  } as Parameters<typeof buildCvData>[0];

  const html = renderCvHtml(buildCvData(loaded, [
    { clientName: "Wedge", startDate: "2025-01-01", endDate: null },
  ]), { fontCss: "", markDataUri: null });

  /**
   * ⚠️ Assert against the PRINTED TEXT, not the raw HTML. The first version of
   * this swept the whole document and reported the score "41" and the sub-score
   * "12" as leaked — they were in the stylesheet (`height: 1414px`,
   * `rgba(12, 12, 24, 0.12)`). A needle that can match the CSS cannot tell a leak
   * from a coincidence, in either direction.
   */
  const text = html
    .replace(/<style>[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");

  it.each([
    ["the hourly rate", "425"],
    ["the monthly rate", "7400"],
    ["a currency", "GBP"],
    ["a derived tier", "TIER_3"],
    ["an overridden tier", "TIER_2"],
    ["the overall score", "41"],
    ["a sub-score", "12"],
    ["identity confidence", "LOW"],
    ["pipeline status", "SOURCED"],
    ["the dev group", "PRO_BONO"],
  ])("never prints %s", (_label, needle) => {
    expect(text).not.toContain(needle);
  });

  it("does print the things a CV is for, so the sweep above means something", () => {
    // Without this, a renderer that emitted an empty document would pass every
    // assertion above.
    expect(text).toContain("Alice Fernandez");
    expect(text).toContain("React Native");
    expect(text).toContain("Wedge");
  });

  it("the route never selects a commercial or assessment column", () => {
    const route = read("src/app/api/codeclear/candidates/[id]/cv/route.ts");
    for (const field of [
      "hourlyRate",
      "monthlyRate",
      "rateCardPerson",
      "score",
      "tier",
      "devGroup",
      "status",
    ]) {
      expect(route, `route selects ${field}`).not.toMatch(
        new RegExp(`^\\s*${field}:\\s*true,`, "m"),
      );
    }
  });
});
