import { describe, expect, it } from "vitest";
import { askWhichClientText, decideSlackChat, DM_CHAT_IDLE_MS, type SlackChatContext } from "../slack-conversation";

const now = new Date("2026-11-25T16:00:00Z");
const base: SlackChatContext = {
  isDm: true,
  inThread: false,
  threadChat: null,
  recentDmChat: null,
  namedClientId: null,
  aboutPersonOrAll: false,
  channelClientId: null,
  onlyClientId: null,
  maxMessages: 18,
  now,
};
const wedgeChat = { id: "chat1", clientId: "wedge", updatedAt: new Date(now.getTime() - 10 * 60_000), messages: 6 };

describe("decideSlackChat: a DM is one running conversation", () => {
  it("a follow-up with no client named carries on the last DM chat", () => {
    expect(decideSlackChat({ ...base, recentDmChat: wedgeChat })).toEqual({ action: "continue", conversationId: "chat1", clientId: "wedge" });
  });

  it("so does a reply in a DM thread (Slack lets you thread under Foundry's answer)", () => {
    expect(decideSlackChat({ ...base, inThread: true, recentDmChat: wedgeChat })).toMatchObject({ action: "continue", conversationId: "chat1" });
  });

  it("naming another client moves to a new chat about that client", () => {
    expect(decideSlackChat({ ...base, recentDmChat: wedgeChat, namedClientId: "campfire" })).toEqual({ action: "new", clientId: "campfire" });
  });

  it("naming the same client carries on", () => {
    expect(decideSlackChat({ ...base, recentDmChat: wedgeChat, namedClientId: "wedge" })).toMatchObject({ action: "continue" });
  });

  it("a long chat carries on in a fresh one about the same client, with no wall", () => {
    expect(decideSlackChat({ ...base, recentDmChat: { ...wedgeChat, messages: 18 } })).toEqual({ action: "new", clientId: "wedge" });
  });

  it("after hours of quiet, the old chat is left behind", () => {
    const stale = { ...wedgeChat, updatedAt: new Date(now.getTime() - DM_CHAT_IDLE_MS - 1) };
    expect(decideSlackChat({ ...base, recentDmChat: stale })).toEqual({ action: "ask_which" });
  });
});

describe("decideSlackChat: with nothing to go on", () => {
  it("asks which client instead of refusing", () => {
    expect(decideSlackChat(base)).toEqual({ action: "ask_which" });
  });

  it("someone on one client just gets that client", () => {
    expect(decideSlackChat({ ...base, onlyClientId: "wedge" })).toEqual({ action: "new", clientId: "wedge" });
  });

  it("a question about a person or everything goes to the status answer", () => {
    expect(decideSlackChat({ ...base, aboutPersonOrAll: true })).toEqual({ action: "legacy" });
  });
});

describe("decideSlackChat: channels", () => {
  const channel = { ...base, isDm: false };
  it("a thread is its own chat", () => {
    expect(decideSlackChat({ ...channel, inThread: true, threadChat: { id: "t1", clientId: "wedge" } })).toMatchObject({ action: "continue", conversationId: "t1" });
  });

  it("a client's own channel means that client", () => {
    expect(decideSlackChat({ ...channel, channelClientId: "wedge" })).toEqual({ action: "new", clientId: "wedge" });
  });

  it("never carries a DM chat into a channel", () => {
    expect(decideSlackChat({ ...channel, recentDmChat: wedgeChat })).toEqual({ action: "ask_which" });
  });
});

describe("askWhichClientText", () => {
  it("greets back, names their clients, and says it will remember", () => {
    const text = askWhichClientText({ firstName: "Dan", question: "Hey, how are you?", clients: ["Campfire", "Wedge"] });
    expect(text).toMatch(/^Hi Dan, all good here\./);
    expect(text).toContain("You're on Campfire, Wedge.");
    expect(text).toContain("keep it in mind");
    expect(text).not.toMatch(/couldn't tell/i);
  });

  it("no greeting for a plain question, and a long list is shortened", () => {
    const clients = Array.from({ length: 15 }, (_, i) => `Client ${i + 1}`);
    const text = askWhichClientText({ firstName: "Dan", question: "what's late?", clients });
    expect(text.startsWith("Which client")).toBe(true);
    expect(text).toContain("and 3 more");
  });
});
