// @vitest-environment jsdom
/**
 * The org chart lays itself out by role (the admins are the managers; nobody keeps a list),
 * and a real reporting line, where one is set, wins over the default.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { buildOrgTree, orgTiers, type StaffPerson } from "@/lib/staff";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

import { OrgChart } from "../org-chart";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function person(id: string, name: string, role: StaffPerson["role"], managerRecordId: string | null = null): StaffPerson {
  return {
    key: `r:${id}`, memberId: role ? `m${id}` : null, recordId: id, name, email: null, avatarUrl: null, role, preferredName: null, pronouns: null,
    jobTitle: null, department: null, employmentType: null, startDate: null, managerRecordId, managerName: null,
    isDeveloper: false, primaryStack: null, currentClients: [], archivedAt: null,
  } as StaffPerson;
}

const team = [
  person("dan", "Dan", "SUPER_ADMIN"),
  person("harry", "Harry", "SUPER_ADMIN"),
  person("hassaan", "Hassaan", "ADMIN"),
  person("sian", "Sian", "STAFF"),
  person("ali", "Ali", "DEVELOPER"),
  person("kashan", "Kashan", "DEVELOPER", "hassaan"),
  person("jo", "Jo", null),
];

describe("tiers", () => {
  it("puts Super Admins on top, then Admins, then everyone else under their card heading", () => {
    const tiers = orgTiers(buildOrgTree(team));
    expect(tiers.map((t) => t.id)).toEqual(["leadership", "admins", "staff", "developers", "no-login"]);
    expect(tiers[0].nodes.map((n) => n.person.name)).toEqual(["Dan", "Harry"]);
    expect(tiers.find((t) => t.id === "developers")!.nodes.map((n) => n.person.name)).toEqual(["Ali"]);
  });

  it("a set manager wins: the report hangs under them, not in their role's tier", () => {
    const tiers = orgTiers(buildOrgTree(team));
    const admins = tiers.find((t) => t.id === "admins")!;
    expect(admins.nodes[0].reports.map((r) => r.person.name)).toEqual(["Kashan"]);
    expect(tiers.flatMap((t) => t.nodes).map((n) => n.person.name)).not.toContain("Kashan");
  });

  it("leaves out tiers nobody is in", () => {
    expect(orgTiers(buildOrgTree([person("a", "A", "DEVELOPER")])).map((t) => t.id)).toEqual(["developers"]);
    expect(orgTiers([])).toEqual([]);
  });
});

describe("rendering", () => {
  it("draws every person once, labels each tier with its count, and lines a set report", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    await act(async () => createRoot(host).render(<OrgChart tree={buildOrgTree(team)} basePath="/app/staff" subtitle={() => "Role"} />));
    for (const p of team) expect(host.querySelectorAll(`a[href="/app/staff/${p.recordId}"]`)).toHaveLength(1);
    expect(host.textContent).toContain("Leadership · 2");
    expect(host.textContent).toContain("Admins · 1");
    expect(host.querySelector(".org-tree")?.textContent).toContain("Kashan");
  });
});
