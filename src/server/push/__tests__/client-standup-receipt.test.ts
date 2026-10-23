import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The receipt is a daily slot, and a push to nobody must not spend it.
 *
 * ⚠️ MEASURED ON PRODUCTION, 21 Oct 2026. Wedge's AM (07:47) and PM (15:44)
 * standups each wrote a receipt with `deviceCount: 0`, and the client's phone
 * registered at 15:55 — eleven minutes after the second one. Both of the day's
 * slots were already claimed, so a handset that was by then perfectly able to
 * receive the day's updates could be sent neither of them.
 *
 * The quiet-hours branch already states the rule this broke: "claiming first
 * would silently burn the day's only chance on a push that was never sent."
 * The no-devices branch sat twelve lines below it doing the opposite.
 */

type Receipt = { wikiId: string; key: string; deviceCount: number };
let receipts: Receipt[] = [];
let devices: Array<{ id: string; token: string; environment: string; clientWikiUserId: string }> = [];

const prismaMock = {
  clientPushReceipt: {
    create: vi.fn(async ({ data }: { data: { wikiId: string; key: string } }) => {
      if (receipts.some((r) => r.wikiId === data.wikiId && r.key === data.key)) {
        throw new Error("Unique constraint failed"); // what Prisma does
      }
      const row = { ...data, deviceCount: 0 };
      receipts.push(row);
      return row;
    }),
    updateMany: vi.fn(async ({ where, data }: { where: { wikiId: string; key: string }; data: { deviceCount: number } }) => {
      let count = 0;
      for (const r of receipts) {
        if (r.wikiId === where.wikiId && r.key === where.key) { r.deviceCount = data.deviceCount; count++; }
      }
      return { count };
    }),
    deleteMany: vi.fn(async ({ where }: { where: { wikiId: string; key: string } }) => {
      const before = receipts.length;
      receipts = receipts.filter((r) => !(r.wikiId === where.wikiId && r.key === where.key));
      return { count: before - receipts.length };
    }),
  },
};

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
// `shrinkToFit` imports the real byte budget, so the mock has to carry it.
vi.mock("../apns", () => ({ isApnsConfigured: () => true, APNS_MAX_PAYLOAD_BYTES: 4096 }));
vi.mock("../client-devices", () => ({
  clientDeviceStore: {},
  listActiveClientDevices: async () => devices,
}));
vi.mock("../transport", () => ({
  fanOutToDevices: async (ds: unknown[]) => ({ sent: ds.length, failed: 0 }),
}));

const { sendClientStandupPush } = await import("../client-notifications");

const WIKI = "wiki-wedge";
const WORK_DATE = new Date("2026-10-21T00:00:00Z");
/** 15:44 London — inside the push window, as the real PM send was. */
const AFTERNOON = new Date("2026-10-21T14:44:00Z");

const send = () =>
  sendClientStandupPush({ wikiId: WIKI, clientName: "Wedge", phase: "PM", workDate: WORK_DATE, now: AFTERNOON });

beforeEach(() => { receipts = []; devices = []; });

describe("the daily receipt", () => {
  /** ⚠️ THE PRODUCTION CASE. No phone yet, so the slot must survive. */
  it("is released when there was no device to send to", async () => {
    expect((await send()).status).toBe("no_devices");
    expect(receipts).toHaveLength(0);
  });

  /**
   * ⚠️ AND THE CONSEQUENCE THAT MATTERS: a client who installs the app later
   * the same day still gets that day's update. Before the fix this second send
   * returned `already_sent` against a receipt that had reached nobody.
   */
  it("lets a phone that registers later the same day still receive the push", async () => {
    expect((await send()).status).toBe("no_devices");

    devices = [{ id: "d1", token: "aaaa", environment: "sandbox", clientWikiUserId: "u1" }];
    // The whole result, not just the status: `devices` lives only on the
    // "sent" arm of the union, and a status assertion does not narrow it.
    expect(await send()).toEqual({ status: "sent", devices: 1 });
  });

  /** A real send still claims the slot, so the next developer does not re-send. */
  it("keeps the claim once a push actually reaches a device", async () => {
    devices = [{ id: "d1", token: "aaaa", environment: "sandbox", clientWikiUserId: "u1" }];
    expect((await send()).status).toBe("sent");
    expect(receipts).toHaveLength(1);
    expect(receipts[0].deviceCount).toBe(1);

    expect((await send()).status).toBe("already_sent");
    expect(receipts).toHaveLength(1);
  });

  /**
   * ⚠️ Out of hours nothing is written at all — the behaviour the no-devices
   * branch now matches. Asserted here so the two cannot drift apart again.
   */
  it("writes nothing at all outside the client's waking hours", async () => {
    devices = [{ id: "d1", token: "aaaa", environment: "sandbox", clientWikiUserId: "u1" }];
    const dawn = new Date("2026-10-21T04:00:00Z"); // 05:00 London
    const res = await sendClientStandupPush({
      wikiId: WIKI, clientName: "Wedge", phase: "AM", workDate: WORK_DATE, now: dawn,
    });
    expect(res.status).toBe("quiet_hours");
    expect(receipts).toHaveLength(0);
  });
});
