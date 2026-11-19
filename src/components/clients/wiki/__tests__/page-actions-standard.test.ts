import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** CLAUDE.md §138: page-level actions live in the shared header, never in a bar under it. */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("wiki page actions sit in the header", () => {
  it("the workspace has no page-level action bar left under the header", () => {
    expect(read("src/components/clients/wiki/wiki-workspace.tsx")).not.toMatch(/<div className="mb-4 flex h-9 items-center/);
  });

  it.each([
    ["src/components/clients/wiki/wiki-metrics-section.tsx", "Period"],
    ["src/components/clients/wiki/golf-data-console.tsx", "Refresh"],
    ["src/components/clients/insights/insights-section.tsx", "New chart"],
    ["src/components/clients/wiki/wiki-comparisons-section.tsx", "New table"],
    ["src/components/clients/design-system/design-system-workspace.tsx", "Download"],
  ])("%s puts %s in WikiPageActions", (file, label) => {
    const src = read(file);
    const block = src.slice(src.indexOf("<WikiPageActions>"), src.indexOf("</WikiPageActions>"));
    expect(block).toContain(label);
  });
});
