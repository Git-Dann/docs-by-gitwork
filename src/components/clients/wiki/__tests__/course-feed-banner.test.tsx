/**
 * The feed line on the Course Requests page.
 *
 * Internal-only by construction: the client's view passes no `feed`, and the server
 * strips it from every public DTO anyway. A failing feed must be impossible to miss.
 *
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CourseRequestsSection } from "../course-requests-section";
import type { CourseFeedStatus } from "@/lib/wedge-course-feed-status";

const noop = async () => {};
const render = (feed?: CourseFeedStatus | null) =>
  new DOMParser().parseFromString(
    renderToStaticMarkup(<CourseRequestsSection requests={[]} onDelete={noop} onSetStatus={noop} feed={feed} />),
    "text/html",
  );

const failing: CourseFeedStatus = {
  lastRunAt: new Date().toISOString(),
  lastSuccessAt: null,
  failingSince: "2026-10-14T10:15:00.000Z",
  lastError: "Big Wedge rejected Foundry's login (Invalid credentials).",
  lastCreated: 0,
  lastStatusSyncAt: null,
  alertedDownAt: null,
};

describe("the feed line", () => {
  it("a failing feed renders a status block naming the error", () => {
    const el = render(failing).querySelector('[data-feed-state="failing"]');
    expect(el?.getAttribute("role")).toBe("status");
    expect(el?.textContent).toContain("Invalid credentials");
  });
  it("a feed that never ran is not shown as healthy", () => {
    expect(render(null).querySelector('[data-feed-state="never-run"]')).not.toBeNull();
  });
  it("the client's view — no feed prop — renders nothing", () => {
    expect(render(undefined).querySelector("[data-feed-state]")).toBeNull();
  });
  it("every public read strips the feed state", () => {
    const src = readFileSync(path.join(process.cwd(), "src/server/wiki.ts"), "utf8");
    const publicFns = ["getPublicWiki", "resolvePublicWiki"].map((name) => {
      const start = src.indexOf(`export async function ${name}(`);
      return src.slice(start, src.indexOf("\n}\n", start));
    });
    for (const body of publicFns) {
      const builds = body.match(/buildDTO\(/g)?.length ?? 0;
      const stripped = body.match(/forPublic\(await buildDTO\(/g)?.length ?? 0;
      expect(builds).toBeGreaterThan(0);
      expect(stripped).toBe(builds);
    }
  });
});
