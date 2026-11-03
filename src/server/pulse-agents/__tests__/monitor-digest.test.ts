import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/server/email", () => ({ sendWorkspaceEmail: vi.fn() }));

import { DIGEST_INTERVAL_MS, isDigestDue, issueDiff, parseDigestEmails } from "../monitor-digest";
import { renderWeeklyDigestEmail, type DigestEmailInput } from "@/server/pulse-lite/report-email";

const DAY = 24 * 60 * 60 * 1000;

describe("when a digest is due", () => {
  const now = Date.UTC(2026, 9, 26, 5);
  it("needs recipients", () => {
    expect(isDigestDue(now, null, [])).toBe(false);
    expect(isDigestDue(now, null, ["a@b.co"])).toBe(true);
  });

  it("sends weekly from a daily 05:00 run, never on day 6 and never sliding to day 8", () => {
    expect(isDigestDue(now, new Date(now - 6 * DAY), ["a@b.co"])).toBe(false);
    // A run a few minutes earlier than last week's still counts as a week.
    expect(isDigestDue(now, new Date(now - 7 * DAY + 10 * 60 * 1000), ["a@b.co"])).toBe(true);
    expect(DIGEST_INTERVAL_MS).toBeGreaterThan(6.5 * DAY);
  });
});

describe("recipients", () => {
  it("keeps valid, distinct addresses, lower-cased, up to 10", () => {
    const many = Array.from({ length: 14 }, (_, i) => `p${i}@client.com`);
    expect(parseDigestEmails(["A@Client.com", "a@client.com", "not-an-email", 7, null])).toEqual(["a@client.com"]);
    expect(parseDigestEmails(many)).toHaveLength(10);
    expect(parseDigestEmails("a@b.co")).toEqual([]);
  });
});

describe("issueDiff", () => {
  const cur = [{ checkKey: "rls", label: "RLS is on" }, { checkKey: "hsts", label: "HSTS set" }];
  it("names what is new and what was fixed since the last digest", () => {
    const d = issueDiff([{ checkKey: "hsts" }, { checkKey: "csp" }], cur);
    expect(d).toEqual({ open: ["RLS is on", "HSTS set"], added: ["RLS is on"], fixed: ["csp"] });
  });
  it("calls nothing new on the first digest, which has nothing to compare with", () => {
    expect(issueDiff(null, cur).added).toEqual([]);
  });
});

describe("the email", () => {
  const input: DigestEmailInput = {
    projectName: "Cadenza <script>",
    subject: "cadenza-app/cadenza",
    score: 71,
    scoreDelta: 3,
    since: "2026-10-19T05:00:00.000Z",
    openIssues: ["Row-level security is off — anyone can read user rows"],
    newIssues: [],
    fixedIssues: ["CSP header set"],
    codeHealth: { score: 68, scoreDelta: -2, effortDays: 12.5, resolvedDebt: 3, newDebt: 1, hotspots: ["server/billing/invoice.ts (64 changes this year, complexity 188)"] },
    reportPdfUrl: "https://foundry.gitwork.co.uk/api/public/pulse/report/abc/pdf",
    logoUrl: "https://foundry.gitwork.co.uk/email/gitwork-wordmark-ink.png",
  };
  const { subject, html } = renderWeeklyDigestEmail(input);

  it("leads the subject with the project and the movement", () => {
    expect(subject).toBe("Weekly Pulse: Cadenza <script> 71/100 (up 3)");
  });

  it("escapes what came from the scan and carries no em dashes", () => {
    expect(html).not.toContain("<script>");
    expect(html).toContain("Cadenza &lt;script&gt;");
    expect(html).not.toMatch(/[—–]/);
  });

  it("includes the code health line and the report link", () => {
    expect(html).toContain("68/100");
    expect(html).toContain("12.5 days");
    expect(html).toContain("server/billing/invoice.ts");
    expect(html).toContain(input.reportPdfUrl);
  });

  it("does not say free", () => {
    expect(html.replace(/<[^>]+>/g, " ")).not.toMatch(/\bfree\b/i);
  });
});
