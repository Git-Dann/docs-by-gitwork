import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Who the client portal refuses.
 *
 * ⚠️ The rule is MEMBERSHIP, not the domain, and the difference is a real
 * account that could not sign in anywhere. `claude@gitwork.co.uk` was created
 * as a `ClientWikiUser` to test the client portal; the login route refused it
 * because it ends @gitwork.co.uk, and the app reported that refusal as a wiki
 * that had never been shared. By domain the two cases are identical, so only a
 * membership lookup can tell them apart.
 */

const findFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { workspaceMember: { findFirst: (...args: unknown[]) => findFirst(...args) } },
}));

const { isGitworkTeamLogin } = await import("../wiki-access");

beforeEach(() => findFirst.mockReset());

describe("isGitworkTeamLogin", () => {
  it("refuses a Gitwork address that IS a workspace member", async () => {
    findFirst.mockResolvedValue({ id: "m1" });
    expect(await isGitworkTeamLogin("dan@gitwork.co.uk")).toBe(true);
  });

  /**
   * ⚠️ THE ONE THAT WAS BROKEN. Same domain, no membership — a client wiki
   * account, and it must take the ordinary client path.
   */
  it("allows a Gitwork address that is NOT a workspace member", async () => {
    findFirst.mockResolvedValue(null);
    expect(await isGitworkTeamLogin("claude@gitwork.co.uk")).toBe(false);
  });

  /**
   * ⚠️ No database call for an address that cannot be staff anyway. A client's
   * own sign-in is the common case by far, and it must not pay for a lookup
   * whose answer is fixed.
   */
  it("does not even look up a non-Gitwork address", async () => {
    expect(await isGitworkTeamLogin("someone@example.com")).toBe(false);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("is case- and whitespace-insensitive, because people type addresses", async () => {
    findFirst.mockResolvedValue({ id: "m1" });
    expect(await isGitworkTeamLogin("  DAN@Gitwork.CO.UK ")).toBe(true);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user: { email: "dan@gitwork.co.uk" } } }),
    );
  });

  /**
   * ⚠️ An ARCHIVED member still counts as a team address: they were issued one,
   * and treating them as staff is the conservative direction. It costs them
   * nothing either way — signing in still needs a matching `ClientWikiUser` and
   * its password — so the query deliberately does not filter on `archivedAt`.
   */
  it("counts any membership, archived included", async () => {
    findFirst.mockResolvedValue({ id: "archived-member" });
    expect(await isGitworkTeamLogin("leaver@gitwork.co.uk")).toBe(true);
    const where = findFirst.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(where.where).not.toHaveProperty("archivedAt");
  });
});
