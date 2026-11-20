/**
 * Care's two grants, checked in one place.
 *
 * ⚠️ `/api/support/**` is NOT covered by the module gate — that reads `/app` paths only — so a
 * per-route assert was the whole enforcement, and an audit found ELEVEN handlers with none:
 * a connector purge, a full history re-pull, an outbound IMAP login with caller-supplied
 * credentials, a rule seeder, a ticket batch, the report writes, a semantic search that spends
 * embedding tokens, the Discord channel lookup — and `POST …/conversations/[convId]/messages`,
 * which sends real mail to a client's customer, in the client's name, from the client's mailbox.
 *
 * The check now lives inside `requireSupportClient` / `requireSupportWorkspace`, which every
 * handler already had to call, so forgetting it is impossible rather than merely unlikely.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  caller: null as { role: string; permissions: string[] } | null,
  clientLookups: 0,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    supportClient: {
      count: vi.fn(async ({ where }: { where: { id: string; workspaceId: string } }) => {
        db.clientLookups += 1;
        return where.id === "care-a" && where.workspaceId === "ws-a" ? 1 : 0;
      }),
    },
  },
}));

vi.mock("@/server/workspaces/scope", () => ({
  workspaceIdForRequest: vi.fn(async () => "ws-a"),
}));

/**
 * The real module pulls next-auth in, which will not load here, so the two predicates are
 * reproduced faithfully. They are one-line `can(user, "<id>")` wrappers; the ids themselves are
 * asserted against the live catalogue at the foot of this file, so a renamed id still fails.
 */
vi.mock("@/server/auth/effective-user", () => ({
  getEffectiveUserOrNull: vi.fn(async () => db.caller),
  canUseSupport: (u: { permissions: string[] }) => u.permissions.includes("support"),
  canManageSupport: (u: { permissions: string[] }) => u.permissions.includes("support.manage"),
  assertCan: (u: unknown, check: (x: never) => boolean, label: string) => {
    if (u && !check(u as never)) {
      throw Object.assign(new Error(`You don't have permission to ${label}.`), { status: 403 });
    }
  },
}));

const req = () => new Request("https://example.test/api/support/clients/care-a");

function as(permissions: string[]) {
  db.caller = { role: "DEVELOPER", permissions } as never;
}

beforeEach(() => {
  db.caller = null;
  db.clientLookups = 0;
  vi.clearAllMocks();
});

describe("who may reach Care", () => {
  it("refuses a caller holding no Care grant at all", async () => {
    const { requireSupportClient } = await import("@/server/support-scope");
    as(["clients"]);
    await expect(requireSupportClient(req(), "care-a")).rejects.toThrow(/permission/i);
  });

  it("lets `support` open, read, reply and triage", async () => {
    const { requireSupportClient } = await import("@/server/support-scope");
    as(["support"]);
    await expect(requireSupportClient(req(), "care-a")).resolves.toBe("ws-a");
  });

  it("refuses `support` the setup routes", async () => {
    const { requireSupportClient } = await import("@/server/support-scope");
    as(["support"]);
    await expect(requireSupportClient(req(), "care-a", "manage")).rejects.toThrow(/permission/i);
  });

  it("lets `support.manage` through the setup routes", async () => {
    const { requireSupportClient } = await import("@/server/support-scope");
    as(["support", "support.manage"]);
    await expect(requireSupportClient(req(), "care-a", "manage")).resolves.toBe("ws-a");
  });

  it("lets the trusted workspace API key through both, as every other module does", async () => {
    const { requireSupportClient } = await import("@/server/support-scope");
    db.caller = null; // no per-user identity == the env API_KEY
    await expect(requireSupportClient(req(), "care-a")).resolves.toBe("ws-a");
    await expect(requireSupportClient(req(), "care-a", "manage")).resolves.toBe("ws-a");
  });

  it("checks the permission BEFORE looking the client up", async () => {
    // Someone with no Care grant is told so, not told whether a client id exists.
    const { requireSupportClient } = await import("@/server/support-scope");
    as([]);
    await expect(requireSupportClient(req(), "care-a")).rejects.toThrow(/permission/i);
    expect(db.clientLookups).toBe(0);
  });

  it("still 404s another workspace's client for a caller who does hold Care", async () => {
    const { requireSupportClient } = await import("@/server/support-scope");
    as(["support", "support.manage"]);
    await expect(requireSupportClient(req(), "care-b")).rejects.toThrow(/not found/i);
  });

  it("gates the workspace-wide roll-ups the same way", async () => {
    const { requireSupportWorkspace } = await import("@/server/support-scope");
    as(["clients"]);
    await expect(requireSupportWorkspace(req())).rejects.toThrow(/permission/i);
    as(["support"]);
    await expect(requireSupportWorkspace(req())).resolves.toBe("ws-a");
    await expect(requireSupportWorkspace(req(), "manage")).rejects.toThrow(/permission/i);
  });
});

describe("the ids the gate is built on", () => {
  it("are the two Care permissions in the live catalogue", async () => {
    const { PERMISSION_CATALOG } = await import("@/types/auth");
    const ids = PERMISSION_CATALOG.flatMap((g) => g.permissions.map((p) => p.id));
    expect(ids).toContain("support");
    expect(ids).toContain("support.manage");
  });

  it("are both held by STAFF, and only `support` by DEVELOPER", async () => {
    // So the re-cut gives a developer triage without giving them connector setup, and changes
    // nothing for staff. No role matrix had to move for this.
    const { DEFAULT_ROLE_PERMISSIONS } = await import("@/types/auth");
    expect(DEFAULT_ROLE_PERMISSIONS.STAFF).toContain("support.manage");
    expect(DEFAULT_ROLE_PERMISSIONS.DEVELOPER).toContain("support");
    expect(DEFAULT_ROLE_PERMISSIONS.DEVELOPER).not.toContain("support.manage");
  });
});
