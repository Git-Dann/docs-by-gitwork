/**
 * The client's (token) Sheets routes refuse layout writes (§73.1). A client's resizes live in
 * their own browser; the server must refuse a `height` (or anything that isn't cells) rather
 * than quietly drop it, and there is no client route that reorders rows or sets a width.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const seen = vi.hoisted(() => ({ cells: [] as unknown[], people: [] as unknown[] }));

vi.mock("@/server/wiki-sheets-access", () => ({
  resolveSheetsWriter: vi.fn(async () => ({
    ok: true,
    clientSlug: "northwind",
    writer: { wikiId: "wiki-1", name: "Priya", wikiUserId: "wu-priya" },
  })),
  assertSheetsWriteRate: vi.fn(async () => undefined),
  sheetsAccessError: () => ({ message: "no", status: 401 }),
}));
vi.mock("@/server/wiki-sheets", () => ({
  clientUpdateCells: vi.fn(async (...args: unknown[]) => void seen.cells.push(args)),
  clientAddRows: vi.fn(async () => ["r"]),
  clientDeleteRows: vi.fn(async () => 0),
  sendSheetRowsToBoard: vi.fn(async () => []),
}));
vi.mock("@/server/wiki-intake-mentions", () => ({
  sheetPeopleDirectory: vi.fn(async (_k: unknown, side: string) => {
    seen.people.push(side);
    return [{ id: "client:wu-priya", name: "Priya Shah", kind: "CLIENT", email: "priya@northwind.com" }];
  }),
  sheetPeopleForBrowser: (entries: { id: string; name: string; kind: string }[]) =>
    entries.map(({ id, name, kind }) => ({ id, name, kind })),
}));

import * as rowRoute from "@/app/api/wiki/[token]/sheets/[sheetId]/rows/[rowId]/route";
import * as rowsRoute from "@/app/api/wiki/[token]/sheets/[sheetId]/rows/route";
import * as peopleRoute from "@/app/api/wiki/[token]/sheets/people/route";
import type { NextRequest } from "next/server";

function req(body: unknown): NextRequest {
  return new Request("http://x/api", { method: "PATCH", body: JSON.stringify(body), headers: { "content-type": "application/json" } }) as unknown as NextRequest;
}
const ctx = { params: Promise.resolve({ token: "tok", sheetId: "s1", rowId: "r1" }) };

beforeEach(() => {
  seen.cells = [];
  seen.people = [];
});

describe("the client's row route", () => {
  it("takes cells", async () => {
    const res = await rowRoute.PATCH(req({ cells: { item: "x" } }), ctx);
    expect(res.status).toBe(200);
    expect(seen.cells).toHaveLength(1);
  });

  it("refuses a height — 400, nothing written", async () => {
    const res = await rowRoute.PATCH(req({ cells: {}, height: 80 }), ctx);
    expect(res.status).toBe(400);
    const alone = await rowRoute.PATCH(req({ height: 80 }), ctx);
    expect(alone.status).toBe(400);
    expect(seen.cells).toHaveLength(0);
  });

  it("refuses a width smuggled in too", async () => {
    const res = await rowRoute.PATCH(req({ cells: {}, width: 300 }), ctx);
    expect(res.status).toBe(400);
  });
});

describe("no client route reorders rows or resizes columns", () => {
  it("the client's rows route has no PUT (reorder)", () => {
    expect((rowsRoute as Record<string, unknown>).PUT).toBeUndefined();
    expect((rowRoute as Record<string, unknown>).PUT).toBeUndefined();
  });

  it("there is no client columns route", () => {
    expect(existsSync(join(process.cwd(), "src/app/api/wiki/[token]/sheets/[sheetId]/columns"))).toBe(false);
  });

  it("the team's row route is the one that takes a height", () => {
    const src = readFileSync(join(process.cwd(), "src/app/api/clients/[slug]/wiki/sheets/[sheetId]/rows/[rowId]/route.ts"), "utf8");
    expect(src).toContain("sheetRowPatchSchema");
    expect(src).toContain("setSheetRowHeight");
  });
});

describe("the client's person list", () => {
  it("is the CLIENT side of the directory, and carries no emails", async () => {
    const res = await peopleRoute.GET(req({}), { params: Promise.resolve({ token: "tok" }) });
    const body = (await res.json()) as { data?: unknown } & Record<string, unknown>;
    expect(seen.people).toEqual(["client"]);
    expect(JSON.stringify(body)).not.toContain("@northwind.com");
    expect(JSON.stringify(body)).toContain("Priya Shah");
  });
});
