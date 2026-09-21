import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isPasswordLoginAllowed, PASSWORD_LOGIN_ROLES } from "../password-login";
import { DEFAULT_ROLE_PERMISSIONS, ROLES } from "@/types/auth";

/**
 * Password sign-in is the first way into Foundry that is not a Gitwork Google account,
 * so the rules below are the ones holding the door.
 *
 * ── The one that matters ─────────────────────────────────────────────────────
 * `POST /api/auth/forgot-password` is PUBLIC and sets ANY user's password on
 * presentation of the shared `INITIAL_ADMIN_PASSWORD` recovery key. That was harmless
 * while nothing could sign in with a password. Now that something can, the only thing
 * stopping it being a Super Admin takeover is that a password authenticates a GUEST and
 * nothing else. These tests exist so that pairing cannot be undone by accident.
 */

const ROOT = join(__dirname, "..", "..", "..", "..");
const authSource = readFileSync(join(ROOT, "src/auth.ts"), "utf8");

describe("only a guest can sign in with a password", () => {
  it("allows GUEST and refuses every other role", () => {
    expect(isPasswordLoginAllowed("GUEST")).toBe(true);
    for (const role of ["SUPER_ADMIN", "ADMIN", "STAFF", "DEVELOPER"]) {
      expect(
        isPasswordLoginAllowed(role),
        `${role} must not be able to sign in with a password — /api/auth/forgot-password ` +
          `can set any user's password from outside with a shared key, so a password that ` +
          `authenticates an admin is an account takeover.`,
      ).toBe(false);
    }
  });

  it("refuses an absent or unknown role", () => {
    expect(isPasswordLoginAllowed(null)).toBe(false);
    expect(isPasswordLoginAllowed(undefined)).toBe(false);
    expect(isPasswordLoginAllowed("")).toBe(false);
    expect(isPasswordLoginAllowed("OWNER")).toBe(false);
  });

  it("names exactly one role, so widening it is a deliberate edit", () => {
    expect(PASSWORD_LOGIN_ROLES).toEqual(["GUEST"]);
  });
});

describe("the sign-in gate is written per provider", () => {
  it("allows Google only for @gitwork.co.uk", () => {
    expect(authSource).toMatch(/provider === "google"/);
    expect(authSource).toMatch(/endsWith\("@gitwork\.co\.uk"\)/);
  });

  it("refuses an unrecognised provider instead of defaulting to allowed", () => {
    // The dangerous phrasing is "if not credentials, require the domain", because a
    // provider added later then falls through as permitted. The callback must end in a
    // refusal.
    const gate = authSource.slice(
      authSource.indexOf("async signIn("),
      authSource.indexOf("async jwt("),
    );
    expect(gate).toContain("return false;");
    expect(
      gate.trimEnd().endsWith("},") && /return false;\s*\n\s*},\s*$/.test(gate.trimEnd()),
      "the signIn callback must fall through to `return false`",
    ).toBe(true);
  });
});

describe("a password sign-in cannot gain privileges", () => {
  const jwt = authSource.slice(authSource.indexOf("async jwt("));

  it("never runs the Super-Admin bootstrap", () => {
    // `adminOrAboveCount === 0` promotes whoever signs in first. A guest reaching that
    // would be handed the workspace.
    expect(jwt).toMatch(/isPasswordSignIn/);
    expect(jwt).toMatch(/!isPasswordSignIn && \(isKnownSuperAdmin/);
  });

  it("never auto-provisions a member", () => {
    // The provisioning branch creates a STAFF membership. A password sign-in must bail
    // before it rather than mint one.
    const bail = jwt.indexOf("if (!dbUser && isPasswordSignIn) return token;");
    const provision = jwt.indexOf("if (!dbUser) {");
    expect(bail, "the password bail-out is missing").toBeGreaterThan(-1);
    expect(bail, "the bail-out must come BEFORE the provisioning branch").toBeLessThan(provision);
  });
});

describe("the GUEST role", () => {
  it("exists, is configurable, and ranks below every other role", () => {
    const guest = ROLES.find((r) => r.id === "GUEST");
    expect(guest).toBeTruthy();
    expect(guest!.configurable).toBe(true);
    for (const other of ROLES.filter((r) => r.id !== "GUEST")) {
      expect(guest!.rank).toBeLessThan(other.rank);
    }
  });

  it("grants NOTHING by default", () => {
    // The whole point: forgetting to restrict a guest leaves them with nothing. Every
    // other role's default is a list of things it can reach.
    expect(DEFAULT_ROLE_PERMISSIONS.GUEST).toEqual([]);
    for (const role of ["ADMIN", "STAFF", "DEVELOPER"] as const) {
      expect(DEFAULT_ROLE_PERMISSIONS[role].length).toBeGreaterThan(0);
    }
  });
});
