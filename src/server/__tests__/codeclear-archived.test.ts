import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ where: null as unknown, users: [] as { email: string }[] }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: vi.fn(async (args: { where: unknown }) => {
        db.where = args.where;
        return db.users;
      }),
    },
  },
}));

import {
  activeDeveloperWhere,
  archivedDeveloperWhere,
  archivedTeamEmails,
} from "../codeclear-archived";
import { buildCandidateWhere } from "../codeclear-candidate-where";

beforeEach(() => {
  db.where = null;
  db.users = [];
});

describe("which developers belong to people who have left", () => {
  it("counts an archived membership AND a User with no membership at all", async () => {
    // Without the second case a developer would silently reappear on the active
    // roster the day their 30-day window ran out and the membership was purged.
    await archivedTeamEmails("w1");
    expect(db.where).toEqual({
      OR: [
        { memberships: { some: { workspaceId: "w1", archivedAt: { not: null } } } },
        { memberships: { none: { workspaceId: "w1" } } },
      ],
    });
  });

  it("normalises emails to lower case", async () => {
    db.users = [{ email: " Syed@Gitwork.co.uk " }];
    expect(await archivedTeamEmails("w1")).toEqual(["syed@gitwork.co.uk"]);
  });

  it("matches case-insensitively — Candidate.email is typed by hand", () => {
    expect(archivedDeveloperWhere(["syed@gitwork.co.uk"])).toEqual({
      OR: [{ email: { equals: "syed@gitwork.co.uk", mode: "insensitive" } }],
    });
  });

  it("with nobody archived, the active roster is unfiltered and the archive is empty", () => {
    expect(activeDeveloperWhere([])).toEqual({});
    // Must match NOTHING — an empty OR would match everything in some engines.
    expect(archivedDeveloperWhere([])).toEqual({ id: { in: [] } });
  });
});

describe("the developer list filter", () => {
  const params = (q: Record<string, string>) => new URLSearchParams(q);

  it("excludes archived developers by default", () => {
    const w = buildCandidateWhere("w1", params({}), ["tom@gitwork.co.uk"]);
    expect(w.AND).toContainEqual({
      NOT: { OR: [{ email: { equals: "tom@gitwork.co.uk", mode: "insensitive" } }] },
    });
  });

  it("returns only archived developers when asked", () => {
    const w = buildCandidateWhere("w1", params({ archived: "1" }), ["tom@gitwork.co.uk"]);
    expect(w.AND).toContainEqual({
      OR: [{ email: { equals: "tom@gitwork.co.uk", mode: "insensitive" } }],
    });
  });

  it("keeps DevSignal isolation in both modes", () => {
    for (const q of [{}, { archived: "1" }] as Record<string, string>[]) {
      const w = buildCandidateWhere("w1", params(q), []);
      expect(w.AND).toContainEqual({ NOT: { origin: "EXTERNAL", published: false } });
    }
  });

  /**
   * ⚠️ The bug this replaced: stack, search, confidence and score range each set
   * a top-level `OR`, and an object literal keeps only the LAST key — so combining
   * any two silently dropped all but one. Searching a name with a confidence
   * filter on ignored the name.
   */
  it("combining search, stack, confidence and score keeps every filter", () => {
    const w = buildCandidateWhere(
      "w1",
      params({ q: "syed", stack: "Flutter", identityConfidence: "HIGH", scoreMin: "40" }),
      [],
    );
    expect(w).not.toHaveProperty("OR");
    const ors = (w.AND as { OR?: unknown[] }[]).filter((c) => c.OR);
    expect(ors).toHaveLength(4);
    const flat = JSON.stringify(ors);
    expect(flat).toContain('"syed"');
    expect(flat).toContain('"Flutter"');
    expect(flat).toContain('"HIGH"');
    expect(flat).toContain('"gte":40');
  });
});
