import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const postMessage = vi.fn(async () => ({ ok: true }));
const findMany = vi.fn();

vi.mock("@/server/slack/client", () => ({
  getSlackBotToken: () => "xoxb-test",
  postMessage: (...args: unknown[]) => postMessage(...(args as [])),
}));
vi.mock("@/server/slack/provisioning", () => ({ effectiveInternalChannel: () => "C123" }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    clientWiki: {
      findUnique: async () => ({
        client: { name: "Wedge", slug: "wedge", workspaceId: "ws", slackChannelId: "C123", slackInternalChannelId: null },
      }),
    },
    workspace: { findUnique: async () => ({ slackBotToken: "xoxb-test", slackBotTokenEncrypted: null }) },
    clientChangelogEntry: { findMany: (...a: unknown[]) => findMany(...a) },
  },
}));

import {
  CHANGELOG_PING_WINDOW_MS,
  changelogPendingText,
  notifyClientSlackChangelogApproved,
  notifyClientSlackChangelogPending,
  platformList,
} from "@/server/wiki-slack-notify";

const ping = (id: string, platform: string, version = "2.0.1") => ({
  id,
  wikiId: "w1",
  version,
  title: "Wedge+ Is Here",
  platform,
});

async function flush() {
  await vi.advanceTimersByTimeAsync(CHANGELOG_PING_WINDOW_MS + 10);
}

describe("changelog Slack pings — one per version, not per platform", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    postMessage.mockClear();
    findMany.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("⚠️ a version saved for iOS and Android posts ONE 'added' message naming both", async () => {
    findMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    notifyClientSlackChangelogPending(ping("a", "IOS"));
    notifyClientSlackChangelogPending(ping("b", "ANDROID"));
    await flush();
    expect(postMessage).toHaveBeenCalledTimes(1);
    const text = (postMessage.mock.calls[0] as unknown as [string, { text: string }])[1].text;
    expect(text).toBe(':memo: *Wedge* changelog *v2.0.1* added for iOS and Android — "Wedge+ Is Here" is awaiting approval.');
  });

  it("⚠️ approving a two-platform version posts ONE 'approved' message", async () => {
    notifyClientSlackChangelogApproved(ping("a", "IOS"));
    notifyClientSlackChangelogApproved(ping("b", "ANDROID"));
    await flush();
    expect(postMessage).toHaveBeenCalledTimes(1);
  });

  it("two different versions still post separately", async () => {
    findMany.mockImplementation(async ({ where }: { where: { version: string } }) =>
      where.version === "2.0.1" ? [{ id: "a" }] : [{ id: "c" }],
    );
    notifyClientSlackChangelogPending(ping("a", "IOS"));
    notifyClientSlackChangelogPending(ping("c", "IOS", "2.0.2"));
    await flush();
    expect(postMessage).toHaveBeenCalledTimes(2);
  });

  it("adding a platform to an already-announced version is an edit — no second 'added'", async () => {
    // The version already had an iOS row before this Android one was added.
    findMany.mockResolvedValue([{ id: "old-ios" }, { id: "b" }]);
    notifyClientSlackChangelogPending(ping("b", "ANDROID"));
    await flush();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("nothing posts before the window closes", async () => {
    findMany.mockResolvedValue([{ id: "a" }]);
    notifyClientSlackChangelogPending(ping("a", "IOS"));
    await vi.advanceTimersByTimeAsync(CHANGELOG_PING_WINDOW_MS - 100);
    expect(postMessage).not.toHaveBeenCalled();
    await flush();
    expect(postMessage).toHaveBeenCalledTimes(1);
  });
});

describe("wording", () => {
  it("lists platforms naturally and drops duplicates", () => {
    expect(platformList(["IOS"])).toBe("iOS");
    expect(platformList(["IOS", "ANDROID", "WEB"])).toBe("iOS, Android and Web");
    expect(platformList(["IOS", "IOS"])).toBe("iOS");
  });
  it("a one-platform version reads as before plus its platform", () => {
    expect(changelogPendingText("Wedge", [ping("a", "WEB")])).toContain("added for Web —");
  });
});
