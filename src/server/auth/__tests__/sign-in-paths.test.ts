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
      ]),
    );
  });

  it.each(signers.map((f) => [relative(process.cwd(), f), f]))(
    "%s checks the member is active before minting",
    (_name, file) => {
      const src = readFileSync(file as string, "utf8");
      expect(src).toMatch(/isActiveMember\(/);
      // The check must come BEFORE the token is signed, not after.
      expect(src.indexOf("isActiveMember(")).toBeLessThan(src.indexOf("signMobileToken("));
    },
  );

  it("the web sign-in refuses in the signIn callback, before any provisioning runs", () => {
    const src = readFileSync(join(process.cwd(), "src/auth.ts"), "utf8");
    const signIn = src.slice(src.indexOf("async signIn("), src.indexOf("async jwt("));
    expect(signIn).toMatch(/refusedMembership\(/);
    // A User with no membership is refused, not re-provisioned.
    const helper = src.slice(src.indexOf("async function refusedMembership"));
    expect(helper.slice(0, 900)).toMatch(/return !membership \|\| !isActiveMember\(membership\)/);
  });

  it("a live web session is revalidated and cleared for an archived member", () => {
    const src = readFileSync(join(process.cwd(), "src/auth.ts"), "utf8");
    const jwt = src.slice(src.indexOf("async jwt("));
    const branch = jwt.slice(0, jwt.indexOf("// On first sign-in"));
    // null from the jwt callback is what makes Auth.js clear the session cookie.
    expect(branch).toMatch(/if \(!membership \|\| !isActiveMember\(membership\)\) return null;/);
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
    expect(src).toMatch(/archivedAt\) return \{ ok: false \}/);
  });
});
