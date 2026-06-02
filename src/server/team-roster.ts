// Canonical Gitwork team roster — confirmed name → email → role mapping.
//
// Single source of truth for: (1) seeding Foundry User + WorkspaceMember accounts,
// (2) backfilling `Candidate.email` in the Code module, and (3) resolving ClickUp
// assignee names during the one-time import. Names carry aliases so the various
// spellings used across ClickUp / Code / the Google directory all resolve.
//
// Confirmed with Dan (June 2026). People deliberately NOT added (left unassigned
// in imports): Abdul/Abdur Rehman, Nasir, Muneeb, Waqas Ali, Gerry Carroll,
// Nate Holland, Khizar Hayyat Khan, Mohammad Aashir. Role/duplicate accounts skipped.

import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { PERMISSION_PRESETS, DEFAULT_STAFF_PERMISSIONS } from "@/types/auth";

export type RosterKind = "dev" | "staff" | "admin";

export type RosterEntry = {
  /** Canonical display name. */
  name: string;
  email: string;
  kind: RosterKind;
  /** Alternate spellings seen in ClickUp / Code / the directory. */
  aliases?: string[];
};

export const TEAM_ROSTER: RosterEntry[] = [
  // ── Developers (developer preset: Portal/Care/Pulse/Backstage, seeAllClients off) ──
  { name: "Shahab", email: "shahab@gitwork.co.uk", kind: "dev", aliases: ["shahab rasheed"] },
  { name: "Umer Fayyaz", email: "umer.fayyaz@gitwork.co.uk", kind: "dev", aliases: ["Umer"] },
  { name: "Liaquat", email: "liaquat.ali@gitwork.co.uk", kind: "dev", aliases: ["Liaquat Ali"] },
  { name: "Waqar", email: "waqar@gitwork.co.uk", kind: "dev", aliases: ["waqar ahmed khan", "Waqar Ahmed Khan"] },
  { name: "Fahad", email: "fahad@gitwork.co.uk", kind: "dev", aliases: ["Muhammad Fahad"] },
  { name: "Mustaqeem", email: "mustaqeem@gitwork.co.uk", kind: "dev", aliases: ["Mustaqeem bin Ahmed"] },
  { name: "Jamal", email: "sardar@gitwork.co.uk", kind: "dev", aliases: ["Sardar Jamal"] },
  { name: "Abdul Wasey", email: "abdul@gitwork.co.uk", kind: "dev", aliases: ["Wasey"] },
  { name: "Hamza Ahmed", email: "hamza.ahmad@gitwork.co.uk", kind: "dev", aliases: ["Hamza Ahmad"] },
  { name: "Ehtasham Razzaq", email: "ehtasham@gitwork.co.uk", kind: "dev", aliases: ["Ehtasham"] },
  // Atisham Ahmed removed from the roster — see demo-cleanup.ts for one-shot sweep.
  { name: "Mohammed Shahbaz", email: "mohammad.shahbaz@gitwork.co.uk", kind: "dev", aliases: ["Mohammad Shahbaz"] },
  { name: "Abdullah Irshad", email: "abdullah.irshad@gitwork.co.uk", kind: "dev", aliases: ["Abdullah irshad"] },
  { name: "Ali Sher", email: "ali.sher@gitwork.co.uk", kind: "dev" },
  { name: "Ali Asghar", email: "ali.asghar@gitwork.co.uk", kind: "dev", aliases: ["ali asghar"] },
  { name: "Roohullah", email: "roohullah.khan@gitwork.co.uk", kind: "dev", aliases: ["Roohullah Khan", "RoohUllah"] },
  { name: "Tahir", email: "muhammad@gitwork.co.uk", kind: "dev", aliases: ["Muhammad Tahir"] },
  { name: "Hassaan", email: "hassaan.binsajjad@gitwork.co.uk", kind: "dev", aliases: ["Hassaan Sajjad", "Hassaan Bin Sajjad"] },
  { name: "Kashan Fayyaz", email: "kashan.fayyaz@gitwork.co.uk", kind: "dev", aliases: ["Kashan"] },
  { name: "Muhammad Usman", email: "muhammad.usman@gitwork.co.uk", kind: "dev", aliases: ["Usman"] },
  { name: "Sibghat Ullah", email: "sibghatullah@gitwork.co.uk", kind: "dev", aliases: ["Sibghatullah", "Sibghatullah Sibghatullah"] },
  { name: "Syed Usama Bin Tahir", email: "syed@gitwork.co.uk", kind: "dev", aliases: ["Syed Usama"] },
  { name: "Zain Ali", email: "zain@gitwork.co.uk", kind: "dev", aliases: ["ZAIN ALI"] },
  { name: "Syed Arquam", email: "syedarquam@gitwork.co.uk", kind: "dev", aliases: ["Arquam"] },

  // ── Admin / staff ──
  { name: "Harry Brown", email: "harry@gitwork.co.uk", kind: "admin" },
  { name: "Sian Woolridge", email: "sian@gitwork.co.uk", kind: "staff" },
  { name: "Dan Lindsay", email: "dan@gitwork.co.uk", kind: "admin" },
];

