import { describe, expect, it } from "vitest";
import {
  decideStageMove,
  factFromTouchpoint,
  ladderTarget,
  normaliseActionSuggestions,
  normaliseActionTitle,
  normaliseSuggestions,
  type StageFact,
  type TouchpointLike,
} from "@/lib/crm/lead-stage-engine";

const d = (iso: string) => new Date(`${iso}T12:00:00.000Z`);
const fact = (kind: StageFact["kind"], iso: string, direction?: "inbound" | "outbound"): StageFact => ({
  kind,
  at: d(iso),
  label: `${kind} ${iso}`,
  direction: direction ?? null,
});
const tp = (over: Partial<TouchpointLike>): TouchpointLike => ({
  type: "EMAIL",
  source: null,
  direction: null,
  externalId: null,
  note: null,
  occurredAt: d("2026-10-01"),
  ...over,
});

describe("factFromTouchpoint", () => {
  it("never treats internal Slack as a fact — our own chat is not contact with the lead", () => {
    expect(factFromTouchpoint(tp({ type: "SLACK", source: "slack", direction: "internal", note: "Valu signed!" }))).toBeNull();
  });

  it("never treats a stage move or a suggestion as evidence", () => {
    expect(factFromTouchpoint(tp({ type: "STAGE", source: "system" }))).toBeNull();
    expect(factFromTouchpoint(tp({ type: "SUGGESTION", source: "system" }))).toBeNull();
  });

  it("counts a hand-logged call or email as contact, and a hand-logged meeting as a meeting", () => {
    expect(factFromTouchpoint(tp({ type: "CALL" }))?.kind).toBe("contact");
    expect(factFromTouchpoint(tp({ type: "EMAIL" }))?.kind).toBe("contact");
    expect(factFromTouchpoint(tp({ type: "MEETING" }))?.kind).toBe("meeting");
    expect(factFromTouchpoint(tp({ type: "NOTE" }))).toBeNull();
  });

  it("keeps the direction of a synced email, and none for a hand-logged one", () => {
    expect(factFromTouchpoint(tp({ source: "gmail", direction: "inbound" }))?.direction).toBe("inbound");
    expect(factFromTouchpoint(tp({ source: "gmail", direction: "outbound" }))?.direction).toBe("outbound");
    expect(factFromTouchpoint(tp({ type: "EMAIL" }))?.direction).toBeNull();
  });

  it("reads proposal and contract events from the externalId we write", () => {
    expect(factFromTouchpoint(tp({ type: "PROPOSAL", source: "document", externalId: "doc1:drafted" }))?.kind).toBe("proposal_drafted");
    expect(factFromTouchpoint(tp({ type: "PROPOSAL", source: "document", externalId: "doc1:shared" }))?.kind).toBe("proposal_shared");
    expect(factFromTouchpoint(tp({ type: "PROPOSAL", source: "document", externalId: "doc1:declined" }))?.kind).toBe("proposal_declined");
    expect(factFromTouchpoint(tp({ type: "PROPOSAL", source: "document", externalId: "sig:r1:contract_sent" }))?.kind).toBe("contract_sent");
    expect(factFromTouchpoint(tp({ type: "PROPOSAL", source: "document", externalId: "sig:r1:contract_signed" }))?.kind).toBe("contract_signed");
    expect(factFromTouchpoint(tp({ type: "PROPOSAL", source: "document", externalId: "doc1:bogus" }))).toBeNull();
  });
});

describe("ladderTarget", () => {
  it("climbs to the furthest stage the history supports", () => {
    expect(ladderTarget([fact("contact", "2026-09-01")])?.stage).toBe("CONTACTED");
    expect(ladderTarget([fact("contact", "2026-09-01"), fact("meeting", "2026-09-03")])?.stage).toBe("DISCOVERY");
    expect(ladderTarget([fact("meeting", "2026-09-03"), fact("proposal_drafted", "2026-09-05")])?.stage).toBe("SCOPING");
    expect(ladderTarget([fact("proposal_drafted", "2026-09-05"), fact("proposal_shared", "2026-09-06")])?.stage).toBe("PROPOSAL_SENT");
    expect(ladderTarget([fact("proposal_shared", "2026-09-06"), fact("contract_sent", "2026-09-20")])?.stage).toBe("CONTRACT_SENT");
  });

  it("is In discussion only when THEY wrote after the proposal — our chasing doesn't count", () => {
    const shared = fact("proposal_shared", "2026-09-06");
    expect(ladderTarget([shared, fact("contact", "2026-09-08", "outbound")])?.stage).toBe("PROPOSAL_SENT");
    expect(ladderTarget([shared, fact("contact", "2026-09-01", "inbound")])?.stage).toBe("PROPOSAL_SENT");
    expect(ladderTarget([shared, fact("contact", "2026-09-08", "inbound")])?.stage).toBe("IN_DISCUSSION");
  });

  it("does not count a hand-logged email (no direction) as their reply", () => {
    const shared = fact("proposal_shared", "2026-09-06");
    expect(ladderTarget([shared, fact("contact", "2026-09-08")])?.stage).toBe("PROPOSAL_SENT");
  });
});

