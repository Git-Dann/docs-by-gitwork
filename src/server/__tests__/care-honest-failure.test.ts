import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The four places Care used to turn "we could not look" into a confident statement.
 *
 * Each of these is the §35 mistake in a different costume, and each one is asserted on the
 * SOURCE rather than by running it: they are all single writes buried in a sync pass or an
 * agent, and mocking a Prisma client deeply enough to drive them would test the mock. What
 * matters is that the shape that produced the lie cannot come back.
 */

const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");

describe("a failed AI classification is not a classification", () => {
  const src = read("src/server/care-agents/triage-agent.ts");

  it("does not keep a default decision when the call throws", () => {
    /*
     * The shape that was wrong:
     *
     *     let decision = { issueType: "other", priority: "normal", sentiment: "neutral", … };
     *     try { decision = extractJson(response, decision); } catch { /* keep defaults *\/ }
     *
     * — then it wrote those defaults to the row AND an `agent_classified` audit entry, so an AI
     * outage produced a conversation that looked triaged and a log saying the agent had done it.
     */
    expect(src).not.toMatch(/let decision: TriageDecision = \{/);
    expect(src).toMatch(/let decision: TriageDecision \| null = null;/);
  });

  it("never passes a usable decision as extractJson's fallback", () => {
    // `extractJson` returns its fallback for prose, or for JSON with no fields. A real decision
    // there is the same bug one layer down: unparseable output stored as a confident verdict.
    expect(src).toMatch(/extractJson<unknown>\(response, null\)/);
  });

  it("records why, in plain words, and returns without writing", () => {
    expect(src).toContain('action: "enrichment_failed"');
    expect(src).toContain("describeAiError");
    // The early return is what leaves sentiment / issueType / priority alone.
    const failureBlock = src.split("if (!decision) {")[1].split("}")[0];
    expect(failureBlock).toContain("return");
    expect(failureBlock).not.toContain("supportConversation.update");
  });

  it("the reason reaches the screen, not just the database", () => {
    // A log entry saying only "Enrichment Failed" sends someone to read server logs.
    expect(read("src/types/support.ts")).toMatch(/reason: string \| null;/);
    expect(read("src/components/care/care-automation.tsx")).toContain("log.reason");
  });
});

describe("every ingest path stamps reply state through the one writer", () => {
  it("the webhook route does not hand-roll unread", () => {
    /*
     * It did `update({ data: { unread: true, preview } })` and never called
     * `recordMessageActivity`, so a webhook conversation was born with all three stamps null →
     * `no_inbound` → rendered "Sent by us" and sat outside the awaiting queue. It also raised
     * `unread` for our own messages, the defect §42.2 removed everywhere else.
     */
    const src = read("src/app/api/support/webhook/[token]/route.ts");
    expect(src).toContain("recordMessageActivity");
    expect(src).not.toMatch(/data: \{ unread: true/);
  });

  it("no file that creates a SupportMessage sets the stamps by hand", () => {
    // The sweep that would have caught the webhook: every creator goes through the one writer.
    const creators = [
      "src/app/api/support/webhook/[token]/route.ts",
      "src/server/support-channels/core.ts",
      "src/server/support.ts",
    ].filter((f) => {
      try { return read(f).includes("supportMessage.create"); } catch { return false; }
    });
    expect(creators.length, "no SupportMessage creators found — this sweep has gone blind").toBeGreaterThan(0);
    for (const f of creators) {
      const src = read(f);
      const handRolled = src.match(/lastInboundAt:\s*[^,}\n]+/g) ?? [];
      // `support.ts` declares the writer itself, so it is allowed to name the columns.
      if (f !== "src/server/support.ts") {
        expect(handRolled, `${f} stamps activity by hand instead of calling recordMessageActivity`).toEqual([]);
      }
    }
  });
});

describe("one Replied count", () => {
  const src = read("src/server/support.ts");

  it("is counted, not derived by subtraction", () => {
    /*
     * `replied = open - awaiting` folds in `no_inbound` — a thread we started, or one rebuilt
     * from the Sent folder, where no customer has written at all. Care home and the client's own
     * queue therefore printed different numbers for the same client, from the same data.
     */
    expect(src).not.toMatch(/s\.replied = Math\.max\(0, s\.open - s\.awaiting\)/);
    expect(src).toContain('ensure(r.clientId).replied = r._count._all');
  });

  it("uses the same predicate as the per-client counts", () => {
    const summaries = src.split("export async function getClientQueueSummaries")[1].split("\nexport ")[0];
    expect(summaries).toContain('replyStateWhere("replied")');
  });
});

describe("housekeeping reaches every client, not just the ones syncing", () => {
  it("the cron's client set comes from all connectors, not the due ones", () => {
    /*
     * `touchedClientIds` was built from the interval-FILTERED set, so a client whose connectors
     * are all manual-only — or not due this minute — never got the forwarded-identity repair,
     * the activity backfill or the course-request drain. The client set is the point, not the
     * sync set.
     */
    const src = read("src/app/api/cron/support-sync/route.ts");
    const block = src.split("const touchedClientIds")[1].split("];")[0];
    expect(block).toContain("allConnections.map");
    expect(block).not.toContain("connections.map((c)");
  });
});
