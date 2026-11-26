import { describe, expect, it } from "vitest";
import { decideSlackChat, DM_CHAT_IDLE_MS, type SlackChatContext } from "../slack-conversation";

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

  it("naming another of their clients carries on in the same chat, about that client (§164)", () => {
    expect(decideSlackChat({ ...base, recentDmChat: wedgeChat, namedClientId: "campfire" })).toEqual({
      action: "continue",
      conversationId: "chat1",
      clientId: "campfire",
    });
  });

  it("naming the same client carries on", () => {
    expect(decideSlackChat({ ...base, recentDmChat: wedgeChat, namedClientId: "wedge" })).toMatchObject({ action: "continue" });
  });

  it("a long chat carries on in a fresh one about the same client, with no wall", () => {
    expect(decideSlackChat({ ...base, recentDmChat: { ...wedgeChat, messages: 18 } })).toEqual({ action: "new", clientId: "wedge" });
  });

  it("after hours of quiet, the old chat is left behind", () => {
    const stale = { ...wedgeChat, updatedAt: new Date(now.getTime() - DM_CHAT_IDLE_MS - 1) };
    expect(decideSlackChat({ ...base, recentDmChat: stale })).toEqual({ action: "no_client" });
    expect(decideSlackChat({ ...base, recentDmChat: stale, fallbackClientId: "wedge" })).toEqual({ action: "new", clientId: "wedge" });
  });

  it("a long chat naming another client starts fresh on that client", () => {
    expect(decideSlackChat({ ...base, recentDmChat: { ...wedgeChat, messages: 18 }, namedClientId: "campfire" })).toEqual({ action: "new", clientId: "campfire" });
  });
});

describe("decideSlackChat: with nothing to go on", () => {
  it("a DM starts on their usual client and talks, rather than asking which (§164)", () => {
    expect(decideSlackChat({ ...base, fallbackClientId: "wedge" })).toEqual({ action: "new", clientId: "wedge" });
  });

  it("someone with no clients at all gets a chat with nothing to look up", () => {
    expect(decideSlackChat(base)).toEqual({ action: "no_client" });
  });

  it("someone on one client just gets that client", () => {
    expect(decideSlackChat({ ...base, onlyClientId: "wedge" })).toEqual({ action: "new", clientId: "wedge" });
  });

  it("a question about a teammate or everything goes to Dispatch too, not a fixed answer (§166)", () => {
    expect(decideSlackChat({ ...base, aboutPersonOrAll: true, fallbackClientId: "wedge" })).toEqual({ action: "new", clientId: "wedge" });
    // In a channel that isn't a client's own, it's answered by DM (slack.ts).
    expect(decideSlackChat({ ...base, isDm: false, aboutPersonOrAll: true, fallbackClientId: "wedge" })).toEqual({ action: "new", clientId: "wedge" });
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

  it("a channel thread stays on its client: naming another starts a new chat", () => {
    expect(decideSlackChat({ ...channel, inThread: true, threadChat: { id: "t1", clientId: "wedge" }, namedClientId: "campfire" })).toEqual({ action: "new", clientId: "campfire" });
  });

  it("never starts a channel on a fallback client", () => {
    expect(decideSlackChat({ ...channel, fallbackClientId: "wedge" })).toEqual({ action: "no_client" });
  });

  it("never carries a DM chat into a channel", () => {
    expect(decideSlackChat({ ...channel, recentDmChat: wedgeChat })).toEqual({ action: "no_client" });
  });
});
