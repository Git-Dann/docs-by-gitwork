/**
 * Which of the person's own clients a name means, for Dispatch's `switch_client` (Dan, 25 Nov
 * 2026: "Can the Slack conversation not talk to me directly?"). A chat isn't locked to one
 * client any more; it moves between the asker's clients. The list passed in is only ever the
 * clients the asker can open, so a client they can't see reads exactly like a name that doesn't
 * exist. Pure, so the matching is tested.
 */

export interface OwnClient {
  id: string;
  name: string;
  slug: string;
}

export type ClientPick = { kind: "one"; client: OwnClient } | { kind: "several"; names: string[] } | { kind: "none" };

/** Lower case, letters and digits only: "Your Groop", "yourgroop" and "your-groop" all match. */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

export function pickOwnClient(query: string, clients: readonly OwnClient[]): ClientPick {
  const q = norm(query);
  if (!q) return { kind: "none" };
  const exact = clients.filter((c) => norm(c.name) === q || norm(c.slug) === q);
  if (exact.length === 1) return { kind: "one", client: exact[0] };
  const partial = (exact.length ? exact : clients).filter((c) => {
    const n = norm(c.name);
    return n.includes(q) || q.includes(n) || norm(c.slug).includes(q);
  });
  if (partial.length === 1) return { kind: "one", client: partial[0] };
  if (partial.length > 1) return { kind: "several", names: partial.map((c) => c.name).sort((a, b) => a.localeCompare(b)).slice(0, 8) };
  return { kind: "none" };
}

export interface Teammate {
  id: string;
  name: string;
  aliases?: string[];
}

export type PersonPick = { kind: "one"; person: Teammate } | { kind: "several"; names: string[] } | { kind: "none" };

/**
 * Which teammate a name means ("Nasir", "nasir javed", an alias on the team roster). A bare
 * first name only counts when it's unambiguous (respond.ts adds it as an alias then).
 */
export function pickTeammate(query: string, people: readonly Teammate[]): PersonPick {
  const q = norm(query);
  if (!q) return { kind: "none" };
  const keys = (p: Teammate) => [p.name, ...(p.aliases ?? [])].map(norm);
  const exact = people.filter((p) => keys(p).includes(q));
  if (exact.length === 1) return { kind: "one", person: exact[0] };
  const partial = (exact.length ? exact : people).filter((p) => keys(p).some((k) => k.includes(q) || (k.length > 3 && q.includes(k))));
  if (partial.length === 1) return { kind: "one", person: partial[0] };
  if (partial.length > 1) return { kind: "several", names: partial.map((p) => p.name).sort((a, b) => a.localeCompare(b)).slice(0, 8) };
  return { kind: "none" };
}
