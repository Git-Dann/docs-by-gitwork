import { describe, expect, it } from "vitest";
import { foldedText, needsFold, planFold, type FoldItem } from "@/lib/handover/fold";

/**
 * Fixtures are VERBATIM rows from the live handover — the one populated from
 * Dan's 23 Sep Client Delivery Audit. An invented fixture ("Client A — going
 * well") tells you the code runs; it cannot tell you whether a real
 * multi-paragraph audit line survives the reshape, and the reshape's only job
 * is not to lose any of it.
 */
const item = (o: Partial<FoldItem>): FoldItem => ({
  id: Math.random().toString(36).slice(2),
  kind: "CLIENT",
  clientId: null,
  clientName: null,
  title: "",
  detail: null,
  cadence: null,
  channel: null,
  duties: null,
  other: null,
  ...o,
});

const WEDGE = "cmpii9h15000xk004thchkp9r";
const FELLAS = "cmppkgc94006gjj04zk251f3u";

const live: FoldItem[] = [
  item({
    id: "c-wedge",
    kind: "CLIENT",
    clientId: WEDGE,
    clientName: "Wedge",
    title: "Premium in final prep. Builds 81 and 82 to staging 22 Sep.",
    detail:
      "Round verification, handicap import, bag management and Advanced Analytics changes. Pre-prod build was being cut on 22 Sep; Luke wants it in Seb's hands the next day and is pushing for leaderboard filter changes.",
  }),
  item({
    id: "d-wedge",
    kind: "DECISION",
    clientId: WEDGE,
    clientName: "Wedge",
    title: "Wedge wider premium feature list awaiting sign-off",
    detail:
      "Scope was pushed back on, correctly. Leaderboard is a separate release this week while the wider feature list gets signed off.",
  }),
  item({
    id: "u-wedge",
    kind: "DUTY",
    clientId: WEDGE,
    clientName: "Wedge",
    title: "Wedge support once premium launches",
    cadence: "from launch day",
  }),
  item({
    id: "u-fellas",
    kind: "DUTY",
    clientId: FELLAS,
    clientName: "Fellas Loaded",
    title: "Monitor Fellas support",
    cadence: "every day",
    channel: "Discord, email, Reddit",
  }),
  item({
    id: "r-orphan",
    kind: "RISK",
    clientId: null,
    title: "Rotate the shared Slack webhook",
    detail: "Nobody has confirmed this since the migration.",
  }),
];

describe("handover fold — nothing is discarded", () => {
  it("every word of every input lands somewhere in the output", () => {
    const out = foldedText(planFold(live));
    for (const source of live) {
      for (const text of [source.title, source.detail, source.cadence, source.channel]) {
        if (!text?.trim()) continue;
        expect(out, `lost: ${text.slice(0, 40)}`).toContain(text.trim());
      }
    }
  });

  it("a duty's cadence and channel survive, because the new shape has no field for them", () => {
    const fellas = planFold(live).entries.find((e) => e.clientId === FELLAS);
    expect(fellas?.duties).toContain("Monitor Fellas support");
    expect(fellas?.duties).toContain("every day");
    expect(fellas?.duties).toContain("Discord, email, Reddit");
  });
});

describe("handover fold — the shape", () => {
  const plan = planFold(live);
  const wedge = plan.entries.find((e) => e.clientId === WEDGE)!;

  it("the old CLIENT headline merges into the paragraph, not the title", () => {
    // After the fold, `title` is only the client's NAME — the card header. A
    // headline sentence left there would render as the card's name.
    expect(wedge.detail).toContain("Premium in final prep");
    expect(wedge.detail).toContain("Round verification, handicap import");
  });

  it("duties and other are separate paragraphs, not one pile", () => {
    expect(wedge.duties).toContain("Wedge support once premium launches");
    expect(wedge.duties).not.toContain("wider premium feature list");
    expect(wedge.other).toContain("wider premium feature list");
    expect(wedge.other).not.toContain("Wedge support once premium launches");
  });

  it("a client with no CLIENT row still gets an entry", () => {
    const fellas = plan.entries.find((e) => e.clientId === FELLAS);
    expect(fellas).toBeTruthy();
    expect(fellas?.id).toBeNull(); // caller creates it
    expect(fellas?.clientName).toBe("Fellas Loaded");
  });

  it("clientless rows go to the handover's own details, not to a random client", () => {
    expect(plan.orphanDetails).toContain("Rotate the shared Slack webhook");
    for (const e of plan.entries) {
      expect(`${e.detail}${e.duties}${e.other}`).not.toContain("shared Slack webhook");
    }
  });

  it("consumes exactly the non-CLIENT rows", () => {
    expect(plan.consumedIds.sort()).toEqual(["d-wedge", "r-orphan", "u-fellas", "u-wedge"].sort());
    expect(plan.consumedIds).not.toContain("c-wedge");
  });
});

describe("handover fold — idempotent and self-terminating", () => {
  it("a folded handover needs no further folding", () => {
    expect(needsFold(live)).toBe(true);
    const folded: FoldItem[] = planFold(live).entries.map((e) =>
      item({
        id: e.id ?? "new",
        kind: "CLIENT",
        clientId: e.clientId,
        clientName: e.clientName,
        title: e.clientName,
        detail: e.detail,
        duties: e.duties,
        other: e.other,
      }),
    );
    expect(needsFold(folded)).toBe(false);
  });

  it("re-folding an already-folded set changes nothing and consumes nothing", () => {
    const once = planFold(live);
    const folded: FoldItem[] = once.entries.map((e) =>
      item({
        id: e.id ?? "new",
        kind: "CLIENT",
        clientId: e.clientId,
        clientName: e.clientName,
        title: e.clientName,
        detail: e.detail,
        duties: e.duties,
        other: e.other,
      }),
    );
    const twice = planFold(folded);
    expect(twice.consumedIds).toEqual([]);
    expect(twice.orphanDetails).toBe("");
    for (const e of twice.entries) {
      const before = once.entries.find((x) => x.clientId === e.clientId)!;
      expect(e.detail).toBe(before.detail);
      expect(e.duties).toBe(before.duties);
      expect(e.other).toBe(before.other);
    }
  });
});
