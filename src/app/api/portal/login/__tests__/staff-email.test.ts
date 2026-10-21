/**
 * A Gitwork team MEMBER typed into the CLIENT portal form must never be logged into a
 * client's wiki. The front door leads with that form, so a lapsed staff session plus a
 * remembered test login kept dropping a team member onto one client's wiki.
 *
 * ⚠️ The test is membership, not the domain — see `isGitworkTeamLogin`. Refusing the
 * whole domain also refused a `ClientWikiUser` deliberately created on it, which left a
 * real account (`claude@gitwork.co.uk`, made to test the client portal) unable to sign in
 * anywhere while the app reported it as a wiki that had never been shared.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const login = vi.hoisted(() => vi.fn());
const isTeam = vi.hoisted(() => vi.fn());
vi.mock("@/server/wiki-access", () => ({
  loginPortalUser: login,
  isGitworkTeamLogin: isTeam,
  WIKI_ACCESS_COOKIE_MAX_AGE: 60,
}));

import { POST } from "../route";
import { isGitworkStaffEmail } from "@/lib/staff-email";

function req(email: string) {
  return new NextRequest("http://localhost/api/portal/login", {
    method: "POST",
    body: JSON.stringify({ email, password: "pw" }),
  });
}

beforeEach(() => {
  login.mockReset();
  isTeam.mockReset();
  isTeam.mockResolvedValue(false);
  login.mockResolvedValue([
    { clientName: "Speakify", slug: "speakify", url: "/wiki/speakify/t", cookieName: "wiki_x", cookieValue: "v" },
  ]);
});

describe("portal login with a Gitwork address", () => {
  it("sends a team MEMBER to the team sign-in and sets no client cookie", async () => {
    isTeam.mockResolvedValue(true);
    const res = await POST(req("  Harry@Gitwork.co.uk "));
    const body = await res.json();
    expect(body.data ?? body).toMatchObject({ staff: true, wikis: [] });
    expect(login).not.toHaveBeenCalled();
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  /**
   * ⚠️ THE ONE THAT WAS BROKEN. Same domain, not a member — a client wiki
   * account, and it must take the ordinary client path and get its cookie.
   */
  it("logs in a Gitwork-domain address that is NOT a team member", async () => {
    isTeam.mockResolvedValue(false);
    const res = await POST(req("claude@gitwork.co.uk"));
    const body = await res.json();
    expect((body.data ?? body).wikis).toHaveLength(1);
    expect(res.headers.get("set-cookie")).toContain("wiki_x=");
  });

  it("still logs a client in to their wiki", async () => {
    const res = await POST(req("ayesha@speakify.test"));
    const body = await res.json();
    expect((body.data ?? body).wikis).toHaveLength(1);
    expect(res.headers.get("set-cookie")).toContain("wiki_x=");
  });
});

describe("isGitworkStaffEmail", () => {
  it("matches the team domain only", () => {
    expect(isGitworkStaffEmail("dan@gitwork.co.uk")).toBe(true);
    expect(isGitworkStaffEmail("dan@notgitwork.co.uk")).toBe(false);
    expect(isGitworkStaffEmail("gitwork.co.uk@client.com")).toBe(false);
    expect(isGitworkStaffEmail(null)).toBe(false);
  });
});
