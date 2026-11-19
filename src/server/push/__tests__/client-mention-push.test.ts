/**
 * A client @mentioned on one of their requests gets it on their phone. Each test is a
 * way this could ring the wrong phone, or ring the right one too often.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clientMentionRecipients } from "@/lib/wiki-intake-reply-notify";

const db = vi.hoisted(() => ({
  users: [] as Array<{ id: string; wikiId: string }>,
  devices: [] as Array<{ id: string; token: string; environment: string; clientWikiUserId: string; wikiId: string }>,
  receipts: [] as Array<{ wikiId: string; key: string; sentAt: Date; deviceCount: number }>,
}));
const sent = vi.hoisted(() => ({ calls: [] as Array<{ tokens: string[]; payload: Record<string, unknown> }> }));
const apns = vi.hoisted(() => ({ configured: true }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clientWikiUser: {
      findMany: async ({ where }: { where: { wikiId: string; id: { in: string[] } } }) =>
        db.users.filter((u) => u.wikiId === where.wikiId && where.id.in.includes(u.id)).map((u) => ({ id: u.id })),
    },
    clientDeviceToken: {
      findMany: async ({ where }: { where: { wikiId: string; clientWikiUserId?: string } }) =>
        db.devices.filter(
          (d) => d.wikiId === where.wikiId && (!where.clientWikiUserId || d.clientWikiUserId === where.clientWikiUserId),
        ),
    },
    clientPushReceipt: {
      count: async ({ where }: { where: { wikiId: string; key: { startsWith: string }; sentAt: { gte: Date } } }) =>
        db.receipts.filter(
          (r) => r.wikiId === where.wikiId && r.key.startsWith(where.key.startsWith) && r.sentAt >= where.sentAt.gte,
        ).length,
      create: async ({ data }: { data: { wikiId: string; key: string; sentAt?: Date } }) => {
        if (db.receipts.some((r) => r.wikiId === data.wikiId && r.key === data.key)) throw new Error("P2002");
        db.receipts.push({ wikiId: data.wikiId, key: data.key, sentAt: data.sentAt ?? new Date(), deviceCount: 0 });
        return {};
      },
      updateMany: async () => ({ count: 1 }),
    },
  },
}));
vi.mock("../apns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../apns")>()),
  isApnsConfigured: () => apns.configured,
}));
vi.mock("../transport", () => ({
  asApnsEnvironment: (e: string) => e,
  fanOutToDevices: async (devices: Array<{ token: string }>, _store: unknown, payload: Record<string, unknown>) => {
    sent.calls.push({ tokens: devices.map((d) => d.token), payload });
    return { sent: devices.length, failed: 0, skipped: false, reasons: [] };
  },
}));

import {
  MENTION_PUSH_HOURLY_CAP,
  mentionPushCopy,
  mentionReceiptKey,
  notifyClientMentionsOnRequest,
} from "../client-notifications";

const NOON = new Date("2026-11-19T12:00:00Z"); // 12:00 in London: inside push hours
const mention = (id: string, kind: "CLIENT" | "TEAM" = "CLIENT") => ({ id, name: id, kind });

beforeEach(() => {
  apns.configured = true;
  sent.calls = [];
  db.receipts = [];
  db.users = [
    { id: "luke", wikiId: "w1" },
    { id: "amy", wikiId: "w1" },
    { id: "other-client-user", wikiId: "w2" },
  ];
  db.devices = [
    { id: "d1", token: "luke-phone", environment: "production", clientWikiUserId: "luke", wikiId: "w1" },
    { id: "d2", token: "amy-phone", environment: "production", clientWikiUserId: "amy", wikiId: "w1" },
    { id: "d3", token: "foreign-phone", environment: "production", clientWikiUserId: "other-client-user", wikiId: "w2" },
  ];
});

const send = (over: Partial<Parameters<typeof notifyClientMentionsOnRequest>[0]> = {}) =>
  notifyClientMentionsOnRequest({
    wikiId: "w1",
    itemId: "req1",
    authorName: "Dan Lindsay",
    authorWikiUserId: null,
    body: "@Luke can you check the new build?",
    mentions: [mention("client:luke")],
    now: NOON,
    ...over,
  });

describe("who a mention may ring", () => {
  it("needs both the CLIENT kind and the client: prefix — either alone rings nobody", () => {
    expect(clientMentionRecipients([mention("client:luke")], null)).toEqual(["luke"]);
    expect(clientMentionRecipients([mention("client:luke", "TEAM")], null)).toEqual([]);
    expect(clientMentionRecipients([mention("team:dan", "CLIENT")], null)).toEqual([]);
  });

  it("drops the client-record contact (no account, no device) and the author", () => {
    expect(clientMentionRecipients([mention("contact:primary")], null)).toEqual([]);
    expect(clientMentionRecipients([mention("client:luke"), mention("client:amy")], "luke")).toEqual(["amy"]);
  });

  it("rings only the named person's phone, never a colleague's on the same client", async () => {
    const r = await send();
    expect(r.status).toBe("sent");
    expect(sent.calls.flatMap((c) => c.tokens)).toEqual(["luke-phone"]);
  });

  it("never rings a Gitwork person — a team mention is not this path's business", async () => {
    const r = await send({ mentions: [mention("team:dan", "TEAM")] });
    expect(r.status).toBe("no_recipients");
    expect(sent.calls).toHaveLength(0);
  });

  it("never reaches another wiki's user, even if their id is in the mention", async () => {
    const r = await send({ mentions: [mention("client:other-client-user")] });
    expect(sent.calls).toHaveLength(0);
    expect(r.devices).toBe(0);
  });

  it("does not ring the author when a client mentions themselves and a colleague", async () => {
    await send({ authorWikiUserId: "luke", mentions: [mention("client:luke"), mention("client:amy")] });
    expect(sent.calls.flatMap((c) => c.tokens)).toEqual(["amy-phone"]);
  });
});

describe("when, and how often", () => {
  it("sends nothing in quiet hours and claims nothing, so a later reply can still ring", async () => {
    const late = new Date("2026-11-19T22:30:00Z");
    const r = await send({ now: late });
    expect(r.status).toBe("quiet_hours");
    expect(db.receipts).toHaveLength(0);
    expect(sent.calls).toHaveLength(0);
  });

  it("rings once for a back-and-forth on one request within ten minutes", async () => {
    await send();
    const again = await send({ now: new Date(NOON.getTime() + 3 * 60_000) });
    expect(sent.calls).toHaveLength(1);
    expect(again.throttled).toBe(1);
    // A new window rings again.
    await send({ now: new Date(NOON.getTime() + 11 * 60_000) });
    expect(sent.calls).toHaveLength(2);
  });

  it("caps one person at the hourly limit across requests", async () => {
    for (let i = 0; i < MENTION_PUSH_HOURLY_CAP + 3; i++) await send({ itemId: `req${i}` });
    expect(sent.calls).toHaveLength(MENTION_PUSH_HOURLY_CAP);
  });

  it("does nothing without APNs configured", async () => {
    apns.configured = false;
    expect((await send()).status).toBe("apns_unconfigured");
    expect(db.receipts).toHaveLength(0);
  });
});

describe("what the alert says", () => {
  it("names the author, keeps a short excerpt, and deep-links by section and request — never a staff path", async () => {
    await send({ body: "x".repeat(400) });
    const p = sent.calls[0].payload as { aps: { alert: { title: string; body: string } }; section: string; requestId: string; path?: string };
    expect(p.aps.alert.title).toBe("Dan Lindsay mentioned you");
    expect(p.aps.alert.body.length).toBeLessThanOrEqual(120);
    expect(p.section).toBe("intake");
    expect(p.requestId).toBe("req1");
    expect(p.path).toBeUndefined();
  });

  it("puts the person first in the receipt key so the hourly cap can count by prefix", () => {
    expect(mentionReceiptKey("luke", "req1", NOON).startsWith("mention:luke:req1:")).toBe(true);
    expect(mentionPushCopy("", "").title).toBe("Someone mentioned you");
  });
});
