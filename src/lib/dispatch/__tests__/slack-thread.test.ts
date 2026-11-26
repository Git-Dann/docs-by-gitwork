import { describe, expect, it } from "vitest";
import { isReplyToFoundry, slackContextLines, type SlackMessage } from "../slack-thread";
import { ukNow } from "../prompt";

const BOT = "UFOUNDRY";
const names: Record<string, string> = { UDAN: "Dan Lindsay", UHARRY: "Harry Brown", USYED: "Syed Usama Bin Tahir" };
const nameOf = (id: string) => names[id] ?? "Someone";
const msg = (ts: string, user: string | null, text: string): SlackMessage => (user === BOT ? { ts, user: BOT, botId: "B1", text } : { ts, user: user ?? undefined, text });

const thread: SlackMessage[] = [
  msg("100.0", "UDAN", "@Foundry who is the best MD?"),
  msg("101.0", BOT, "Tough one. Dan's asking, so…"),
  msg("102.0", "UHARRY", "Careful now"),
  msg("103.0", "USYED", "haha"),
  msg("104.0", "UDAN", "@Foundry what did Harry say?"),
];

describe("what Dispatch reads of the Slack conversation (§172)", () => {
  it("the whole thread, oldest first, named, without the question itself", () => {
    const lines = slackContextLines(thread, { currentTs: "104.0", botUserId: BOT, sinceFoundry: false, nameOf });
    expect(lines).toEqual([
      "Dan Lindsay: @Foundry who is the best MD?",
      "Foundry (you): Tough one. Dan's asking, so…",
      "Harry Brown: Careful now",
      "Syed Usama Bin Tahir: haha",
    ]);
  });

  it("a chat that carries on only gets what was said since Foundry last spoke", () => {
    const lines = slackContextLines(thread, { currentTs: "104.0", botUserId: BOT, sinceFoundry: true, nameOf });
    expect(lines).toEqual(["Harry Brown: Careful now", "Syed Usama Bin Tahir: haha"]);
  });

  it("never anything after the question, and long messages are trimmed", () => {
    const long = msg("103.5", "UHARRY", "x".repeat(900));
    const lines = slackContextLines([...thread, long, msg("105.0", "USYED", "later")], { currentTs: "104.0", botUserId: BOT, sinceFoundry: true, nameOf });
    expect(lines.some((l) => l.includes("later"))).toBe(false);
    expect(lines.find((l) => l.startsWith("Harry Brown: xxx"))!.length).toBeLessThan(520);
  });
});

describe("a thread reply without an @mention (§172)", () => {
  const base = { inThread: true, mentionsFoundry: false, foundryAnsweredHere: true, botUserId: BOT };

  it("is for Foundry when it replies straight to Foundry", () => {
    expect(isReplyToFoundry({ ...base, previous: msg("101.0", BOT, "Tough one") })).toBe(true);
  });

  it("not when people are talking to each other", () => {
    expect(isReplyToFoundry({ ...base, previous: msg("102.0", "UHARRY", "Careful now") })).toBe(false);
  });

  it("not where Foundry hasn't answered, not outside a thread, and not when it was @mentioned (that's handled already)", () => {
    const prev = msg("101.0", BOT, "Tough one");
    expect(isReplyToFoundry({ ...base, foundryAnsweredHere: false, previous: prev })).toBe(false);
    expect(isReplyToFoundry({ ...base, inThread: false, previous: prev })).toBe(false);
    expect(isReplyToFoundry({ ...base, mentionsFoundry: true, previous: prev })).toBe(false);
  });
});

describe("the date line", () => {
  it("has the date, the day and UK time", () => {
    expect(ukNow(new Date("2026-11-26T14:05:00Z"))).toBe("2026-11-26 (Thursday), 14:05 UK time");
  });
});
