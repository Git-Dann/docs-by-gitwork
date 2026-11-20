/** Batch status and delete are one write each, and never reach another client's requests. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { update?: unknown; del?: unknown } = {};
vi.mock("@/lib/prisma", () => ({
  prisma: {
    clientCourseRequest: {
      updateMany: vi.fn(async (args: unknown) => ((calls.update = args), { count: 2 })),
      deleteMany: vi.fn(async (args: unknown) => ((calls.del = args), { count: 2 })),
    },
  },
}));

vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));

import { deleteCourseRequests, setCourseRequestsStatus } from "@/server/wiki";

beforeEach(() => {
  calls.update = undefined;
  calls.del = undefined;
});

describe("batch course request writes", () => {
  it("sets status in one write, only inside the client's own wiki, stamping sentAt for SENT", async () => {
    expect(await setCourseRequestsStatus("c1", ["a", "b"], "SENT")).toBe(2);
    expect(calls.update).toMatchObject({ where: { id: { in: ["a", "b"] }, wiki: { clientId: "c1" } }, data: { status: "SENT" } });
    expect((calls.update as { data: { sentAt?: unknown } }).data.sentAt).toBeInstanceOf(Date);
  });

  it("doesn't stamp sentAt for other statuses", async () => {
    await setCourseRequestsStatus("c1", ["a"], "NEW");
    expect((calls.update as { data: object }).data).not.toHaveProperty("sentAt");
  });

  it("deletes only inside the client's own wiki", async () => {
    await deleteCourseRequests("c1", ["a"]);
    expect(calls.del).toEqual({ where: { id: { in: ["a"] }, wiki: { clientId: "c1" } } });
  });

  it("writes nothing for an empty list", async () => {
    expect(await setCourseRequestsStatus("c1", [], "SENT")).toBe(0);
    expect(calls.update).toBeUndefined();
  });
});
