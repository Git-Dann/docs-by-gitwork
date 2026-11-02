import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  user: { userId: "u1", workspaceId: "w1", role: "ADMIN", permissions: [] as string[] },
  row: { seasonalThemeEnabled: false, seasonalTheme: "halloween" },
  update: vi.fn(),
}));

vi.mock("@/server/auth/effective-user", () => {
  class ForbiddenError extends Error { status = 403; }
  return {
    ForbiddenError,
    requireAuthedUser: vi.fn(async () => h.user),
    assertAtLeastAdmin: (u: { role: string }) => {
      if (!["ADMIN", "SUPER_ADMIN"].includes(u.role)) throw new ForbiddenError("Admins only.");
    },
  };
});
vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspace: {
      findUnique: vi.fn(async () => h.row),
      update: h.update,
    },
  },
}));

import { GET, PUT } from "../route";

const put = (body: unknown) =>
  PUT(new NextRequest("http://localhost/api/settings/seasonal-theme", { method: "PUT", body: JSON.stringify(body) }));

describe("seasonal theme setting", () => {
  beforeEach(() => {
    h.user.role = "ADMIN";
    h.row = { seasonalThemeEnabled: false, seasonalTheme: "halloween" };
    h.update.mockReset().mockImplementation(async ({ data }) => ({ seasonalThemeEnabled: data.seasonalThemeEnabled, seasonalTheme: data.seasonalTheme }));
  });

  it("any member can read it; off means no active theme", async () => {
    h.user.role = "DEVELOPER";
    const body = await (await GET(new NextRequest("http://localhost/api/settings/seasonal-theme"))).json();
    expect(body).toEqual({ enabled: false, theme: "halloween", active: null });
  });

  it("an admin switches it on", async () => {
    const res = await put({ enabled: true, theme: "halloween" });
    expect(res.status).toBe(200);
    expect((await res.json()).active).toBe("halloween");
  });

  it("staff and developers can't change it", async () => {
    for (const role of ["STAFF", "DEVELOPER"]) {
      h.user.role = role;
      expect((await put({ enabled: true, theme: "halloween" })).status).toBe(403);
    }
    expect(h.update).not.toHaveBeenCalled();
  });

  it("refuses a theme we don't ship", async () => {
    expect((await put({ enabled: true, theme: "easter" })).status).toBe(400);
    expect(h.update).not.toHaveBeenCalled();
  });
});
