import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROLES, ROLE_IDS } from "../auth";

/**
 * A role is only real if every list that decides something about roles knows about it.
 *
 * GUEST shipped without that being true, and the two consequences were not equal:
 *
 *   • the three `/api/team*` zod schemas each carried their own four-role enum, so the
 *     role existed everywhere except the routes that can ASSIGN it — the feature was
 *     unreachable, the §40.1 trap;
 *   • `KNOWN_ROLES` in server/permissions.ts was a fourth hand-written copy, and
 *     `freezeExistingMembers` rewrites any member whose role is NOT in it to STAFF.
 *     So an unknown role is not a typo, it is a silent promotion to a role that
 *     inherits every module id.
 *
 * Deriving them all from one list is the fix; this is what keeps it derived.
 */

const ROOT = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("ROLE_IDS is the one list", () => {
  it("matches ROLES exactly, in order", () => {
    expect([...ROLE_IDS]).toEqual(ROLES.map((r) => r.id));
  });

  it("has no duplicates", () => {
    expect(new Set(ROLE_IDS).size).toBe(ROLE_IDS.length);
  });

  it("includes GUEST", () => {
    // Named rather than counted: a count passes if someone swaps one role for another.
    expect(ROLE_IDS).toContain("GUEST");
  });
});

describe("nothing re-lists the roles by hand", () => {
  const files = [
    "src/app/api/team/route.ts",
    "src/app/api/team/members/[id]/route.ts",
    "src/app/api/team/[userId]/route.ts",
    "src/server/permissions.ts",
  ];

  it.each(files)("%s derives its roles instead of spelling them out", (file) => {
    const source = read(file);
    // The exact shape that caused this: a literal list of role ids. Matching on
    // "SUPER_ADMIN" alone would fire on legitimate single-role comparisons like
    // isAtLeast(role, "ADMIN"), so the needle is two ids adjacent in a literal.
    const handListed = /\[\s*"SUPER_ADMIN"\s*,\s*"ADMIN"/.test(source);
    expect(
      handListed,
      `${file} spells the roles out. Use ROLE_IDS from @/types/auth — a role missing ` +
        `from one of these lists is either unassignable or, in permissions.ts, silently ` +
        `frozen into STAFF.`,
    ).toBe(false);
  });

  it("the three team schemas all build from ROLE_IDS", () => {
    for (const file of files.slice(0, 3)) {
      expect(read(file), file).toContain("z.enum(ROLE_IDS)");
    }
  });

  it("KNOWN_ROLES is built from ROLES", () => {
    expect(read("src/server/permissions.ts")).toMatch(/KNOWN_ROLES\s*=\s*new Set<string>\(ROLES\.map/);
  });
});

describe("a guest can actually be created", () => {
  // The whole point of the role. A guest cannot use an invite link — those are Google
  // + @gitwork.co.uk — so if the Team UI has no password form, the role is decoration.
  const ui = read("src/components/settings/team-section.tsx");

  it("the Team UI posts a GUEST with a password", () => {
    expect(ui).toContain('role: "GUEST"');
    expect(ui).toMatch(/fetch\("\/api\/team"/);
    expect(ui).toContain("guestPassword");
  });

  it("creates the guest with NO permissions", () => {
    // Granting anything here would mean forgetting to restrict them is what grants
    // access. The default has to be nothing, and the grant a deliberate second step.
    expect(ui).toMatch(/role: "GUEST",\s*\n\s*permissions: \[\],/);
  });
});
