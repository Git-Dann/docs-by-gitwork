import { describe, expect, it } from "vitest";
import {
  deriveReplyState,
  waitingMs,
  foldMessageActivity,
  matchesReplyState,
} from "@/server/support-reply-state";
import type { ReplyState } from "@/types/support";

const T = (iso: string) => new Date(iso);
const MON_9AM = "2026-08-10T09:00:00.000Z";
const MON_11AM = "2026-08-10T11:00:00.000Z";

describe("deriveReplyState", () => {
  it("is awaiting_reply when the customer wrote and nobody has answered", () => {
    expect(deriveReplyState({ lastInboundAt: T(MON_9AM), lastOutboundAt: null })).toBe("awaiting_reply");
  });

  it("is replied when our message is newer than theirs", () => {
    expect(deriveReplyState({ lastInboundAt: T(MON_9AM), lastOutboundAt: T(MON_11AM) })).toBe("replied");
  });

  it("is awaiting_reply again when they come back after our reply", () => {
    expect(deriveReplyState({ lastInboundAt: T(MON_11AM), lastOutboundAt: T(MON_9AM) })).toBe("awaiting_reply");
  });

  it("is no_inbound for an empty thread — nothing is owed", () => {
    expect(deriveReplyState({})).toBe("no_inbound");
    expect(deriveReplyState({ lastInboundAt: null, lastOutboundAt: null })).toBe("no_inbound");
  });

  it("is no_inbound for a thread we started with no customer message", () => {
    // Outbound-only must NOT count as "replied to" — there was nothing to reply to. It also
    // must not sit in the awaiting queue, because no customer is waiting.
    expect(deriveReplyState({ lastInboundAt: null, lastOutboundAt: T(MON_9AM) })).toBe("no_inbound");
  });

  it("fails toward awaiting_reply on an exact timestamp tie", () => {
    // Asymmetric errors: a false "replied" hides a waiting customer (the failure this module
    // exists to prevent); a false "awaiting" only costs a glance. Never flip this to >=.
    expect(deriveReplyState({ lastInboundAt: T(MON_9AM), lastOutboundAt: T(MON_9AM) })).toBe("awaiting_reply");
  });

  it("accepts ISO strings as well as Dates, so a DTO can be passed straight in", () => {
    expect(deriveReplyState({ lastInboundAt: MON_9AM, lastOutboundAt: MON_11AM })).toBe("replied");
    expect(deriveReplyState({ lastInboundAt: MON_11AM, lastOutboundAt: MON_9AM })).toBe("awaiting_reply");
  });

  it("treats an unparseable timestamp as absent rather than throwing", () => {
    expect(deriveReplyState({ lastInboundAt: "not-a-date", lastOutboundAt: MON_9AM })).toBe("no_inbound");
  });
});

describe("waitingMs", () => {
  it("measures from the customer's last message", () => {
    const now = T("2026-08-10T12:00:00.000Z");
    expect(waitingMs({ lastInboundAt: T(MON_9AM) }, now)).toBe(3 * 3600_000);
  });

  it("is null once we have replied — nobody is waiting", () => {
    const now = T("2026-08-10T12:00:00.000Z");
    expect(waitingMs({ lastInboundAt: T(MON_9AM), lastOutboundAt: T(MON_11AM) }, now)).toBeNull();
  });

  it("is null with no inbound message at all", () => {
    expect(waitingMs({}, T(MON_11AM))).toBeNull();
  });

  it("clamps to zero rather than reporting a negative wait on clock skew", () => {
    // The mail host stamps the message; this server stamps `now`. They are different clocks.
    expect(waitingMs({ lastInboundAt: T(MON_11AM) }, T(MON_9AM))).toBe(0);
  });
});

