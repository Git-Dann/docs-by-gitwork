import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const created: Array<Record<string, unknown>> = [];
vi.mock("@/lib/prisma", () => ({
  prisma: { workspaceInvite: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => (created.push(data), data)) } },
}));
vi.mock("@/server/auth/effective-user", () => ({ ForbiddenError: class extends Error {} }));
vi.mock("@/server/audit-log", () => ({ recordAuditEntry: vi.fn() }));
vi.mock("@/server/notifications", () => ({ dispatchNotification: vi.fn() }));
vi.mock("@/server/permissions", () => ({ recomputeMember: vi.fn() }));
vi.mock("@/server/seed-accounts", () => ({ seedAccountUserWhere: () => ({}), isSeedAccount: () => false }));

import { createInvite } from "../team";

beforeEach(() => {
  created.length = 0;
});

describe("Team invites with an email and a role", () => {
  it("an Admin cannot mint a Super Admin or Admin invite", async () => {
    await expect(createInvite("ws", "u", { role: "SUPER_ADMIN", inviterRole: "ADMIN" })).rejects.toThrow();
    await expect(createInvite("ws", "u", { role: "ADMIN", inviterRole: "ADMIN" })).rejects.toThrow();
    expect(created).toHaveLength(0);
  });

  it("an Admin can invite Staff, addressed to one email", async () => {
    await createInvite("ws", "u", { role: "STAFF", email: " Jo@Canary.test ", inviterRole: "ADMIN" });
    expect(created[0]).toMatchObject({ workspaceId: "ws", role: "STAFF", email: "jo@canary.test" });
  });

  it("refuses a malformed email rather than storing it", async () => {
    await expect(createInvite("ws", "u", { email: "not-an-email", inviterRole: "ADMIN" })).rejects.toThrow();
  });

  it("an open invite with no role is the old behaviour", async () => {
    await createInvite("ws", "u", { label: "For Sarah" });
    expect(created[0]).toMatchObject({ label: "For Sarah", email: null, role: null });
  });
});

describe("the workspace switcher", () => {
  const auth = readFileSync(join(process.cwd(), "src/auth.ts"), "utf8");
  it("only switches to a workspace the person is an active member of, checked on the server", () => {
    expect(auth).toMatch(/trigger === "update" && tokenId && typeof wanted === "string"/);
    expect(auth).toMatch(/if \(await findActiveMembershipIn\(tokenId, wanted\)\) \{\n\s+token\.workspaceId = wanted;/);
  });
});
