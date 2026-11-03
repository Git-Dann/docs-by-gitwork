// @vitest-environment node
/**
 * The settings route is what Harry's Save button talks to. It must refuse bad input
 * loudly (a typo'd key that "saved successfully" and showed nothing would be a silent
 * failure on a public page) and store exactly the shape the reader expects.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const update = vi.fn(async (args: { data: Record<string, unknown> }) => ({
  pulseEmbedEnabled: true, pulseEmbedBookingUrl: null, turnstileSiteKey: null, ...args.data,
}));
const audit = vi.fn(async (..._a: unknown[]) => {});
let stored: unknown = null;

vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "u1" } })) }));
vi.mock("@/lib/prisma", () => ({ prisma: { workspace: { update: (a: never) => update(a) } } }));
vi.mock("@/server/bootstrap", () => ({
  ensureBaseRecords: vi.fn(async () => ({ workspace: { id: "w1", pulseEmbedEnabled: true, pulseEmbedBookingUrl: null } })),
}));
vi.mock("@/server/audit-log", () => ({ recordAuditEntry: (a: never) => audit(a) }));
vi.mock("@/lib/encryption", () => ({ encryptNullable: (v: string) => `enc(${v})` }));
vi.mock("@/server/pulse-embed-workspace", async () => {
  const { normaliseFreeKeys } = await import("@/lib/pulse-free-tier");
  const { CHECKS_REGISTRY } = await import("@/server/checks-registry");
  const known = new Set(CHECKS_REGISTRY.map((c) => c.key));
  return {
    getPulseEmbedWorkspaceConfig: vi.fn(async () => ({
      enabled: true, bookingUrl: "https://b", turnstileSiteKey: "k", turnstileSecretKey: "s",
      freeCheckKeys: normaliseFreeKeys(stored, known),
    })),
  };
});

import { GET, PATCH } from "../route";
import { CHECKS_REGISTRY } from "@/server/checks-registry";

const KEYS = CHECKS_REGISTRY.slice(0, 3).map((c) => c.key);
const patch = (body: unknown) =>
  PATCH(new Request("https://x.test/api/workspace/pulse-embed", {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest);

beforeEach(() => { vi.clearAllMocks(); stored = null; });

describe("GET", () => {
  it("reports no limit by default", async () => {
    const res = await GET();
    expect((await res.json()).freeCheckKeys).toBeNull();
  });

  it("reports the saved set", async () => {
    stored = { keys: KEYS };
    expect((await (await GET()).json()).freeCheckKeys).toEqual(KEYS);
  });

  it("a legacy bare-array column does NOT silently become a limit", async () => {
    stored = KEYS; // what the retired picker left in the database
    expect((await (await GET()).json()).freeCheckKeys).toBeNull();
  });
});

describe("PATCH freeCheckKeys", () => {
  it("stores { keys } for an array", async () => {
    const res = await patch({ freeCheckKeys: KEYS });
    expect(res.status).toBe(200);
    expect(update.mock.calls[0][0].data.pulseEmbedCheckKeys).toEqual({ keys: KEYS });
  });

  it("dedupes repeated keys", async () => {
    await patch({ freeCheckKeys: [KEYS[0], KEYS[0], KEYS[1]] });
    expect(update.mock.calls[0][0].data.pulseEmbedCheckKeys).toEqual({ keys: [KEYS[0], KEYS[1]] });
  });

  it("null clears the limit (SQL NULL, not the JSON string 'null')", async () => {
    await patch({ freeCheckKeys: null });
    expect(update.mock.calls[0][0].data.pulseEmbedCheckKeys).toBe(Prisma.DbNull);
  });

  it("an empty array is stored as a limit that shows nothing — not cleared", async () => {
    await patch({ freeCheckKeys: [] });
    expect(update.mock.calls[0][0].data.pulseEmbedCheckKeys).toEqual({ keys: [] });
  });

  it("rejects an unknown key with a message naming it, and writes nothing", async () => {
    const res = await patch({ freeCheckKeys: [KEYS[0], "not_a_real_check"] });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("not_a_real_check");
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects a non-array", async () => {
    expect((await patch({ freeCheckKeys: "all" })).status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("leaves the limit untouched when the field is omitted (e.g. saving the booking link)", async () => {
    await patch({ bookingUrl: "https://example.com/book" });
    expect("pulseEmbedCheckKeys" in update.mock.calls[0][0].data).toBe(false);
  });

  it("audits the COUNT, never a thousand keys", async () => {
    await patch({ freeCheckKeys: KEYS });
    const meta = (audit.mock.calls[0] as unknown as [{ metadata: { freeCheckKeys: string } }])[0].metadata;
    expect(meta.freeCheckKeys).toBe("3 checks");
  });

  it("the Turnstile secret still never appears in the audit entry", async () => {
    await patch({ turnstileSecretKey: "super-secret" });
    expect(JSON.stringify(audit.mock.calls)).not.toContain("super-secret");
  });
});
