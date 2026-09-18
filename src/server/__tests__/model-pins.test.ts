/**
 * The pinned model ids must not be ones Anthropic has retired.
 *
 * ## Why this exists
 *
 * `LIGHT_MODELS.ANTHROPIC` sat on `claude-3-5-haiku-20241022` — **retired 19 Feb 2026** —
 * for seven months. A retired id does not degrade gracefully: every request 404s. And
 * because each of the nine `tier: "light"` callers wraps its request in a `catch`, the
 * failure surfaced as *"the AI returned nothing"* rather than as an error. The visible
 * symptom was 389 rows reading "Untitled Course" on a client's wiki (§53).
 *
 * ⚠️ This test cannot ask Anthropic what is live — it has no network and no key. It
 * checks the two things that ARE checkable offline and that would have caught this:
 *
 *   1. **No id from a retired generation.** Claude 1/2/3/3.5 are all retired; an id
 *      matching those families is wrong by construction.
 *   2. **No date suffix.** Current Anthropic ids are complete as-is — family and
 *      version, with no trailing date.
 *      A dated id is either a retired snapshot or one pinned to a specific build, and
 *      dated ids are exactly what goes stale silently.
 *
 * It is a floor, not a guarantee: a future retirement of a 4.x id will not fail here.
 * The durable defence is the review cadence noted on the constants themselves (§37.5's
 * discipline for version-pinned values), plus the fact that a total classifier failure
 * now logs the model id.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const SOURCE = readFileSync(
  path.join(process.cwd(), "src/server/ai-provider.ts"),
  "utf8",
);

/** Every Anthropic model id the file pins, from both DEFAULT_MODELS and LIGHT_MODELS. */
function pinnedAnthropicIds(): string[] {
  return [...SOURCE.matchAll(/ANTHROPIC:\s*"([^"]+)"/g)].map((m) => m[1]);
}

describe("pinned Anthropic model ids", () => {
  const ids = pinnedAnthropicIds();

  it("finds the pins at all (the check itself works)", () => {
    // Without this a renamed constant would leave the test asserting over an empty
    // array and passing for ever.
    expect(ids.length).toBeGreaterThanOrEqual(2);
  });

  it("names no model from a retired generation", () => {
    // Claude 1, 2, 3 and 3.5 are retired. `claude-3-5-haiku-20241022` is the one that
    // actually bit us; `claude-3-haiku-20240307` is deprecated and retires Apr 2026.
    const retired = ids.filter((id) => /^claude-(instant-)?[123](-[0-9])?[-.]/.test(id));
    expect(
      retired,
      retired.length
        ? `These pinned ids are from a retired Claude generation — every request using ` +
          `them 404s, and the nine tier:"light" callers swallow that into "the AI ` +
          `returned nothing":\n` + retired.map((i) => `  • ${i}`).join("\n")
        : "",
    ).toEqual([]);
  });

  it("uses undated ids, which is what current Anthropic ids look like", () => {
    const dated = ids.filter((id) => /-\d{8}$/.test(id));
    expect(
      dated,
      dated.length
        ? `Pinned ids carry a date suffix. Current Anthropic ids are complete as-is — ` +
          `family and version, no trailing date; a dated id is a snapshot that gets ` +
          `retired out from under you:\n` +
          dated.map((i) => `  • ${i}`).join("\n")
        : "",
    ).toEqual([]);
  });
});