describe("decideStageMove", () => {
  const base = { current: null, pinned: false, stageSince: null } as const;

  it("never moves a pinned stage, whatever the evidence", () => {
    expect(decideStageMove({ ...base, pinned: true, facts: [fact("proposal_accepted", "2026-09-10")] })).toEqual({ move: false, why: "pinned" });
  });

  it("never moves a won lead", () => {
    expect(decideStageMove({ ...base, current: "WON", facts: [fact("proposal_declined", "2026-10-01")] })).toEqual({ move: false, why: "won" });
  });

  it("moves forward on the ladder and records the evidence", () => {
    const r = decideStageMove({ ...base, current: "CONTACTED", facts: [fact("contact", "2026-09-01"), fact("meeting", "2026-09-04")] });
    expect(r).toMatchObject({ move: true, to: "DISCOVERY", reason: "meeting 2026-09-04" });
  });

  it("never moves backward — an old email can't drag a proposal-stage lead back to Contacted", () => {
    expect(decideStageMove({ ...base, current: "PROPOSAL_SENT", facts: [fact("contact", "2026-10-01")] })).toEqual({ move: false, why: "no_change" });
  });

  it("leaves a suggestion-only stage (Qualified) in place until the facts pass it", () => {
    expect(decideStageMove({ ...base, current: "QUALIFIED", facts: [fact("meeting", "2026-10-01")] })).toEqual({ move: false, why: "no_change" });
    expect(decideStageMove({ ...base, current: "QUALIFIED", facts: [fact("proposal_drafted", "2026-10-01")] })).toMatchObject({ move: true, to: "SCOPING" });
  });

  it("treats an accepted proposal or a signed contract as decisive", () => {
    expect(decideStageMove({ ...base, current: "CONTACTED", facts: [fact("proposal_accepted", "2026-09-10")] })).toMatchObject({ move: true, to: "WON" });
    expect(decideStageMove({ ...base, current: "CONTRACT_SENT", facts: [fact("contract_signed", "2026-09-10")] })).toMatchObject({ move: true, to: "WON" });
  });

  it("marks LOST only when the decline is the latest proposal event", () => {
    const declinedThenResent = [fact("proposal_declined", "2026-09-10"), fact("proposal_shared", "2026-09-20")];
    expect(decideStageMove({ ...base, current: "PROPOSAL_SENT", facts: declinedThenResent })).toEqual({ move: false, why: "no_change" });
    const sentThenDeclined = [fact("proposal_shared", "2026-09-10"), fact("proposal_declined", "2026-09-20")];
    expect(decideStageMove({ ...base, current: "PROPOSAL_SENT", facts: sentThenDeclined })).toMatchObject({ move: true, to: "LOST" });
  });

  it("does not let an old decline override a stage decided AFTER it", () => {
    const facts = [fact("proposal_shared", "2026-09-01"), fact("proposal_declined", "2026-09-05")];
    expect(decideStageMove({ ...base, current: "QUALIFIED", stageSince: d("2026-09-10"), facts })).toMatchObject({ move: true, to: "PROPOSAL_SENT" });
  });

  describe("leaving LOST", () => {
    const lostOn = d("2026-09-15");
    it("needs evidence newer than the moment it was lost", () => {
      expect(decideStageMove({ ...base, current: "LOST", stageSince: lostOn, facts: [fact("proposal_shared", "2026-09-01")] })).toEqual({ move: false, why: "lost_held" });
      expect(decideStageMove({ ...base, current: "LOST", stageSince: lostOn, facts: [fact("proposal_shared", "2026-09-20")] })).toMatchObject({ move: true, to: "PROPOSAL_SENT" });
      expect(decideStageMove({ ...base, current: "LOST", stageSince: lostOn, facts: [fact("proposal_accepted", "2026-09-20")] })).toMatchObject({ move: true, to: "WON" });
    });

    it("ignores ordinary contact — an email isn't a reason to reopen a lost deal", () => {
      expect(decideStageMove({ ...base, current: "LOST", stageSince: lostOn, facts: [fact("contact", "2026-09-20", "inbound")] })).toEqual({ move: false, why: "lost_held" });
    });

    it("never leaves LOST when we don't know when it was lost", () => {
      expect(decideStageMove({ ...base, current: "LOST", stageSince: null, facts: [fact("proposal_accepted", "2026-09-20")] })).toEqual({ move: false, why: "lost_held" });
    });
  });

  describe("leaving ON HOLD", () => {
    const heldOn = d("2026-09-15");
    const history = [fact("contact", "2026-08-01"), fact("proposal_shared", "2026-08-10")];

    it("stays on hold with no fresh activity", () => {
      expect(decideStageMove({ ...base, current: "ON_HOLD", stageSince: heldOn, facts: history })).toEqual({ move: false, why: "on_hold" });
    });

    it("comes back at the furthest stage its history supports once they're in touch again", () => {
      const r = decideStageMove({ ...base, current: "ON_HOLD", stageSince: heldOn, facts: [...history, fact("contact", "2026-10-01", "inbound")] });
      expect(r).toMatchObject({ move: true, to: "IN_DISCUSSION" });
      expect(r.move && r.reason).toMatch(/^Back in touch/);
    });
  });
});

