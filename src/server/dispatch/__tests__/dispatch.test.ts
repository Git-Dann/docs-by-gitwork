import { describe, it, expect } from "vitest";
import { resolveDispatchConfig } from "../config";
import { composeDeterministicAnswer } from "../answer";
import { deriveBlindSpots } from "../evidence";
import {
  mentionedSlackUserIds,
  normalise,
  resolveSubject,
  stripBotMention,
  type ClientCandidate,
  type PersonCandidate,
} from "../resolve";
import { isBotAuthored, isQuestionEvent, parseEventBody } from "@/server/slack/events";
import { DISPATCH_DEFAULTS, type DispatchEvidence, type DispatchSubject, type EvidenceTask } from "../types";

const BOT = "U0BOT";

const CLIENTS: ClientCandidate[] = [
  { id: "c1", name: "Electric Fire", slug: "electric-fire" },
  { id: "c2", name: "Echo", slug: "echo" },
  { id: "c3", name: "Big Wedge Golf", slug: "big-wedge-golf" },
];

const PEOPLE: PersonCandidate[] = [
  { id: "u1", name: "Howard Chen", email: "howard@gitwork.co.uk", aliases: ["Howard"] },
  { id: "u2", name: "Marcus Aurelius", email: "marcus@gitwork.co.uk" },
];

// ─── stripBotMention ────────────────────────────────────────────────────────

describe("stripBotMention", () => {
  it("removes the bot's own mention and leaves the question", () => {
    expect(stripBotMention(`<@${BOT}> where are we with Electric Fire?`, BOT)).toBe(
      "where are we with Electric Fire?",
    );
  });

  it("keeps a labelled mention's label so the person is still matchable", () => {
    expect(stripBotMention(`<@${BOT}> what has <@U9|howard> done?`, BOT)).toBe("what has howard done?");
  });

  it("drops an unlabelled third-party mention rather than leaving raw markup", () => {
    expect(stripBotMention(`<@${BOT}> ping <@U9> please`, BOT)).toBe("ping please");
  });

  it("unwraps links and channel refs to their labels", () => {
    expect(stripBotMention(`see <#C1|general> and <https://x.com|the doc>`, BOT)).toBe(
      "see general and the doc",
    );
    expect(stripBotMention(`bare <https://x.com/a> link`, BOT)).toBe("bare link");
  });

  it("collects third-party mentions but never the bot", () => {
    expect(mentionedSlackUserIds(`<@${BOT}> hi <@U9> and <@U9> and <@U7>`, BOT)).toEqual(["U9", "U7"]);
  });
});

// ─── resolveSubject ─────────────────────────────────────────────────────────

describe("resolveSubject", () => {
  const run = (q: string) => resolveSubject(q, { clients: CLIENTS, people: PEOPLE });

  it("matches a client by name", () => {
    const r = run("where are we with Electric Fire?");
    expect(r.subject).toMatchObject({ kind: "client", id: "c1" });
  });

  it("matches a squashed client name — ElectricFire → Electric Fire", () => {
    const r = run("what's the state of the ElectricFire onboarding?");
    expect(r.subject).toMatchObject({ kind: "client", id: "c1" });
  });

  it("matches a client by slug", () => {
    expect(run("status on big-wedge-golf").subject).toMatchObject({ kind: "client", id: "c3" });
  });

  it("prefers the longest client match", () => {
    // "Big Wedge Golf" must win over any shorter incidental match.
    expect(run("how is Big Wedge Golf doing").subject).toMatchObject({ kind: "client", id: "c3" });
  });

  it("does not match a short client name inside an unrelated word", () => {
    // "Echo" squashes to 4 chars — below the squash threshold — so "echoed" must not match.
    expect(run("the client echoed that back").subject).toBeNull();
  });

  it("still matches a short client name on a word boundary", () => {
    expect(run("where are we with Echo?").subject).toMatchObject({ kind: "client", id: "c2" });
  });

  it("resolves a person when no client is named", () => {
    const r = run("what has Howard been working on?");
    expect(r.subject).toMatchObject({ kind: "person", id: "u1" });
    expect(r.personFilter).toBeNull();
  });

  it("treats client + person as a client question narrowed to that person", () => {
    const r = run("what has Howard done on Electric Fire?");
    expect(r.subject).toMatchObject({ kind: "client", id: "c1" });
    expect(r.personFilter).toMatchObject({ id: "u1" });
  });

  it("falls back to a workspace subject for a global question", () => {
    expect(run("is anything at risk?").subject).toMatchObject({ kind: "workspace" });
  });

  it("returns no subject rather than guessing", () => {
    expect(run("can you sort that out for me").subject).toBeNull();
    expect(run("").subject).toBeNull();
  });

  it("normalise collapses punctuation and case", () => {
    expect(normalise("  Electric-Fire's  Onboarding! ")).toBe("electric fire s onboarding");
  });
});

