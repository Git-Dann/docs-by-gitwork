import { describe, expect, it } from "vitest";
import {
  compareVersions,
  findReleaseByVersion,
  releaseLabel,
  releaseProgress,
  releaseSpan,
  sortReleases,
} from "../releases";

describe("releases", () => {
  it("labels a release with its name when it has one", () => {
    expect(releaseLabel({ version: "v2.0.0", name: "Q4 Refinement Session" })).toBe("v2.0.0 · Q4 Refinement Session");
    expect(releaseLabel({ version: "v2.0.0", name: "  " })).toBe("v2.0.0");
    expect(releaseLabel({ version: "v2.0.0", name: null })).toBe("v2.0.0");
  });

  it("compares versions numerically, not as text", () => {
    expect(compareVersions("v2.9.0", "v2.10.0")).toBeLessThan(0);
    expect(compareVersions("v2.0.1", "v2.0.0")).toBeGreaterThan(0);
    expect(compareVersions("v1.1", "v1.1.0")).toBe(compareVersions("v1.1", "v1.1.0"));
    expect(compareVersions("Next", "v1.0.0")).toBeGreaterThan(0);
  });

  it("orders by start date, undated last, then by version, then by order key", () => {
    const r = (version: string, startDate: string | null, orderKey = 0) => ({ version, name: null, startDate, orderKey });
    const out = sortReleases([
      r("v2.0.1", null),
      r("v2.10.0", "2026-12-01"),
      r("v2.9.0", "2026-12-01"),
      r("v1.0.0", "2026-11-01"),
      r("v2.0.0", null, 2),
      r("v2.0.0", null, 1),
    ]);
    expect(out.map((x) => `${x.version}/${x.orderKey}`)).toEqual([
      "v1.0.0/0",
      "v2.9.0/0",
      "v2.10.0/0",
      "v2.0.0/1",
      "v2.0.0/2",
      "v2.0.1/0",
    ]);
  });

  it("uses its own dates, else estimates the bar from its tasks, else draws none", () => {
    expect(releaseSpan({ startDate: "2026-11-01", endDate: "2026-11-14" }, [])).toMatchObject({ estimated: false });
    expect(releaseSpan({ startDate: null, endDate: null }, [{ dueDate: "2026-11-20" }, { dueDate: "2026-11-05" }])).toEqual({
      startDate: "2026-11-05T00:00:00.000Z",
      endDate: "2026-11-20T00:00:00.000Z",
      estimated: true,
    });
    expect(releaseSpan({ startDate: null, endDate: null }, [{ dueDate: null }])).toBeNull();
  });

  it("is 0% with no tasks, never 100%", () => {
    expect(releaseProgress([])).toBe(0);
    expect(releaseProgress([{ status: "DONE" }, { status: "DOING" }, { status: "DONE" }])).toBe(67);
  });

  it("finds a release by what was typed, and refuses to guess", () => {
    const rs = [{ version: "v2.0.0" }, { version: "v2.0.1" }];
    expect(findReleaseByVersion(rs, "v2.0.0")).toBe(rs[0]);
    expect(findReleaseByVersion(rs, "2.0.1")).toBe(rs[1]);
    expect(findReleaseByVersion(rs, "V2.0.0")).toBe(rs[0]);
    expect(findReleaseByVersion(rs, "3.0")).toBeNull();
    expect(findReleaseByVersion([{ version: "2.0" }, { version: "v2.0" }], "2.0")).toEqual({ version: "2.0" });
    expect(findReleaseByVersion([{ version: "V2.0" }, { version: "v2.0" }], "2.0")).toBeNull();
  });
});

describe("the release doc link", () => {
  it("keeps only plain http(s) links, so a client can never be handed a javascript: link", async () => {
    const { safeReleaseDocUrl } = await import("../releases");
    expect(safeReleaseDocUrl("https://docs.google.com/document/d/abc")).toBe("https://docs.google.com/document/d/abc");
    expect(safeReleaseDocUrl("  http://example.com/x  ")).toBe("http://example.com/x");
    for (const bad of ["javascript:alert(1)", "data:text/html,<b>x</b>", "ftp://x.com/y", "not a url", "", null, undefined, `https://x.com/${"a".repeat(3000)}`]) {
      expect(safeReleaseDocUrl(bad as string | null | undefined), String(bad).slice(0, 30)).toBeNull();
    }
  });

  it("the API refuses a non-http doc link, and accepts clearing it", async () => {
    const { releaseUpdateSchema } = await import("@/server/validators");
    expect(releaseUpdateSchema.safeParse({ docUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(releaseUpdateSchema.safeParse({ docUrl: "https://docs.example.com/v2" }).success).toBe(true);
    expect(releaseUpdateSchema.safeParse({ docUrl: null }).success).toBe(true);
    expect(releaseUpdateSchema.safeParse({ docUrl: "" }).success).toBe(true);
  });
});
