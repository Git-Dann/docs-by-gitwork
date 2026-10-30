/**
 * Which clients a person is on (staff-clients.ts): a placement OR the client's product
 * team, ACTIVE clients only, one entry per client.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ clients: [] as Array<{ name: string; slug: string; status: string; productTeamUserIds: string[] }>, where: null as unknown }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspaceClient: {
      findMany: vi.fn(async ({ where }: { where: { status: string; productTeamUserIds: { hasSome?: string[]; isEmpty?: boolean } } }) => {
        db.where = where;
        return db.clients.filter(
          (c) =>
            c.status === where.status &&
            (where.productTeamUserIds.hasSome
              ? c.productTeamUserIds.some((id) => where.productTeamUserIds.hasSome!.includes(id))
              : c.productTeamUserIds.length > 0),
        );
      }),
    },
  },
}));

import { mergeStaffClients, productTeamClientsByUser } from "../staff-clients";

beforeEach(() => {
  db.clients = [
    { name: "Wedge", slug: "wedge", status: "ACTIVE", productTeamUserIds: ["dan", "harry"] },
    { name: "Fellas", slug: "fellas", status: "ACTIVE", productTeamUserIds: ["dan"] },
    { name: "Old Co", slug: "old", status: "ARCHIVED", productTeamUserIds: ["dan"] },
    { name: "Prospect", slug: "prospect", status: "LEAD", productTeamUserIds: ["harry"] },
  ];
});

describe("product-team clients", () => {
  it("puts a lead on every ACTIVE client whose product team they're on", async () => {
    const byUser = await productTeamClientsByUser("ws", ["dan", "harry", "nobody"]);
    expect(byUser.get("dan")?.map((c) => c.slug).sort()).toEqual(["fellas", "wedge"]);
    expect(byUser.get("harry")?.map((c) => c.slug)).toEqual(["wedge"]);
    expect(byUser.has("nobody")).toBe(false);
    expect((db.where as { status: string }).status).toBe("ACTIVE");
  });

  it("asks for nothing when there's nobody to ask about", async () => {
    db.where = null;
    expect((await productTeamClientsByUser("ws", [])).size).toBe(0);
    expect(db.where).toBeNull();
  });
});

describe("merging", () => {
  it("joins placements and product teams, one entry per client, sorted", () => {
    const merged = mergeStaffClients(
      [{ name: "Wedge", slug: "wedge" }, { name: "Acme", slug: null }],
      [{ name: "Wedge", slug: "wedge" }, { name: "Fellas", slug: "fellas" }, { name: "acme ", slug: null }],
    );
    expect(merged).toEqual([
      { name: "Acme", slug: null },
      { name: "Fellas", slug: "fellas" },
      { name: "Wedge", slug: "wedge" },
    ]);
  });
});