// ─── config ─────────────────────────────────────────────────────────────────

describe("resolveDispatchConfig", () => {
  it("falls back to defaults on junk", () => {
    expect(resolveDispatchConfig(null)).toEqual(DISPATCH_DEFAULTS);
    expect(resolveDispatchConfig("nope")).toEqual(DISPATCH_DEFAULTS);
    expect(resolveDispatchConfig({ recentDays: "seven" })).toEqual(DISPATCH_DEFAULTS);
  });

  it("clamps numeric fields into range", () => {
    expect(resolveDispatchConfig({ recentDays: 9999 }).recentDays).toBe(90);
    expect(resolveDispatchConfig({ recentDays: 0 }).recentDays).toBe(1);
    expect(resolveDispatchConfig({ perChannelPerHour: -5 }).perChannelPerHour).toBe(1);
    expect(resolveDispatchConfig({ maxEvidenceItems: 1 }).maxEvidenceItems).toBe(3);
  });

  it("only opens external channels on an explicit boolean true", () => {
    expect(resolveDispatchConfig({}).allowExternalChannels).toBe(false);
    expect(resolveDispatchConfig({ allowExternalChannels: true }).allowExternalChannels).toBe(true);
    // A truthy non-boolean must NOT open internal state to a client-facing channel.
    expect(
      resolveDispatchConfig({ allowExternalChannels: "yes" as unknown as boolean }).allowExternalChannels,
    ).toBe(false);
    expect(
      resolveDispatchConfig({ allowExternalChannels: 1 as unknown as boolean }).allowExternalChannels,
    ).toBe(false);
  });
});

// ─── blind spots ────────────────────────────────────────────────────────────

const CLIENT_SUBJECT: DispatchSubject = { kind: "client", id: "c1", label: "Electric Fire", slug: "electric-fire" };

function blindSpots(over: Partial<Parameters<typeof deriveBlindSpots>[0]> = {}) {
  return deriveBlindSpots({
    subject: CLIENT_SUBJECT,
    openTotal: 10,
    openWithoutDue: 0,
    doneWithoutStamp: 0,
    doneInWindow: 3,
    doingCount: 2,
    blocks: [
      {
        id: "b1",
        name: "Phase 1",
        clientName: "Electric Fire",
        startDate: "2026-07-01T00:00:00Z",
        endDate: "2026-07-30T00:00:00Z",
        totalTasks: 5,
        doneTasks: 2,
      },
    ],
    recentDays: 7,
    hasClientRecord: true,
    ...over,
  }).map((b) => b.kind);
}

describe("deriveBlindSpots", () => {
  it("is quiet when the data is complete", () => {
    expect(blindSpots()).toEqual([]);
  });

  it("short-circuits when the subject has no Foundry record", () => {
    expect(blindSpots({ hasClientRecord: false })).toEqual(["NOT_IN_FOUNDRY"]);
  });

  it("flags an undated board — the distinction that stops a false all-clear", () => {
    expect(blindSpots({ openTotal: 10, openWithoutDue: 8 })).toContain("NO_DUE_DATES");
  });

  it("does not flag due dates when most tasks have them", () => {
    expect(blindSpots({ openTotal: 10, openWithoutDue: 4 })).not.toContain("NO_DUE_DATES");
  });

  it("flags exactly-half undated (the boundary is inclusive)", () => {
    expect(blindSpots({ openTotal: 10, openWithoutDue: 5 })).toContain("NO_DUE_DATES");
  });

  it("flags done tasks with no completion stamp", () => {
    expect(blindSpots({ doneWithoutStamp: 2 })).toContain("NO_COMPLETION_STAMPS");
  });

  it("flags an entirely empty subject", () => {
    expect(blindSpots({ openTotal: 0, doneInWindow: 0, doingCount: 0, blocks: [] })).toContain("NO_TASKS");
  });

  it("flags undated feature blocks", () => {
    const kinds = blindSpots({
      blocks: [
        { id: "b1", name: "Phase 1", clientName: "Electric Fire", startDate: null, endDate: null, totalTasks: 5, doneTasks: 0 },
      ],
    });
    expect(kinds).toContain("NO_TIMELINE");
  });

  it("flags a client with tasks but no blocks at all", () => {
    expect(blindSpots({ blocks: [] })).toContain("NO_TIMELINE");
  });

  it("admits it does not read Slack only when the board has gone quiet", () => {
    expect(blindSpots()).not.toContain("SLACK_NOT_READ");
    const quiet = blindSpots({ doneInWindow: 0, doingCount: 0, openTotal: 4 });
    expect(quiet).toContain("NO_RECENT_ACTIVITY");
    expect(quiet).toContain("SLACK_NOT_READ");
  });
});

