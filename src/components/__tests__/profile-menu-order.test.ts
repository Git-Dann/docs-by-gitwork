import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The order of the profile flyout, and the guard on Sign out.
 *
 * Dan's call (Sep 2026): View as at the top, Settings at the bottom with Sign out
 * grouped beside it. Sign out then sits directly under a link people click often,
 * so it takes a confirmation — signing out mid-task loses unsaved work and costs
 * a Google round trip to get back in.
 *
 * Asserted on source order because the flyout's contents are conditional (View as
 * is Super-Admin-only) and there is no way to click through it here — the project
 * has no @testing-library/react.
 */

const src = readFileSync(
  join(__dirname, "..", "..", "..", "src/components/app-shell.tsx"),
  "utf8",
);

/** Where each landmark first appears inside the ProfileMenu component. */
function posAfterProfileMenu(needle: string): number {
  const start = src.indexOf("function ProfileMenu(");
  expect(start, "ProfileMenu not found").toBeGreaterThan(-1);
  const at = src.indexOf(needle, start);
  expect(at, `"${needle}" not found in ProfileMenu`).toBeGreaterThan(-1);
  return at;
}

describe("profile flyout order", () => {
  it("runs View as → Theme → Settings → Sign out", () => {
    const viewAs = posAfterProfileMenu("View as —");
    const theme = posAfterProfileMenu("Appearance — quick Light");
    const settings = posAfterProfileMenu("/app/settings/account");
    const signOut = posAfterProfileMenu("Sign out\n");
    expect(viewAs).toBeLessThan(theme);
    expect(theme).toBeLessThan(settings);
    expect(settings).toBeLessThan(signOut);
  });

  it("groups Settings and Sign out in one block at the end", () => {
    const settings = posAfterProfileMenu("/app/settings/account");
    const group = posAfterProfileMenu("Account group, last");
    expect(group).toBeLessThan(settings);
  });
});

describe("sign out confirmation", () => {
  it("does not sign out straight from the menu click", () => {
    // The old row called signOut() inline; one slip below Settings and you're out.
    const menuClick = src.slice(posAfterProfileMenu("Account group, last"));
    const button = menuClick.slice(0, menuClick.indexOf("</div>"));
    expect(button).toContain("setConfirmSignOut(true)");
    expect(button).not.toContain("signOut()");
  });

  it("asks first, through the house Modal", () => {
    expect(src).toContain('title="Sign out?"');
    expect(src).toMatch(/<Modal[\s\S]{0,200}open=\{confirmSignOut\}/);
    // The real sign-out lives in the dialog, not the menu.
    expect(src).toMatch(/confirmSignOut[\s\S]*?signOut\(\)/);
  });

  it("mounts the dialog outside the dropdown, or dismissing the menu would kill it", () => {
    const dropdownEnd = src.indexOf(") : null}", posAfterProfileMenu("Account group, last"));
    const modalAt = src.indexOf("<Modal", posAfterProfileMenu("Account group, last"));
    expect(modalAt).toBeGreaterThan(dropdownEnd);
  });
});
