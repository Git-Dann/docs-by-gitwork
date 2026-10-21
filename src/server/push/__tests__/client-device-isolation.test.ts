import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * One phone, one client's portal.
 *
 * ⚠️ THE PROPERTY THIS FILE EXISTS FOR. A client signed in to Wedge must receive
 * Wedge's updates and nothing else. A push that crossed that boundary would show
 * one client another client's delivery progress — the single worst thing this
 * feature could do, and the kind of leak that is invisible until it has already
 * happened to someone.
 *
 * The isolation was built in from the start (`ClientDeviceToken.wikiId`, a
 * `wikiId`-scoped fan-out, and an upsert that rewrites the owner). Nothing
 * proved it, which is why it is pinned here: every one of those three could be
 * "simplified" by someone who did not know what it was holding up.
 */

type Row = {
  token: string;
  wikiId: string;
  clientWikiUserId: string;
  failedAt: Date | null;
};

let rows: Row[] = [];

const prismaMock = {
  clientDeviceToken: {
    upsert: vi.fn(async ({ where, update, create }: never extends never ? any : never) => {
      const existing = rows.find((r) => r.token === where.token);
      if (existing) {
        Object.assign(existing, {
          wikiId: update.wikiId,
          clientWikiUserId: update.clientWikiUserId,
          failedAt: null,
        });
        return existing;
      }
      const row: Row = {
        token: create.token,
        wikiId: create.wikiId,
        clientWikiUserId: create.clientWikiUserId,
        failedAt: null,
      };
      rows.push(row);
      return row;
    }),
    findMany: vi.fn(async ({ where }: never extends never ? any : never) =>
      rows.filter((r) => r.wikiId === where.wikiId && r.failedAt === null),
    ),
    deleteMany: vi.fn(async ({ where }: never extends never ? any : never) => {
      const before = rows.length;
      rows = rows.filter(
        (r) => !(r.clientWikiUserId === where.clientWikiUserId && r.token === where.token),
      );
      return { count: before - rows.length };
    }),
    updateMany: vi.fn(async () => ({ count: 0 })),
  },
};

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const {
  registerClientDeviceToken,
  listActiveClientDevices,
  unregisterClientDeviceToken,
} = await import("../client-devices");

beforeEach(() => {
  rows = [];
});

const WEDGE = "wiki-wedge";
const GROOP = "wiki-yourgroop";

describe("a client's phones", () => {
  it("reaches only the wiki it was registered against", async () => {
    await registerClientDeviceToken({
      clientWikiUserId: "u-wedge", wikiId: WEDGE, token: "aaaa", environment: "production",
    });
    await registerClientDeviceToken({
      clientWikiUserId: "u-groop", wikiId: GROOP, token: "bbbb", environment: "production",
    });

    expect((await listActiveClientDevices(WEDGE)).map((d) => d.token)).toEqual(["aaaa"]);
    expect((await listActiveClientDevices(GROOP)).map((d) => d.token)).toEqual(["bbbb"]);
  });

  /**
   * ⚠️ THE HANDOVER, and the case that would actually leak. Someone who can see
   * two portals is seeing two different companies. Switching wiki re-registers
   * the SAME device token, and the upsert must MOVE it — if it added a second
   * row instead, the old portal would keep ringing this handset with the other
   * client's standups forever.
   */
  it("moves, rather than accumulating, when the viewer switches wiki", async () => {
    await registerClientDeviceToken({
      clientWikiUserId: "u-wedge", wikiId: WEDGE, token: "aaaa", environment: "production",
    });
    await registerClientDeviceToken({
      clientWikiUserId: "u-groop", wikiId: GROOP, token: "aaaa", environment: "production",
    });

    expect(await listActiveClientDevices(WEDGE)).toHaveLength(0);
    expect((await listActiveClientDevices(GROOP)).map((d) => d.token)).toEqual(["aaaa"]);
    expect(rows).toHaveLength(1);
  });

  /**
   * ⚠️ Scoped to the owner, so a stale sign-out cannot silence the handset's new
   * owner, and one client user cannot unregister another's device by guessing a
   * token.
   */
  it("only unregisters a device for the user who owns it", async () => {
    await registerClientDeviceToken({
      clientWikiUserId: "u-groop", wikiId: GROOP, token: "aaaa", environment: "production",
    });

    await unregisterClientDeviceToken("u-wedge", "aaaa");
    expect((await listActiveClientDevices(GROOP))).toHaveLength(1);

    await unregisterClientDeviceToken("u-groop", "aaaa");
    expect((await listActiveClientDevices(GROOP))).toHaveLength(0);
  });

  /** A device APNs has rejected is out of every fan-out until it re-registers. */
  it("leaves a failed device out, and takes it back when it returns", async () => {
    await registerClientDeviceToken({
      clientWikiUserId: "u-wedge", wikiId: WEDGE, token: "aaaa", environment: "production",
    });
    rows[0].failedAt = new Date();
    expect(await listActiveClientDevices(WEDGE)).toHaveLength(0);

    await registerClientDeviceToken({
      clientWikiUserId: "u-wedge", wikiId: WEDGE, token: "aaaa", environment: "production",
    });
    expect(await listActiveClientDevices(WEDGE)).toHaveLength(1);
  });
});