describe("normaliseSuggestions", () => {
  const ids = new Set(["m1", "m2", "m3"]);

  it("drops a stage we don't have, an uncited message, and an empty reason", () => {
    const raw = {
      suggestions: [
        { stage: "SIGNED", messageId: "m1", reason: "x" },
        { stage: "WON", messageId: "nope", reason: "x" },
        { stage: "WON", messageId: "m1", reason: "  " },
      ],
    };
    expect(normaliseSuggestions(raw, { current: "PROPOSAL_SENT", validMessageIds: ids })).toEqual([]);
  });

  it("drops a backward ladder move but keeps the outcomes from any open stage", () => {
    const raw = {
      suggestions: [
        { stage: "CONTACTED", messageId: "m1", reason: "back" },
        { stage: "ON_HOLD", messageId: "m2", reason: "not now" },
        { stage: "LOST", messageId: "m3", reason: "went elsewhere" },
      ],
    };
    expect(normaliseSuggestions(raw, { current: "PROPOSAL_SENT", validMessageIds: ids }).map((s) => s.stage)).toEqual(["ON_HOLD", "LOST"]);
  });

  it("suggests nothing on a won lead", () => {
    expect(normaliseSuggestions({ suggestions: [{ stage: "LOST", messageId: "m1", reason: "x" }] }, { current: "WON", validMessageIds: ids })).toEqual([]);
  });

  it("lets a lost or on-hold lead be suggested back into the pipeline", () => {
    const raw = { suggestions: [{ stage: "QUALIFIED", messageId: "m1", reason: "they're back" }] };
    expect(normaliseSuggestions(raw, { current: "LOST", validMessageIds: ids })).toHaveLength(1);
    expect(normaliseSuggestions(raw, { current: "ON_HOLD", validMessageIds: ids })).toHaveLength(1);
  });

  it("survives junk", () => {
    expect(normaliseSuggestions(null, { current: null, validMessageIds: ids })).toEqual([]);
    expect(normaliseSuggestions({ suggestions: "nope" }, { current: null, validMessageIds: ids })).toEqual([]);
  });
});

describe("normaliseActionSuggestions", () => {
  const now = d("2026-10-12");
  const ids = new Set(["m1", "m2"]);

  it("keeps a real calendar due date and drops impossible or distant ones", () => {
    const raw = {
      actions: [
        { title: "Send revised quote", due: "2026-10-17", messageId: "m1" },
        { title: "Book a call", due: "2026-02-30", messageId: "m1" },
        { title: "Chase the PO", due: "2028-01-01", messageId: "m2" },
      ],
    };
    const out = normaliseActionSuggestions(raw, { validMessageIds: ids, existingTitles: new Set(), now });
    expect(out.map((a) => a.dueAt?.toISOString().slice(0, 10) ?? null)).toEqual(["2026-10-17", null, null]);
  });

  it("drops an action already on the lead, however it's worded", () => {
    const raw = { actions: [{ title: "Send the revised quote!", messageId: "m1" }] };
    const existing = new Set([normaliseActionTitle("send the revised quote")]);
    expect(normaliseActionSuggestions(raw, { validMessageIds: ids, existingTitles: existing, now })).toEqual([]);
  });

  it("drops an action citing a message it wasn't shown", () => {
    expect(normaliseActionSuggestions({ actions: [{ title: "Send quote", messageId: "zz" }] }, { validMessageIds: ids, existingTitles: new Set(), now })).toEqual([]);
  });
});
