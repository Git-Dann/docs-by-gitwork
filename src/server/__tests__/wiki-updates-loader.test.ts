import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The client's copy of the timeline (Updates, CLAUDE.md §147) is read with `audience: "client"`,
 * which narrows three sources at the query, before `forClientTimeline` strips the rest. A source
 * read wide and filtered later is one forgotten line from showing an unshared meeting.
 */
const src = readFileSync(join(process.cwd(), "src/server/client-delivery-timeline.ts"), "utf8");
const page = readFileSync(join(process.cwd(), "src/server/wiki-updates.ts"), "utf8");

describe("Updates reads the client's copy", () => {
  it("the page always asks for the client's copy, on both sides", () => {
    expect(page).toContain('audience: "client"');
    expect(page).toContain("forClientTimeline(timeline)");
  });

  it("meetings: only ones shared with the client", () => {
    expect(src).toContain("...(forClient ? { sharedWithClientAt: { not: null } } : {})");
  });

  it("outages: production services only", () => {
    expect(src).toContain('...(forClient ? { monitor: { environment: "production" } } : {})');
  });

  it("documents: only ones that were sent", () => {
    expect(src).toContain("...(forClient ? { sharedAt: { not: null } } : {})");
  });
});
