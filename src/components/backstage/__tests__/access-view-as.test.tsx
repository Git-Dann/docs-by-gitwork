// @vitest-environment jsdom
/**
 * Backstage follows "view as": a Super Admin previewing as Siân sees her Backstage, not
 * their own (Nov 2026). Before, it read the real session only, so the preview showed
 * Handover and Expenses whatever the person previewed could actually use.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

const session = vi.hoisted(() => ({ role: "SUPER_ADMIN", permissions: [] as string[] }));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "u-dan", role: session.role, permissions: session.permissions } } }),
}));

import { useBackstageAccess } from "@/components/backstage/access";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function readAccess() {
  let out: ReturnType<typeof useBackstageAccess> | null = null;
  function Probe() {
    out = useBackstageAccess();
    return null;
  }
  const el = document.createElement("div");
  const root = createRoot(el);
  await act(async () => root.render(createElement(Probe)));
  root.unmount();
  return out!;
}

afterEach(() => {
  localStorage.clear();
  session.role = "SUPER_ADMIN";
  session.permissions = [];
});

describe("useBackstageAccess", () => {
  it("is the real account with no preview", async () => {
    const a = await readAccess();
    expect([a.isAdmin, a.canApprove, a.canManageExpenses]).toEqual([true, true, true]);
  });

  it("is the previewed person's access while viewing as them", async () => {
    localStorage.setItem("foundry_view_as_role", "USER");
    localStorage.setItem(
      "foundry_view_as_user",
      JSON.stringify({ name: "Siân", role: "STAFF", permissions: ["codeclear", "backstage", "backstage.approve", "backstage.expenses"] }),
    );
    const a = await readAccess();
    // Not an Admin, so no Handover card; still approves leave and reviews expenses.
    expect([a.role, a.isAdmin, a.canApprove, a.canManageExpenses]).toEqual(["STAFF", false, true, true]);
  });

  it("drops what a previewed role doesn't have", async () => {
    localStorage.setItem("foundry_view_as_role", "DEVELOPER");
    const a = await readAccess();
    expect([a.isAdmin, a.canApprove, a.canManageExpenses]).toEqual([false, false, false]);
  });

  it("ignores a stored preview for someone who isn't an Admin", async () => {
    session.role = "STAFF";
    session.permissions = ["backstage"];
    localStorage.setItem("foundry_view_as_role", "USER");
    localStorage.setItem("foundry_view_as_user", JSON.stringify({ name: "x", role: "ADMIN", permissions: ["backstage.approve"] }));
    const a = await readAccess();
    expect([a.isAdmin, a.canApprove]).toEqual([false, false]);
  });
});
