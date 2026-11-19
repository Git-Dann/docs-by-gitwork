import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import {
  profileCompleteness,
  readAchievements,
  readLinks,
  safeProfileUrl,
  slugProblem,
  suggestSlug,
} from "@/lib/public-profile";
import { PublicProfileView } from "@/components/profile/public-profile-view";
import { DEMO_PUBLIC_PROFILE } from "@/lib/demo/demo-public-profile";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("public profile rules", () => {
  it("handles: lower-case, numbers and single hyphens, 3–40, not reserved", () => {
    expect(slugProblem("priya-shah")).toBeNull();
    expect(slugProblem("ab")).toMatch(/At least/);
    expect(slugProblem("Priya")).toMatch(/Lower-case/);
    expect(slugProblem("priya--shah")).toMatch(/Lower-case/);
    expect(slugProblem("admin")).toMatch(/reserved/);
  });

  it("suggests a handle from a name, accents and all", () => {
    expect(suggestSlug("Siân Woolridge-Jones")).toBe("sian-woolridge-jones");
    expect(slugProblem(suggestSlug("Dan Lindsay"))).toBeNull();
  });

  it("links are http(s) only, because they're drawn as <a href>", () => {
    expect(safeProfileUrl("linkedin.com/in/x")).toBe("https://linkedin.com/in/x");
    expect(safeProfileUrl("javascript:alert(1)")).toBeNull();
    expect(safeProfileUrl("data:text/html,x")).toBeNull();
    expect(readLinks([{ label: "Bad", url: "javascript:alert(1)" }, { label: "Site", url: "example.com" }])).toEqual([
      { label: "Site", url: "https://example.com/" },
    ]);
  });

  it("stored lists are read defensively and capped", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ title: `A${i}`, year: 2020 }));
    expect(readAchievements(many)).toHaveLength(12);
    expect(readAchievements([{ title: "" }, { title: "Ok", year: 1800 }, "junk"])).toEqual([{ title: "Ok", year: null, detail: null }]);
    expect(readAchievements("nope")).toEqual([]);
  });

  it("completeness names what's missing", () => {
    const none = { avatar: false, headline: false, bio: false, summary: false, location: false, achievements: false, links: false, skills: false };
    expect(profileCompleteness(none).percent).toBe(0);
    const all = Object.fromEntries(Object.keys(none).map((k) => [k, true])) as typeof none;
    expect(profileCompleteness(all)).toEqual({ percent: 100, missing: [] });
    expect(profileCompleteness({ ...all, bio: false }).missing).toEqual(["a short bio"]);
  });
});

describe("public profile privacy (§139)", () => {
  const server = read("src/server/public-profile.ts");
  const select = server.slice(server.indexOf("const SELECT = {"), server.indexOf("} as const satisfies Prisma.CandidateSelect"));

  it("the public read never selects rates, contact, HR or client fields", () => {
    for (const field of ["hourlyRate", "email", "placements", "notes", "endDate", "probationEndsOn", "noticePeriodWeeks", "employmentType", "supplierId", "cvUrl", "rateCardPerson"]) {
      expect(select, field).not.toMatch(new RegExp(`\\b${field}:`));
    }
  });

  it("a page shows only while public, not archived, and the login isn't archived", () => {
    expect(server).toMatch(/r\.profilePublic && !r\.archivedAt && \(!r\.member \|\| !r\.member\.archivedAt\)/);
    expect(server).toContain("where: { profileSlug: slug, profilePublic: true }");
  });

  it("switching a page on is only ever the person's own edit", () => {
    expect(read("src/app/api/staff/me/public-profile/route.ts")).toContain("user.membershipId");
    const unpublish = read("src/app/api/staff/[id]/public-profile/route.ts");
    expect(unpublish).not.toMatch(/export async function (PATCH|POST|PUT)/);
    expect(server.slice(server.indexOf("export async function unpublishProfile"))).toContain("profilePublic: false");
  });

  it("the photo route is public only under /api/u, segment-anchored", () => {
    expect(read("src/middleware.ts")).toMatch(/"\/api\/u",/);
    expect(read("src/app/api/u/[slug]/avatar/route.ts")).toContain("publicAvatarUserId(slug)");
  });

  it("profiles stay out of search engines", () => {
    expect(read("src/app/robots.ts")).toContain('"/u/"');
    expect(read("src/app/u/[slug]/page.tsx")).toContain("robots: { index: false, follow: false }");
  });
});

describe("the page", () => {
  const html = renderToStaticMarkup(React.createElement(PublicProfileView, { profile: DEMO_PUBLIC_PROFILE }));

  it("draws the person, their links, achievements and skills", () => {
    for (const s of ["Priya Shah", "Senior Product Engineer", "Manchester, UK", "LinkedIn", "Achievements", "TypeScript", "Profile on Foundry"]) {
      expect(html).toContain(s);
    }
  });

  it("opens links safely in a new tab", () => {
    expect(html).toMatch(/target="_blank" rel="noopener noreferrer me"/);
  });

  it("leaves out empty sections", () => {
    const bare = renderToStaticMarkup(
      React.createElement(PublicProfileView, { profile: { ...DEMO_PUBLIC_PROFILE, summary: null, achievements: [], skills: [] } }),
    );
    expect(bare).not.toContain(">About<");
    expect(bare).not.toContain(">Achievements<");
  });
});

describe("share and save contact", () => {
  it("the vCard escapes values and never carries email or phone", async () => {
    const { profileVCard } = await import("@/components/profile/profile-share-actions");
    const card = profileVCard({ name: "Priya Shah", headline: "Engineer, Platform; Tools", company: "Gitwork", links: [{ label: "LinkedIn", url: "https://linkedin.com/in/x" }] }, "https://foundry.gitwork.co.uk/u/priya");
    expect(card).toContain("N:Shah;Priya;;;");
    expect(card).toContain("TITLE:Engineer\\, Platform\\; Tools");
    expect(card).toContain("URL:https://foundry.gitwork.co.uk/u/priya");
    expect(card).not.toMatch(/EMAIL|TEL/);
    expect(card.split("\r\n")[0]).toBe("BEGIN:VCARD");
  });

  it("the page offers Share and Save contact", () => {
    const html = renderToStaticMarkup(React.createElement(PublicProfileView, { profile: DEMO_PUBLIC_PROFILE }));
    expect(html).toContain("Share profile");
    expect(html).toContain("Save contact");
  });
});
