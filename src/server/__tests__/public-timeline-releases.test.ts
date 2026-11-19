/** The public /timeline/[token] share carries releases, with nothing but titles and done-ness. */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspaceClient: { findFirst: async () => ({ id: "c1", name: "Wedge" }) },
    featureBlock: { findMany: async () => [] },
    milestone: { findMany: async () => [] },
    task: { findMany: async () => [] },
    clientRelease: {
      findMany: async () => [
        {
          id: "r2",
          version: "v2.0.0",
          name: "Q4: Refinement",
          startDate: new Date("2026-11-01"),
          endDate: new Date("2026-11-14"),
          orderKey: 2,
          tasks: [
            { title: "Round setup editing", status: "DONE", dueDate: null },
            { title: "GPS re-center", status: "DOING", dueDate: null },
          ],
        },
        { id: "r9", version: "v9", name: null, startDate: null, endDate: null, orderKey: 9, tasks: [] },
      ],
    },
  },
}));
vi.mock("@/server/tasks", () => ({ assertClientInScope: async () => undefined }));
vi.mock("@/server/auth/effective-user", () => ({ ForbiddenError: class extends Error {} }));

import { getPublicTimeline } from "../client-timeline";

describe("public timeline releases", () => {
  it("lists dated releases with progress and client-safe task fields only", async () => {
    const t = await getPublicTimeline("tok");
    expect(t!.releases).toHaveLength(1);
    const r = t!.releases[0];
    expect(r).toMatchObject({ id: "r2", name: expect.stringContaining("v2.0.0"), progress: 50, estimated: false });
    expect(r.tasks).toEqual([
      { title: "Round setup editing", done: true },
      { title: "GPS re-center", done: false },
    ]);
  });
});
