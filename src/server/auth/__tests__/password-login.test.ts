import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isPasswordLoginAllowed, PASSWORD_LOGIN_ROLES } from "../password-login";
import { DEFAULT_ROLE_PERMISSIONS, ROLES, PULSE_GUEST_PERMISSIONS, PERMISSION_PRESETS, isValidPermissionId } from "@/types/auth";

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

describe("a guest can change their own password", () => {
  const routeSource = readFileSync(
    join(ROOT, "src/app/api/account/password/route.ts"),
    "utf8",
  );
  const panel = readFileSync(join(ROOT, "src/components/account-settings-panel.tsx"), "utf8");

  it("verifies the CURRENT password before setting a new one", () => {
    // Being signed in is not proof of knowing the password — a borrowed laptop is
    // enough. Without this an attacker with a session silently locks the owner out.
    expect(routeSource).toMatch(/bcrypt\.compare\(currentPassword/);
    expect(routeSource).toMatch(/not your current password/i);
  });

  it("reads the role from the DATABASE, not the session token", () => {
    // A JWT is minted at sign-in and outlives a role change, so a member demoted
    // since theirs was issued would still be carrying the old one.
    expect(routeSource).toMatch(/prisma\.user\.findUnique/);
    expect(routeSource).toMatch(/isPasswordLoginAllowed\(user\.memberships\[0\]\?\.role\)/);
    expect(
      /isPasswordLoginAllowed\(session/.test(routeSource),
      "the role must not come from the session",
    ).toBe(false);
  });

  it("refuses a role that cannot sign in with a password at all", () => {
    // Writing a hash for a Google-only account is dead weight that quietly widens
    // what /api/auth/forgot-password can reach.
    expect(routeSource).toMatch(/signs in with Google/);
  });

  it("only shows the field to an account that can use it", () => {
    expect(panel).toMatch(/isPasswordLoginAllowed\(profile\?\.role\)/);
  });

  it("keeps bcrypt and Prisma out of the client bundle", () => {
    // The predicate is pure and lives in types/auth.ts for exactly this reason.
    // Importing it from the server module would drag Prisma into the browser.
    expect(panel).toMatch(/isPasswordLoginAllowed[\s\S]*?from "@\/types\/auth"/);
    expect(
      /from "@\/server\/auth\/password-login"/.test(panel),
      "the client component must not import the server module",
    ).toBe(false);
  });

  it("uses the same 8-character floor as every other password route", () => {
    for (const f of [
      "src/app/api/team/route.ts",
      "src/app/api/team/[userId]/reset-password/route.ts",
    ]) {
      expect(readFileSync(join(ROOT, f), "utf8"), f).toMatch(/min\(8/);
    }
    expect(routeSource).toMatch(/const MIN_PASSWORD_LENGTH = 8/);
    // And it must NOT be exported — a Next route file may only export its handlers,
    // and the failure is invisible to tsc.
    expect(
      /export const MIN_PASSWORD_LENGTH/.test(routeSource),
      "a route file must not export a non-handler const — it fails `next build`",
    ).toBe(false);
  });
});

describe("a guest only sees what they were given", () => {
  const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

  it("gates the workspace-wide Pulse reads server-side, not just in the UI", () => {
    // These describe GITWORK — every scan's average health, and the email address of
    // every lead the public scanner captured. `/api/pulse/leads` enforced nothing at
    // all beyond a session, which was the same thing until GUEST existed.
    for (const f of ["src/app/api/pulse/leads/route.ts", "src/app/api/pulse/stats/route.ts"]) {
      expect(read(f), f).toMatch(/assertInternal\(await getEffectiveUserOrNull\(request\)\)/);
    }
  });

  it("keeps the client-side hide honest about what it is", () => {
    // If this ever reads as a security boundary someone will use it as one.
    const src = read("src/components/internal-only.tsx");
    expect(src).toMatch(/NOT a security boundary/);
    // Renders nothing while loading — a guest flashing an internal panel is the
    // failure that matters, a colleague missing one for a moment is not.
    expect(src).toMatch(/isPending\) return null/);
  });

  it("does not route a guest to the internal standup dashboard", () => {
    const src = read("src/components/app-overview.tsx");
    const guestAt = src.indexOf("if (isExternal) {");
    const devAt = src.indexOf("if (isDeveloper) {");
    expect(guestAt, "the guest branch is missing").toBeGreaterThan(-1);
    expect(
      guestAt < devAt,
      "a guest satisfies isDeveloper, so the guest branch must be tested FIRST",
    ).toBe(true);
  });

  it("hides the Gmail and Calendar tiles from an account with no Google", () => {
    const src = read("src/components/app-overview.tsx");
    expect(src).toMatch(/GmailWidget[^\n]*requires: "google"/);
    expect(src).toMatch(/CalendarWidget[^\n]*requires: "google"/);
    expect(src).toMatch(/g\.requires !== "google" \|\| !isExternal/);
  });

  it("hides On Your Desk from a guest", () => {
    expect(read("src/components/app-shell.tsx")).toMatch(
      /isExternalRole\(account\.data\?\.role\) \? null : <DeskDrawer/,
    );
  });
});

describe("a guest owns their own name", () => {
  const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

  it("puts name and email on the token, so every surface has them", () => {
    // Google fills these in itself; a credentials sign-in does not, which is why the
    // sidebar showed a "?" and the profile page showed two em-dashes.
    const src = read("src/auth.ts");
    expect(src).toMatch(/token\.name = dbUser\.name/);
    expect(src).toMatch(/token\.email = dbUser\.email/);
  });

  it("lets a password account edit its name, and refuses a Google one", () => {
    const src = read("src/app/api/account/route.ts");
    expect(src).toMatch(/isPasswordLoginAllowed\(membership\?\.role\)/);
    expect(src).toMatch(/managed by Google Workspace/);
  });

  it("stops the GET sync writing the old name back over an edit", () => {
    // A JWT carries whatever name it was minted with, so re-syncing from the session
    // would revert a rename on the very next request.
    expect(read("src/app/api/account/route.ts")).toMatch(
      /const ownsOwnName = isPasswordLoginAllowed[\s\S]{0,120}if \(!ownsOwnName && sessionName/,
    );
  });

  it("does not tell a guest their name comes from Google", () => {
    const src = read("src/components/account-settings-panel.tsx");
    expect(src).toMatch(/ownsOwnName\s*\n?\s*\?/);
    expect(src).toMatch(/session\?\.user\?\.name \|\| profile\?\.name/);
  });
});

describe("a guest can actually USE Pulse", () => {
  it("the preset grants all three permissions a scan needs", () => {
    // The trap: granting the `pulse` MODULE alone renders the page and a New scan
    // button that 403s, because POST /api/pulse/scans asserts pulse.manage AND
    // canGenerateAi. Anyone setting a guest up would reasonably grant one and stop.
    expect([...PULSE_GUEST_PERMISSIONS].sort()).toEqual(
      ["ai.generate", "pulse", "pulse.manage"].sort(),
    );
  });

  it("every id in the preset is a real permission", () => {
    // A typo here is silent: the grant is stored and simply never matches.
    for (const id of PULSE_GUEST_PERMISSIONS) {
      expect(isValidPermissionId(id), id).toBe(true);
    }
  });

  it("is offered as a GUEST preset, so it cannot be applied to a staff role", () => {
    const preset = PERMISSION_PRESETS.find((p) => p.id === "pulse-guest");
    expect(preset).toBeTruthy();
    expect(preset!.role).toBe("GUEST");
    expect(preset!.permissions).toEqual(PULSE_GUEST_PERMISSIONS);
  });

  it("says out loud that it spends tokens", () => {
    // ai.generate is admin-gated everywhere else because it costs money. Handing it to
    // someone outside the company is a deliberate trade, not an implementation detail.
    const preset = PERMISSION_PRESETS.find((p) => p.id === "pulse-guest");
    expect(preset!.description).toMatch(/token/i);
  });

  it("grants nothing beyond Pulse", () => {
    const beyond = PULSE_GUEST_PERMISSIONS.filter(
      (id) => id !== "ai.generate" && !id.startsWith("pulse"),
    );
    expect(beyond, "a Pulse guest preset must not reach another product").toEqual([]);
  });
});
