import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Foundry has THREE ways to turn a Google identity into access — the web jwt
 * callback, the iOS token exchange and the desktop handoff — and each one used to
 * carry its own copy of "find or create the user, take `membership?.role ??
 * "STAFF"`". That duplicated fallback is what let a removed person sign straight
 * back in: they had a User row and no membership, and every path minted a STAFF
 * session or token for them anyway.
 *
 * The third path (desktop) was found only by sweeping the code for these queries.
 * So this does not list the paths by hand: it finds every file that signs a token
 * or provisions a membership on sign-in and requires each to check the member is
 * active first.
 */

const ROOT = join(process.cwd(), "src");
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const signers = walk(ROOT).filter((f) => {
  const src = readFileSync(f, "utf8");
  return /signMobileToken\(/.test(src) && !f.endsWith("mobile-jwt.ts");
});

describe("every sign-in path refuses a removed or archived member", () => {
  it("finds the token-minting paths, so a broken filter cannot pass silently", () => {
    const names = signers.map((f) => relative(process.cwd(), f));
    expect(names).toEqual(
      expect.arrayContaining([
        "src/app/api/auth/mobile-callback/route.ts",
        "src/app/api/auth/desktop/start/route.ts",
        "src/app/api/auth/mobile-password/route.ts",
      ]),
    );
  });

  // A path that starts from a Google identity finds or creates the user, so it must refuse
  // an existing user with no active membership before it creates or promotes anything.
  const googleSigners = signers.filter((f) => !/verifyPassword\(/.test(readFileSync(f, "utf8")));
  // A path that starts from a password never creates anyone: verifyPassword is the gate,
  // and the membership the token names must be re-read and refused before signing.
  const passwordSigners = signers.filter((f) => /verifyPassword\(/.test(readFileSync(f, "utf8")));

  it.each(googleSigners.map((f) => [relative(process.cwd(), f), f]))(
    "%s checks the member is active before minting",
    (_name, file) => {
      const src = readFileSync(file as string, "utf8");
      // findHomeMembership only ever returns an ACTIVE membership (home-membership.ts).
      expect(src).toMatch(/findHomeMembership\(/);
      // The check must come BEFORE the token is signed, not after.
      expect(src.indexOf("findHomeMembership(")).toBeLessThan(src.indexOf("signMobileToken("));
      // And the refusal itself, before anything is created or promoted.
      expect(src).toMatch(/if \(dbUser && !\(await findHomeMembership\(/);
    },
  );

  it("finds the password path, so the split above cannot drop it silently", () => {
    expect(passwordSigners.map((f) => relative(process.cwd(), f))).toContain(
      "src/app/api/auth/mobile-password/route.ts",
    );
  });

  it.each(passwordSigners.map((f) => [relative(process.cwd(), f), f]))(
    "%s verifies the password and refuses an inactive or disallowed member before minting",
    (_name, file) => {
      const src = readFileSync(file as string, "utf8");
      const sign = src.indexOf("signMobileToken(");
      // The password is checked first, and a failure returns before anything else.
      expect(src.indexOf("verifyPassword(")).toBeGreaterThan(-1);
      expect(src.indexOf("verifyPassword(")).toBeLessThan(sign);
      expect(src).toMatch(/if \(!result\.ok\) return /);
      // The membership the token names is the ACTIVE one, re-read and refused before signing.
      const membership = src.indexOf("await findHomeMembership(");
      expect(membership).toBeGreaterThan(-1);
      expect(membership).toBeLessThan(sign);
      expect(src).toMatch(
        /if \(!membership \|\| !isPasswordLoginAllowed\(membership\.role, membership\.workspace\.slug\)\)/,
      );
      // ⚠️ A password never creates or promotes anyone.
      expect(src).not.toMatch(/\.create\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/SUPER_ADMIN/);
    },
  );

  it("the web sign-in refuses in the signIn callback, before any provisioning runs", () => {
    const src = readFileSync(join(process.cwd(), "src/auth.ts"), "utf8");
    const signIn = src.slice(src.indexOf("async signIn("), src.indexOf("async jwt("));
    expect(signIn).toMatch(/refusedMembership\(/);
    // A User with no membership is refused, not re-provisioned.
    const helper = src.slice(src.indexOf("async function refusedMembership"));
    expect(helper.slice(0, 900)).toMatch(/return !\(await findHomeMembership\(existing\.id\)\);/);
  });

  it("a live web session is revalidated and cleared for an archived member", () => {
    const src = readFileSync(join(process.cwd(), "src/auth.ts"), "utf8");
    const jwt = src.slice(src.indexOf("async jwt("));
    const branch = jwt.slice(0, jwt.indexOf("// On first sign-in"));
    // null from the jwt callback is what makes Auth.js clear the session cookie.
    expect(branch).toMatch(/const membership = await findHomeMembership\(/);
    expect(branch).toMatch(/if \(!membership\) return null;/);
  });

  it("a live session picks up a role change within the recheck window", () => {
    // Otherwise a role changed in the Team table would not reach page access until
    // the person next signed in — up to 30 days later.
    const src = readFileSync(join(process.cwd(), "src/auth.ts"), "utf8");
    const jwt = src.slice(src.indexOf("async jwt("));
    const branch = jwt.slice(0, jwt.indexOf("// On first sign-in"));
    expect(branch).toMatch(/token\.role = membership\.role;/);
    expect(branch).toMatch(/token\.permissions = /);
  });

  it("an archived guest is refused by the password path", () => {
    const src = readFileSync(join(process.cwd(), "src/server/auth/password-login.ts"), "utf8");
    expect(src).toMatch(/const membership = await findHomeMembership\(user\.id\);\n\s*if \(!membership\) return \{ ok: false \};/);
  });
});
