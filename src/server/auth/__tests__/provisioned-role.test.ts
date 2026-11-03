import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_PROVISIONED_ROLE, DEFAULT_ROLE_PERMISSIONS } from "@/types/auth";

/**
 * A person Foundry creates a membership for — a first sign-in, or accepting an
 * invite — starts as DEVELOPER (Dan, Oct 2026). It used to be STAFF, whose default
 * includes commercial rates and every client, so a brand-new account saw both on
 * day one before anyone had decided it should.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
/**
 * Comments removed, because these files explain the bug they fixed in prose —
 * mobile-callback quotes the old `role = membership?.role ?? "STAFF"` verbatim —
 * and the assertion is about code. (`//` inside a string literal is not a concern
 * in these files; none of the provisioning code carries one.)
 */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const PROVISIONING_PATHS = [
  "src/auth.ts",
  "src/app/api/auth/mobile-callback/route.ts",
  "src/app/api/auth/desktop/start/route.ts",
  "src/server/team.ts",
];

describe("new members are provisioned as Developer", () => {
  it("the default is DEVELOPER", () => {
    expect(DEFAULT_PROVISIONED_ROLE).toBe("DEVELOPER");
  });

  it("which carries none of the commercial or all-clients grants", () => {
    // The reason for the change, pinned: if DEVELOPER's defaults ever grow these,
    // provisioning as DEVELOPER stops being the safe default it is meant to be.
    const dev = DEFAULT_ROLE_PERMISSIONS.DEVELOPER;
    for (const p of ["seeAllClients", "code.viewRates", "docs.viewCosts", "rateCard.view"]) {
      expect(dev, p).not.toContain(p);
    }
  });

  it.each(PROVISIONING_PATHS)("%s uses the constant, not a hardcoded role", (file) => {
    const src = code(file);
    expect(src).toMatch(/DEFAULT_PROVISIONED_ROLE/);
    // No membership is CREATED with a literal STAFF any more. (Matches the create
    // shapes these files use: a ternary after the Super Admin bootstrap, or an
    // object literal in a create/upsert.)
    expect(src).not.toMatch(/"SUPER_ADMIN" : "STAFF"/);
    expect(src).not.toMatch(/create: \{[^}]*role: "STAFF"/);
    expect(src).not.toMatch(/role \?\? "STAFF"/);
  });

  it("the known owners and first-admin bootstrap still become Super Admin", () => {
    // A separate, deliberate rule — this change must not have removed it.
    for (const file of PROVISIONING_PATHS.slice(0, 3)) {
      expect(code(file), file).toMatch(/shouldBeSuperAdmin \? "SUPER_ADMIN" : DEFAULT_PROVISIONED_ROLE/);
    }
  });
});
