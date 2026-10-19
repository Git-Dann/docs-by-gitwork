/**
 * A Gitwork team address typed into the CLIENT portal form must never be logged into a
 * client's wiki. The front door leads with that form, so a lapsed staff session plus a
 * remembered test login kept dropping a team member onto one client's wiki.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const login = vi.hoisted(() => vi.fn());
vi.mock("@/server/wiki-access", () => ({
  loginPortalUser: login,
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
  login.mockResolvedValue([
    { clientName: "Speakify", slug: "speakify", url: "/wiki/speakify/t", cookieName: "wiki_x", cookieValue: "v" },
  ]);
});

describe("portal login with a Gitwork address", () => {
  it("sends a team address to the team sign-in and sets no client cookie", async () => {
    const res = await POST(req("  Harry@Gitwork.co.uk "));
    const body = await res.json();
    expect(body.data ?? body).toMatchObject({ staff: true, wikis: [] });
    expect(login).not.toHaveBeenCalled();
    expect(res.headers.get("set-cookie")).toBeNull();
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