describe("foldMessageActivity", () => {
  it("takes the newest of each direction", () => {
    const patch = foldMessageActivity([
      { direction: "inbound", createdAt: T(MON_9AM) },
      { direction: "outbound", createdAt: T(MON_11AM) },
      { direction: "inbound", createdAt: T("2026-08-10T10:00:00.000Z") },
    ]);
    expect(patch.lastInboundAt).toEqual(T("2026-08-10T10:00:00.000Z"));
    expect(patch.lastOutboundAt).toEqual(T(MON_11AM));
    expect(patch.lastMessageAt).toEqual(T(MON_11AM));
  });

  it("reports sawInbound only when a customer message landed", () => {
    // This is what `unread` is gated on. Our own reply syncing back from Gmail/Sent must not
    // re-flag the thread as unread — that is why the unread counters only ever grew.
    expect(foldMessageActivity([{ direction: "outbound", createdAt: T(MON_9AM) }]).sawInbound).toBe(false);
    expect(foldMessageActivity([{ direction: "inbound", createdAt: T(MON_9AM) }]).sawInbound).toBe(true);
  });

  it("never drags a timestamp backwards when older mail arrives late", () => {
    // IMAP reads INBOX and Sent in separate passes, and a backfill can surface older mail than
    // the newest row already stored — so out-of-order folding is normal, not exceptional.
    const patch = foldMessageActivity(
      [{ direction: "inbound", createdAt: T(MON_9AM) }],
      { lastInboundAt: T(MON_11AM), lastOutboundAt: null },
    );
    expect(patch.lastInboundAt).toBeUndefined(); // no write — the stored value is already newer
    expect(patch.lastMessageAt).toEqual(T(MON_11AM));
  });

  it("emits no timestamp fields for an empty batch", () => {
    const patch = foldMessageActivity([]);
    expect(patch.lastInboundAt).toBeUndefined();
    expect(patch.lastOutboundAt).toBeUndefined();
    expect(patch.lastMessageAt).toBeUndefined();
    expect(patch.sawInbound).toBe(false);
  });

  it("carries the existing stamps into lastMessageAt when only one direction moves", () => {
    const patch = foldMessageActivity(
      [{ direction: "outbound", createdAt: T(MON_11AM) }],
      { lastInboundAt: T(MON_9AM), lastOutboundAt: null },
    );
    expect(patch.lastOutboundAt).toEqual(T(MON_11AM));
    expect(patch.lastMessageAt).toEqual(T(MON_11AM));
    // …and the folded result is what flips the conversation to "replied".
    expect(deriveReplyState({ lastInboundAt: T(MON_9AM), lastOutboundAt: patch.lastOutboundAt })).toBe("replied");
  });
});

describe("matchesReplyState — the filter rule and the display rule must agree", () => {
  // Every combination that can reach the database, including both nulls and the exact tie.
  const A = "2026-08-10T09:00:00.000Z";
  const B = "2026-08-10T11:00:00.000Z";
  const MATRIX: Array<{ lastInboundAt: string | null; lastOutboundAt: string | null }> = [
    { lastInboundAt: null, lastOutboundAt: null },
    { lastInboundAt: null, lastOutboundAt: A },
    { lastInboundAt: A, lastOutboundAt: null },
    { lastInboundAt: A, lastOutboundAt: B }, // we answered
    { lastInboundAt: B, lastOutboundAt: A }, // they came back
    { lastInboundAt: A, lastOutboundAt: A }, // tie
  ];
  const STATES: ReplyState[] = ["awaiting_reply", "replied", "no_inbound"];

  it("partitions the space — every conversation matches exactly one state", () => {
    // If this fails, a conversation is either in two queues at once or has fallen out of all of
    // them. The awaiting queue silently losing rows is the failure this whole feature exists to
    // remove, so it must be impossible by construction rather than by inspection.
    for (const row of MATRIX) {
      const hits = STATES.filter((s) => matchesReplyState(s, row));
      expect(hits, `expected exactly one state for ${JSON.stringify(row)}`).toHaveLength(1);
    }
  });

  it("agrees with deriveReplyState on every case", () => {
    // The list is filtered by the query rule and each row is then labelled by the display rule.
    // If they disagree, a row appears under "Awaiting reply" wearing a "Replied" chip.
    for (const row of MATRIX) {
      const shown = deriveReplyState(row);
      expect(matchesReplyState(shown, row), `mismatch for ${JSON.stringify(row)}`).toBe(true);
    }
  });

  it("puts an exact tie in the awaiting queue, matching the `lte` in the SQL branch", () => {
    expect(matchesReplyState("awaiting_reply", { lastInboundAt: A, lastOutboundAt: A })).toBe(true);
    expect(matchesReplyState("replied", { lastInboundAt: A, lastOutboundAt: A })).toBe(false);
  });

  it("keeps a never-answered conversation in its own queue (the NULL-comparison trap)", () => {
    // SQL comparisons against NULL yield NULL, not true — so without an explicit
    // `lastOutboundAt IS NULL` branch the query drops exactly the conversations nobody has
    // replied to, which are the only ones that matter.
    expect(matchesReplyState("awaiting_reply", { lastInboundAt: A, lastOutboundAt: null })).toBe(true);
  });
});
