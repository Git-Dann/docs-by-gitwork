import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A guest must be able to GET to the sign-in form from the site's front door.
 *
 * ── Why this is a test and not a note ────────────────────────────────────────
 * `/` redirects to `/portal/login`, which is the CLIENT portal — a different
 * password system entirely (it authenticates per-client wiki accounts). Its only
 * way out was a link that called `signIn("google")` directly, so an invited guest
 * following it was thrown at Google, which cannot work for them: they have no
 * Gitwork account and the sign-in callback refuses any non-@gitwork.co.uk address.
 *
 * So the guest form existed, worked, and was unreachable from the front door — the
 * §40.1 trap, and it cost a real person a long detour through the wrong login.
 */

const ROOT = join(__dirname, "..", "..", "..");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

/**
 * Source with comments removed.
 *
 * The first cut of the test below failed against its own fix, because the comment
 * explaining "do NOT call signIn(\"google\")" contains the very string it forbids.
 * Exactly the false positive Pulse keeps hitting when a rule matches prose rather than
 * code (CLAUDE.md §37.6) — so strip the prose before asserting about the code.
 */
const code = (f: string) =>
  read(f)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\/.*$/gm, "");

describe("the front door reaches the guest form", () => {
  const portal = read("src/components/portal/portal-login-form.tsx");
  const portalCode = code("src/components/portal/portal-login-form.tsx");

  it("sends a signed-out visitor to /login, not straight to Google", () => {
    expect(portalCode).toMatch(/window\.location\.assign\("\/login"\)/);
    expect(
      /signIn\("google"/.test(portalCode),
      "the portal must not call Google directly — /login offers both methods",
    ).toBe(false);
  });

  it("says the link is for guests too", () => {
    // "Gitwork team? Sign in" actively tells an invited guest it is not for them.
    expect(portal).toMatch(/invited guest\? Sign in/i);
  });

  it("still sends an already-authed staff member to the app", () => {
    expect(portal).toMatch(/window\.location\.assign\("\/app"\)/);
  });
});

describe("/login offers the guest form", () => {
  const login = read("src/app/login/page.tsx");

  it("renders the email-and-password entry point", () => {
    expect(login).toMatch(/Invited guest\? Sign in with an email and password/);
  });

  it("does not hardcode a check count that will drift", () => {
    // It read "500+" while the registry held 1,685.
    expect(login).toMatch(/ADVERTISED_CHECK_COUNT_LABEL/);
    expect(/\d00\+ automated/.test(login), "a hardcoded count goes stale").toBe(false);
  });
});
