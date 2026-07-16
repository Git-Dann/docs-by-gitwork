// Framework-free Gitwork roster: canonical name → email, with the alternate
// spellings ("aliases") seen across ClickUp, the Code module and the Google
// directory. This module has NO server-only deps (no prisma), so it is safe to
// import from client components — e.g. the CSV task importer cross-references a
// ClickUp custom-dropdown assignee name against these aliases to resolve a
// Foundry developer.
//
// The server layer (`src/server/team-roster.ts`) re-exports everything here and
// builds account-seeding + scope on top, so this stays the single source of truth.
//
// Confirmed with Dan (June 2026). People deliberately NOT added (left unassigned
// in imports): Abdul/Abdur Rehman, Muneeb, Waqas Ali, Gerry Carroll,
// Nate Holland, Khizar Hayyat Khan, Mohammad Aashir. Role/duplicate accounts skipped.
// Nasir added July 2026 once his gitwork email was provisioned.

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
  // Admin, not a delivery developer — kept off the dev roster (dev-output leaderboard +
  // standup roster) so the analytics reflect actual delivery devs.
  { name: "Syed Usama Bin Tahir", email: "syed@gitwork.co.uk", kind: "admin", aliases: ["Syed Usama"] },
  { name: "Zain Ali", email: "zain@gitwork.co.uk", kind: "dev", aliases: ["ZAIN ALI"] },
  { name: "Syed Arquam", email: "syedarquam@gitwork.co.uk", kind: "dev", aliases: ["Arquam"] },
  { name: "Nasir", email: "nasir@gitwork.co.uk", kind: "dev" },

  // ── Admin / staff ──
  { name: "Harry Brown", email: "harry@gitwork.co.uk", kind: "admin" },
  { name: "Sian Woolridge", email: "sian@gitwork.co.uk", kind: "staff" },
  { name: "Dan Lindsay", email: "dan@gitwork.co.uk", kind: "admin" },
];

export function normalizeRosterName(value: string): string {
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
  ROSTER_INDEX.set(normalizeRosterName(entry.name), entry);
  for (const alias of entry.aliases ?? []) ROSTER_INDEX.set(normalizeRosterName(alias), entry);
}

/** Resolve a ClickUp / Code / directory name to a roster entry (null if unknown). */
export function findRosterByName(name: string | null | undefined): RosterEntry | null {
  if (!name) return null;
  return ROSTER_INDEX.get(normalizeRosterName(name)) ?? null;
}
