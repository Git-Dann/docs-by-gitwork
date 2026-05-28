/**
 * Preferred display order for the core Gitwork developer roster.
 *
 * NOT an allowlist — the UI does not hide candidates outside this list.
 * It just biases sort order so the familiar core team appears first in the
 * Roster widget at /app/code; anything added later falls in below by createdAt.
 *
 * The actual seed for new workspaces lives in src/server/rate-card.ts.
 * If you reorder this list, the UI follows immediately; new devs can be
 * added directly via the Add Candidate flow without touching code.
 */

export const GITWORK_ROSTER_ORDER: readonly string[] = [
  "Shahab",
  "Muneeb",
  "Waqar",
  "Fahad",
  "Nasir",
  "Mustaqeem",
  "Jamal",
  "Wasey",
  "Hamza Ahmed",
  "Waqas Ali",
  "Ehtasham Razzaq",
  "Atisham Ahmed",
  "Liaquat",
  "Umer Fayyaz",
  "Mohammed Shahbaz",
  "Abdur Rehman",
  "Abdullah irshad",
  "Ali Sher",
  "RoohUllah",
  "Tahir",
  "Ali Asghar",
] as const;

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const ROSTER_INDEX = new Map(
  GITWORK_ROSTER_ORDER.map((name, idx) => [normalize(name), idx] as const),
);

/**
 * Returns the index of a candidate in the canonical roster order, or
 * Number.MAX_SAFE_INTEGER if not in the roster (sorts to the bottom).
 */
export function rosterIndexFor(name: string | null | undefined): number {
  if (!name) return Number.MAX_SAFE_INTEGER;
  const idx = ROSTER_INDEX.get(normalize(name));
  return idx ?? Number.MAX_SAFE_INTEGER;
}