const DEV_PERMISSIONS =
  (PERMISSION_PRESETS.find((p) => p.id === "developer")?.permissions as string[] | undefined) ??
  ["clients", "support", "pulse", "backstage"];

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Pre-index every canonical name + alias → entry for O(1) lookup.
const ROSTER_INDEX = new Map<string, RosterEntry>();
for (const entry of TEAM_ROSTER) {
  ROSTER_INDEX.set(normalize(entry.name), entry);
  for (const alias of entry.aliases ?? []) ROSTER_INDEX.set(normalize(alias), entry);
}

/** Resolve a ClickUp / Code / directory name to a roster entry (null if unknown). */
export function findRosterByName(name: string | null | undefined): RosterEntry | null {
  if (!name) return null;
  return ROSTER_INDEX.get(normalize(name)) ?? null;
}

function membership(kind: RosterKind): { role: "ADMIN" | "STAFF"; permissions: string[] } {
  if (kind === "admin") return { role: "ADMIN", permissions: [] };
  if (kind === "staff") return { role: "STAFF", permissions: DEFAULT_STAFF_PERMISSIONS };
  return { role: "STAFF", permissions: DEV_PERMISSIONS };
}

export type SeedTeamReport = {
  usersCreated: number;
  usersUpdated: number;
  membershipsCreated: number;
  candidatesEmailed: number;
  /** Code candidates whose name didn't match the roster (no email set). */
  unmatchedCandidates: string[];
};

/**
 * Idempotent. Creates/refreshes Foundry accounts for the roster and backfills
 * `Candidate.email` in the Code module by name. Never clobbers an existing
 * member's role/permissions (so manual tuning in Settings → Team survives).
 */
export async function seedGitworkTeam(): Promise<SeedTeamReport> {
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { slug: DEFAULT_WORKSPACE_SLUG },
  });
  const report: SeedTeamReport = {
    usersCreated: 0,
    usersUpdated: 0,
    membershipsCreated: 0,
    candidatesEmailed: 0,
    unmatchedCandidates: [],
  };

  for (const entry of TEAM_ROSTER) {
    const existing = await prisma.user.findUnique({ where: { email: entry.email }, select: { id: true } });
    const user = await prisma.user.upsert({
      where: { email: entry.email },
      update: { name: entry.name },
      create: { email: entry.email, name: entry.name },
    });
    if (existing) report.usersUpdated++;
    else report.usersCreated++;

    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
      select: { id: true },
    });
    if (!member) {
      const { role, permissions } = membership(entry.kind);
      await prisma.workspaceMember.create({
        data: { workspaceId: workspace.id, userId: user.id, role, permissions },
      });
      report.membershipsCreated++;
    }
  }

  // Backfill Code candidate emails by name match.
  const candidates = await prisma.candidate.findMany({
    where: { workspaceId: workspace.id },
    select: { id: true, name: true, email: true },
  });
  for (const c of candidates) {
    const entry = findRosterByName(c.name);
    if (!entry) {
      report.unmatchedCandidates.push(c.name);
      continue;
    }
    if (c.email !== entry.email) {
      await prisma.candidate.update({ where: { id: c.id }, data: { email: entry.email } });
      report.candidatesEmailed++;
    }
  }

  return report;
}
