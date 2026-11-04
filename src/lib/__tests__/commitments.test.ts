import { describe, expect, it } from "vitest";
import {
  actionItemIsMine,
  addWorkingDays,
  countSnoozed,
  followUpFromEvent,
  groupOpenCommitments,
  normaliseExtraction,
  parseDueDate,
  quoteAppearsIn,
  snoozeUntil,
  stripQuotedEmail,
  suggestionKey,
  transition,
  type CalendarEventLike,
  type ListableCommitment,
} from "@/lib/commitments";

const NOW = new Date("2026-11-04T12:00:00Z"); // a Wednesday

describe("stripQuotedEmail", () => {
  it("keeps what the sender wrote and drops the Gmail quote chain", () => {
    const body = [
      "Hi Sam,",
      "",
      "I'll send the revised quote over by Friday.",
      "",
      "Dan",
      "",
      "On Tue, 3 Nov 2026 at 10:02, Sam Lee <sam@valu.com>",
      "wrote:",
      "> Can you also confirm you'll cover the iOS build?",
      "> We will send the brief tomorrow.",
    ].join("\n");
    const out = stripQuotedEmail(body);
    expect(out).toContain("I'll send the revised quote over by Friday.");
    expect(out).not.toContain("We will send the brief");
    expect(out).not.toContain("wrote:");
  });

  it("stops at a signature delimiter and an Outlook header block", () => {
    expect(stripQuotedEmail("Will do.\n-- \nDan Lindsay\nGitwork")).toBe("Will do.");
    expect(
      stripQuotedEmail("Happy to.\n\nFrom: Sam Lee <sam@valu.com>\nSent: 3 November 2026\nI promise nothing"),
    ).toBe("Happy to.");
  });

  it("drops > quoted lines even without a header", () => {
    expect(stripQuotedEmail("Sure, I'll book it.\n> they will pay")).toBe("Sure, I'll book it.");
  });
});

describe("quoteAppearsIn", () => {
  const text = "Hi Sam, I'll send the revised quote over by Friday. Thanks!";
  it("accepts the words with different case, punctuation and spacing", () => {
    expect(quoteAppearsIn("i'll send the REVISED quote over  by friday", text)).toBe(true);
    expect(quoteAppearsIn("I’ll send the revised quote over by Friday", text)).toBe(true);
  });
  it("rejects words that aren't there, and anything under four words", () => {
    expect(quoteAppearsIn("I'll send the signed contract by Friday", text)).toBe(false);
    expect(quoteAppearsIn("by Friday", text)).toBe(false);
  });
});

describe("parseDueDate", () => {
  it("parses a plausible date to 17:00 UTC", () => {
    expect(parseDueDate("2026-11-06", NOW)?.toISOString()).toBe("2026-11-06T17:00:00.000Z");
  });
  it("rejects nonsense, impossible days and far-off dates", () => {
    expect(parseDueDate("Friday", NOW)).toBeNull();
    expect(parseDueDate("2026-02-31", NOW)).toBeNull();
    expect(parseDueDate("2031-01-01", NOW)).toBeNull();
    expect(parseDueDate("2025-01-01", NOW)).toBeNull();
    expect(parseDueDate(null, NOW)).toBeNull();
  });
});

describe("normaliseExtraction", () => {
  const messages = [
    { id: "gmail:1", text: "Hi Sam, I'll send the revised quote over by Friday. Thanks" },
    { id: "slack:c:1", text: "leave it with me, I will check with the team and come back tomorrow" },
  ];

  it("keeps suggestions whose quote is in the message they cite", () => {
    const out = normaliseExtraction(
      {
        commitments: [
          { title: "Send revised quote to Sam", quote: "I'll send the revised quote over by Friday", messageId: "gmail:1", due: "2026-11-06", to: "Sam", reason: "Promised in email." },
        ],
      },
      messages,
      NOW,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ messageId: "gmail:1", title: "Send revised quote to Sam", counterpart: "Sam" });
    expect(out[0].dueAt?.toISOString()).toBe("2026-11-06T17:00:00.000Z");
  });

  it("drops an invented quote, an unknown message, an empty title and duplicates", () => {
    const out = normaliseExtraction(
      {
        commitments: [
          { title: "Send the contract", quote: "I'll send the signed contract today", messageId: "gmail:1" },
          { title: "Call Sam", quote: "I'll send the revised quote over by Friday", messageId: "gmail:99" },
          { title: "", quote: "I will check with the team and come back", messageId: "slack:c:1" },
          { title: "Check with the team", quote: "I will check with the team and come back", messageId: "slack:c:1" },
          { title: "check with the team!", quote: "I will check with the team and come back", messageId: "slack:c:1" },
        ],
      },
      messages,
      NOW,
    );
    expect(out.map((o) => o.title)).toEqual(["Check with the team"]);
  });

  it("returns nothing for a reply that isn't the expected shape", () => {
    expect(normaliseExtraction(null, messages, NOW)).toEqual([]);
    expect(normaliseExtraction({ commitments: "nope" }, messages, NOW)).toEqual([]);
  });
});

