import { describe, expect, it } from "vitest";
import { newDemoCareState, rankDemoSemantic, resolveDemoCare, type DemoSearchable } from "@/lib/demo/demo-care";
import { resolveDemoApi } from "@/lib/demo/dev-demo-data";

const rows: DemoSearchable[] = [
  { id: "a", subject: "Search is slow on older phones", preview: "Love the app but search takes ages", source: "app_reviews", customerLabel: "App Store", receivedAt: "2026-11-01T00:00:00Z" },
  { id: "b", subject: "Can we add a dark theme?", preview: "Users asked about dark mode", source: "gmail", customerLabel: "priya@northwind.co", receivedAt: "2026-11-01T00:00:00Z" },
  { id: "c", subject: "Webhook docs unclear", preview: null, source: "discord", customerLabel: "@dev_sam", receivedAt: "2026-11-01T00:00:00Z" },
];

describe("rankDemoSemantic", () => {
  it("ranks by shared words and leaves out rows that share none", () => {
    const out = rankDemoSemantic(rows, "the app is slowly loading");
    expect(out.map((r) => r.id)).toEqual(["a"]);
    expect(out[0].score).toBeGreaterThan(0);
  });

  it("an empty or stop-word-only query finds nothing, never everything", () => {
    expect(rankDemoSemantic(rows, "")).toEqual([]);
    expect(rankDemoSemantic(rows, "the and of")).toEqual([]);
  });

  it("respects the limit and carries a null preview through", () => {
    const out = rankDemoSemantic(rows, "dark webhook", 1);
    expect(out).toHaveLength(1);
    expect(rankDemoSemantic(rows, "webhook")[0].preview).toBeNull();
  });
});

describe("resolveDemoCare", () => {
  const convs = { c1: rows };

  it("answers health, performance, stats and the audit log", () => {
    const s = newDemoCareState();
    const health = resolveDemoCare(s, "/api/support/clients/sup-northwind/health", undefined, convs) as { health: { score: number; tier: string } };
    expect(health.health.score).toBeGreaterThan(0);
    expect(health.health.tier).toBe("healthy");
    expect(resolveDemoCare(s, "/api/support/clients/sup-cadenza/health", undefined, convs)).toMatchObject({ health: { tier: "watch" } });
    expect(resolveDemoCare(s, "/api/support/clients/x/conversations/performance", undefined, convs)).toHaveProperty("metrics.slaTargetHours", 4);
    expect(resolveDemoCare(s, "/api/support/clients/x/conversations/stats", undefined, convs)).toHaveProperty("stats.totalTickets");
    expect((resolveDemoCare(s, "/api/support/clients/x/audit-logs", undefined, convs) as { logs: unknown[] }).logs.length).toBeGreaterThan(0);
  });

  it("adds, edits and deletes a report in memory", () => {
    const s = newDemoCareState();
    const base = "/api/support/clients/sup-northwind/reports";
    const before = (resolveDemoCare(s, base, undefined, convs) as { reports: unknown[] }).reports.length;
    const { report } = resolveDemoCare(s, base, { method: "POST", body: JSON.stringify({ period: "December 2026" }) }, convs) as { report: { id: string } };
    expect((resolveDemoCare(s, base, undefined, convs) as { reports: unknown[] }).reports).toHaveLength(before + 1);
    expect(resolveDemoCare(s, `${base}/${report.id}`, { method: "PATCH", body: JSON.stringify({ period: "Dec" }) }, convs)).toMatchObject({ report: { period: "Dec" } });
    resolveDemoCare(s, `${base}/${report.id}`, { method: "DELETE" }, convs);
    expect((resolveDemoCare(s, base, undefined, convs) as { reports: unknown[] }).reports).toHaveLength(before);
    expect(resolveDemoCare(s, `${base}/nope`, { method: "DELETE" }, convs)).toMatchObject({ __status: 404 });
  });

  it("adds, edits, deletes and restores workflow rules", () => {
    const s = newDemoCareState();
    const base = "/api/support/clients/sup-cadenza/workflow-rules";
    const list = () => (resolveDemoCare(s, base, undefined, convs) as { rules: Array<{ id: string; name: string }> }).rules;
    expect(list()).toHaveLength(1);
    const { rule } = resolveDemoCare(s, base, { method: "POST", body: JSON.stringify({ name: "VIP", when: "x", then: "y" }) }, convs) as { rule: { id: string } };
    resolveDemoCare(s, `${base}/${rule.id}`, { method: "PATCH", body: JSON.stringify({ name: "VIP customers" }) }, convs);
    expect(list().find((r) => r.id === rule.id)?.name).toBe("VIP customers");
    resolveDemoCare(s, `${base}/${rule.id}`, { method: "DELETE" }, convs);
    expect(list()).toHaveLength(1);
    resolveDemoCare(s, "/api/support/clients/sup-cadenza/seed-rules", { method: "POST" }, convs);
    expect(list()).toHaveLength(3);
  });

  it("AI search ranks the client's own conversations", () => {
    const s = newDemoCareState();
    const out = resolveDemoCare(s, "/api/support/clients/c1/conversations/search", { method: "POST", body: JSON.stringify({ query: "dark mode" }) }, convs) as { results: Array<{ id: string }> };
    expect(out.results.map((r) => r.id)).toEqual(["b"]);
  });

  it("falls through for routes it does not own", () => {
    expect(resolveDemoCare(newDemoCareState(), "/api/support/clients/x/conversations", undefined, convs)).toBeUndefined();
    expect(resolveDemoCare(newDemoCareState(), "/api/tasks", undefined, convs)).toBeUndefined();
  });

  it("is wired into the demo API, so /demo/care no longer hits the empty catch-all", () => {
    expect(resolveDemoApi("/api/support/clients/sup-northwind/reports")).toHaveProperty("reports");
    expect(resolveDemoApi("/api/support/clients/sup-northwind/workflow-rules")).toHaveProperty("rules");
    expect(resolveDemoApi("/api/support/clients/sup-northwind/health")).toHaveProperty("health.score");
  });
});
