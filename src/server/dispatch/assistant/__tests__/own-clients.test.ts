import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { activeOnly, reachableStatuses } from "../own-clients";

describe("which clients count as 'yours' (agrees with Portal)", () => {
  const rows = [
    { name: "Wedge", status: "ACTIVE" },
    { name: "Old Wedge", status: "ARCHIVED" },
    { name: "Paused Co", status: "INACTIVE" },
    { name: "Prospect", status: "LEAD" },
  ];

  it("counts only active clients, as Portal lists them by default", () => {
    expect(activeOnly(rows).map((r) => r.name)).toEqual(["Wedge"]);
  });

  it("paused and archived can still be asked about; leads only by a Super Admin; awaiting review never", () => {
    expect(reachableStatuses({ role: "DEVELOPER" } as never)).toEqual(["ACTIVE", "INACTIVE", "ARCHIVED"]);
    expect(reachableStatuses({ role: "ADMIN" } as never)).not.toContain("LEAD");
    expect(reachableStatuses({ role: "SUPER_ADMIN" } as never)).toContain("LEAD");
    for (const role of ["DEVELOPER", "ADMIN", "SUPER_ADMIN"]) expect(reachableStatuses({ role } as never)).not.toContain("PENDING_REVIEW");
  });
});
