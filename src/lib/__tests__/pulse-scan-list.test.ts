import { describe, expect, it } from "vitest";
import { DEFAULT_SCAN_FILTERS, DEFAULT_SCAN_SORT, filterScans, scanChanges, scanHealth, scanKind, sortScansBy } from "@/lib/pulse-scan-list";
import type { PulseScanListItem } from "@/types/pulse";

const NOW = Date.parse("2026-10-28T12:00:00Z");
const day = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
let seq = 0;
const scan = (o: Partial<PulseScanListItem>): PulseScanListItem => ({
  id: `s${++seq}`, workspaceId: "w", clientId: null, clientName: null, projectName: "site", inputType: "URL",
  inputUrl: "https://example.com", inputGithubRepo: null, status: "COMPLETED", healthScore: 80, generatedProposalId: null,
  isShared: false, shareToken: null, createdAt: day(1), updatedAt: day(1), ...o,
});

const a1 = scan({ id: "a1", inputUrl: "https://a.com", healthScore: 70, createdAt: day(20) });
const a2 = scan({ id: "a2", inputUrl: "https://A.com/", healthScore: 60, createdAt: day(2) });
const b1 = scan({ id: "b1", inputUrl: "https://b.com", healthScore: 50, createdAt: day(10) });
const b2 = scan({ id: "b2", inputUrl: "https://b.com", healthScore: 90, createdAt: day(3) });
const fresh = scan({ id: "f", inputUrl: "https://fresh.com", healthScore: null, status: "FAILED", createdAt: day(0) });
const repo = scan({ id: "r", inputType: "GITHUB_REPO", inputUrl: null, inputGithubRepo: "acme/api", healthScore: 40, createdAt: day(5) });
const all = [a1, a2, b1, b2, fresh, repo];
const changes = scanChanges(all);
const none = { changes, monitorOf: () => undefined };
const ids = (xs: PulseScanListItem[]) => xs.map((x) => x.id);

describe("All scans", () => {
  it("opens newest first", () => {
    expect(DEFAULT_SCAN_SORT).toEqual({ key: "scanned", dir: "desc" });
    expect(ids(sortScansBy(all, "scanned", "desc", changes))).toEqual(["f", "a2", "b2", "r", "b1", "a1"]);
  });
  it("works out each scan's change against the same project's previous scan, matching URLs loosely", () => {
    expect(changes.get("a2")).toBe(-10);
    expect(changes.get("b2")).toBe(40);
    expect(changes.get("a1")).toBeNull();
  });
  it("puts a scan with no score last whichever way score is sorted, even when it is the newest", () => {
    expect(sortScansBy(all, "score", "desc", changes).at(-1)!.id).toBe("f");
    expect(sortScansBy(all, "score", "asc", changes).at(-1)!.id).toBe("f");
    expect(sortScansBy(all, "score", "asc", changes)[0].id).toBe("r");
  });
  it("filters by score band, type, status and movement", () => {
    expect(ids(filterScans(all, { ...DEFAULT_SCAN_FILTERS, health: "poor" }, none))).toEqual(["r"]);
    expect(ids(filterScans(all, { ...DEFAULT_SCAN_FILTERS, kind: "repo" }, none))).toEqual(["r"]);
    expect(ids(filterScans(all, { ...DEFAULT_SCAN_FILTERS, status: "FAILED" }, none))).toEqual(["f"]);
    expect(ids(filterScans(all, { ...DEFAULT_SCAN_FILTERS, movement: "regressed" }, none))).toEqual(["a2"]);
    expect(ids(filterScans(all, { ...DEFAULT_SCAN_FILTERS, movement: "improved" }, none))).toEqual(["b2"]);
    expect(scanHealth(75)).toBe("good");
    expect(scanKind(scan({ inputUrl: "https://apps.apple.com/gb/app/x/id1" }))).toBe("store");
  });
  it("filters by monitoring", () => {
    const monitorOf = (s: PulseScanListItem) => (s.inputUrl?.includes("b.com") ? { active: true, alerting: false } : undefined);
    expect(ids(filterScans(all, { ...DEFAULT_SCAN_FILTERS, monitoring: "monitored" }, { changes, monitorOf }))).toEqual(["b1", "b2"]);
    expect(filterScans(all, { ...DEFAULT_SCAN_FILTERS, monitoring: "alerting" }, { changes, monitorOf })).toEqual([]);
  });
});