// ─── deterministic answer (the no-AI floor) ─────────────────────────────────

function task(over: Partial<EvidenceTask> = {}): EvidenceTask {
  return {
    id: "t1",
    title: "Set up the client account",
    status: "DOING",
    clientName: "Electric Fire",
    blockName: null,
    dueDate: null,
    startedAt: null,
    completedAt: null,
    assignees: [],
    blockedReason: null,
    ...over,
  };
}

function evidence(over: Partial<DispatchEvidence> = {}): DispatchEvidence {
  return {
    subject: CLIENT_SUBJECT,
    asOf: "2026-07-27T09:00:00Z",
    client: null,
    overdue: [],
    doing: [],
    dueSoon: [],
    recentlyDone: [],
    blocked: [],
    blocks: [],
    milestones: [],
    meetings: [],
    documents: [],
    foremanFindings: [],
    blindSpots: [],
    counts: { openTasks: 0, overdue: 0, dueSoon: 0, doing: 0, doneInWindow: 0, blocked: 0 },
    truncated: false,
    ...over,
  };
}

describe("composeDeterministicAnswer", () => {
  it("answers with no AI at all", () => {
    const a = composeDeterministicAnswer(
      evidence({
        overdue: [task({ title: "WEB-11 roster", dueDate: "2026-07-20T00:00:00Z", status: "TODO" })],
        doing: [task({ title: "Onboarding handoff", assignees: ["Howard Chen"] })],
        counts: { openTasks: 6, overdue: 1, dueSoon: 0, doing: 1, doneInWindow: 0, blocked: 0 },
      }),
    );
    expect(a.headline).toContain("1 overdue");
    expect(a.bullets.join(" ")).toContain("WEB-11 roster");
    expect(a.bullets.join(" ")).toContain("Howard Chen");
  });

  it("says nothing is tracked rather than implying all is well", () => {
    const a = composeDeterministicAnswer(evidence());
    expect(a.headline).toMatch(/Nothing tracked/i);
  });

  it("carries every blind spot into unverified — the model never gets to drop one", () => {
    const a = composeDeterministicAnswer(
      evidence({
        blindSpots: [
          { kind: "NO_DUE_DATES", detail: "6 of 8 open tasks have no due date" },
          { kind: "NO_TIMELINE", detail: "no dated feature block" },
        ],
      }),
    );
    expect(a.unverified).toEqual(["6 of 8 open tasks have no due date", "no dated feature block"]);
  });

  it("warns when lists were truncated so nothing reads as exhaustive", () => {
    const a = composeDeterministicAnswer(evidence({ truncated: true }));
    expect(a.unverified.join(" ")).toMatch(/capped/i);
  });

  it("surfaces a blocked task's reason", () => {
    const a = composeDeterministicAnswer(
      evidence({
        blocked: [task({ title: "SLA sign-off", blockedReason: "waiting on Marcus" })],
        counts: { openTasks: 1, overdue: 0, dueSoon: 0, doing: 0, doneInWindow: 0, blocked: 1 },
      }),
    );
    expect(a.bullets.join(" ")).toContain("waiting on Marcus");
  });
});

// ─── event triage ───────────────────────────────────────────────────────────

describe("slack event triage", () => {
  it("parses an envelope and rejects junk", () => {
    expect(parseEventBody('{"type":"event_callback"}')).toMatchObject({ type: "event_callback" });
    expect(parseEventBody("not json")).toBeNull();
    expect(parseEventBody('"a string"')).toBeNull();
  });

  it("treats an app_mention and a DM as questions", () => {
    expect(isQuestionEvent({ type: "app_mention" })).toBe(true);
    expect(isQuestionEvent({ type: "message", channel_type: "im" })).toBe(true);
  });

  it("ignores channel messages that are not mentions", () => {
    expect(isQuestionEvent({ type: "message", channel_type: "channel" })).toBe(false);
  });

  it("ignores edits, deletions and joins", () => {
    expect(isQuestionEvent({ type: "message", channel_type: "im", subtype: "message_changed" })).toBe(false);
    expect(isQuestionEvent({ type: "app_mention", subtype: "bot_message" })).toBe(false);
    expect(isQuestionEvent(undefined)).toBe(false);
  });

  it("never answers a bot — including itself", () => {
    expect(isBotAuthored({ type: "app_mention", user: BOT }, BOT)).toBe(true);
    expect(isBotAuthored({ type: "app_mention", user: "U1", bot_id: "B1" }, BOT)).toBe(true);
    expect(isBotAuthored({ type: "app_mention" }, BOT)).toBe(true); // no author at all
    expect(isBotAuthored({ type: "app_mention", user: "U1" }, BOT)).toBe(false);
  });
});