describe("followUpFromEvent", () => {
  const base: CalendarEventLike = {
    id: "e1",
    summary: "Valu discovery",
    start: { dateTime: "2026-11-03T10:00:00Z" },
    end: { dateTime: "2026-11-03T11:00:00Z" },
    attendees: [
      { email: "dan@gitwork.co.uk", self: true, responseStatus: "accepted" },
      { email: "sam@valu.com", displayName: "Sam Lee", responseStatus: "accepted" },
    ],
  };
  const opts = { userEmail: "dan@gitwork.co.uk", internalDomains: ["gitwork.co.uk", "gitwork.io"], now: NOW };

  it("suggests a follow-up for a recent meeting with someone outside", () => {
    const out = followUpFromEvent(base, opts);
    expect(out?.title).toBe("Follow up with Sam Lee after “Valu discovery”");
    // Tuesday 11:00 + 2 working days = Thursday.
    expect(out?.dueAt.toISOString()).toBe("2026-11-05T11:00:00.000Z");
  });

  it("skips internal, declined, cancelled, all-day, future and old meetings", () => {
    expect(
      followUpFromEvent({ ...base, attendees: [{ email: "dan@gitwork.co.uk", self: true }, { email: "harry@gitwork.io" }] }, opts),
    ).toBeNull();
    expect(
      followUpFromEvent(
        { ...base, attendees: [{ email: "dan@gitwork.co.uk", self: true, responseStatus: "declined" }, { email: "sam@valu.com" }] },
        opts,
      ),
    ).toBeNull();
    expect(followUpFromEvent({ ...base, status: "cancelled" }, opts)).toBeNull();
    expect(followUpFromEvent({ ...base, start: { date: "2026-11-03" }, end: { date: "2026-11-04" } }, opts)).toBeNull();
    expect(followUpFromEvent({ ...base, end: { dateTime: "2026-11-04T15:00:00Z" } }, opts)).toBeNull();
    expect(followUpFromEvent({ ...base, end: { dateTime: "2026-10-28T11:00:00Z" } }, opts)).toBeNull();
  });

  it("ignores meeting rooms and names a group by its first person", () => {
    const out = followUpFromEvent(
      {
        ...base,
        attendees: [
          ...(base.attendees ?? []),
          { email: "room@resource.calendar.google.com", resource: true },
          { email: "jo@valu.com" },
          { email: "kim@valu.com" },
        ],
      },
      opts,
    );
    expect(out?.counterpart).toBe("Sam Lee and 2 others");
  });
});

describe("transition", () => {
  const open = { state: "open" as const, doneAt: null, snoozedUntil: null };
  it("stamps done and clears it on reopen", () => {
    const done = transition(open, "done", NOW);
    expect(done).toMatchObject({ state: "done", doneAt: NOW });
    expect(transition(done as typeof open, "open", NOW)).toMatchObject({ state: "open", doneAt: null });
  });
  it("never puts something back to suggested", () => {
    expect(transition(open, "suggested", NOW)).toHaveProperty("error");
  });
  it("accepting a suggestion opens it", () => {
    expect(transition({ state: "suggested", doneAt: null, snoozedUntil: null }, "open", NOW)).toMatchObject({ state: "open" });
  });
});

