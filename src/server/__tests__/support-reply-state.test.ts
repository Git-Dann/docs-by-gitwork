import { describe, expect, it } from "vitest";
import { deriveReplyState, waitingMs, foldMessageActivity } from "@/server/support-reply-state";

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