describe("groupOpenCommitments", () => {
  const item = (id: string, dueAt: string | null, extra: Partial<ListableCommitment> = {}): ListableCommitment => ({
    id,
    state: "open",
    dueAt,
    snoozedUntil: null,
    createdAt: "2026-11-01T00:00:00Z",
    ...extra,
  });

  it("orders overdue, today, this week, later, then no date", () => {
    const groups = groupOpenCommitments(
      [
        item("someday", null),
        item("later", "2026-12-20T17:00:00Z"),
        item("week", "2026-11-08T17:00:00Z"),
        item("today", "2026-11-04T17:00:00Z"),
        item("overdue", "2026-11-02T17:00:00Z"),
        item("done", "2026-11-02T17:00:00Z", { state: "done" }),
        item("suggested", null, { state: "suggested" }),
      ],
      NOW,
    );
    expect(groups.map((g) => [g.id, g.items.map((i) => i.id)])).toEqual([
      ["overdue", ["overdue"]],
      ["today", ["today"]],
      ["week", ["week"]],
      ["later", ["later"]],
      ["someday", ["someday"]],
    ]);
  });

  it("hides a snoozed item until its snooze ends, and counts it", () => {
    const items = [item("a", null, { snoozedUntil: "2026-11-05T09:00:00Z" }), item("b", null, { snoozedUntil: "2026-11-01T09:00:00Z" })];
    expect(groupOpenCommitments(items, NOW).flatMap((g) => g.items.map((i) => i.id))).toEqual(["b"]);
    expect(countSnoozed(items, NOW)).toBe(1);
  });
});

describe("small helpers", () => {
  it("skips weekends when adding working days", () => {
    expect(addWorkingDays(new Date("2026-11-06T10:00:00Z"), 1).toISOString()).toBe("2026-11-09T10:00:00.000Z");
  });
  it("snooze presets land where they say", () => {
    expect(snoozeUntil("tomorrow", NOW).toISOString()).toBe("2026-11-05T09:00:00.000Z");
    expect(snoozeUntil("next-week", NOW).toISOString()).toBe("2026-11-09T09:00:00.000Z");
  });
  it("gives one key per source, message and promise", () => {
    expect(suggestionKey("gmail", "gmail:1", "Send the quote!")).toBe(suggestionKey("gmail", "gmail:1", "send the quote"));
    expect(suggestionKey("gmail", "gmail:1", "Send the quote")).not.toBe(suggestionKey("slack", "gmail:1", "Send the quote"));
  });
});

describe("only suggestions that are clearly yours", () => {
  const base: CalendarEventLike = {
    id: "e1",
    summary: "Wedge Team x Dan",
    start: { dateTime: "2026-11-03T10:00:00Z" },
    end: { dateTime: "2026-11-03T11:00:00Z" },
    attendees: [
      { email: "dan@gitwork.co.uk", self: true, responseStatus: "accepted" },
      { email: "nasirjavediit@gmail.com", responseStatus: "accepted" },
    ],
  };
  const opts = { userEmail: "dan@gitwork.co.uk", internalDomains: ["gitwork.co.uk"], now: NOW };

  it("no follow-up after a repeating meeting like a stand-up", () => {
    expect(followUpFromEvent({ ...base, recurringEventId: "standup" }, opts)).toBeNull();
    expect(followUpFromEvent(base, opts)).not.toBeNull();
  });

  it("a teammate on a personal address is not someone outside", () => {
    expect(followUpFromEvent(base, { ...opts, internalEmails: new Set(["nasirjavediit@gmail.com"]) })).toBeNull();
  });

  it("an action item is mine only when the notes name me", () => {
    const me = { email: "dan@gitwork.co.uk", name: "Dan Lindsay" };
    expect(actionItemIsMine("Dan", me)).toBe(true);
    expect(actionItemIsMine("Dan Lindsay", me)).toBe(true);
    expect(actionItemIsMine("Dan and Harry", me)).toBe(true);
    expect(actionItemIsMine("dan@gitwork.co.uk", me)).toBe(true);
    expect(actionItemIsMine("Daniela", me)).toBe(false);
    expect(actionItemIsMine("Luke (Big Wedge)", me)).toBe(false);
    expect(actionItemIsMine(null, me)).toBe(false);
    expect(actionItemIsMine("", me)).toBe(false);
  });
});
