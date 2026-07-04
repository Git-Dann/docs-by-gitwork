// @mention token helpers — shared by the server (parse → notify) and the client
// (compose + render). Framework-free so `src/server/tasks.ts` can import it.
//
// Wire format: a mention is stored inline in a note's body as `@[Display Name](userId)`.
// Embedding the display name keeps rendering self-contained (no member lookup needed to
// show the name) while the id is the stable, collision-proof link used for notifying.

/** Matches one `@[Name](id)` token. `Name` may contain spaces but not `]`; `id` no `)`. */
const MENTION_TOKEN = /@\[([^\]]+)\]\(([^)]+)\)/g;

export type MentionSegment =
  | { type: "text"; value: string }
  | { type: "mention"; id: string; name: string };

/** All distinct user ids mentioned in `body`, in first-seen order. */
export function extractMentionIds(body: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const match of body.matchAll(MENTION_TOKEN)) {
    const id = match[2].trim();
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

/** Split `body` into plain-text and mention segments for rendering. */
export function parseMentions(body: string): MentionSegment[] {
  const segments: MentionSegment[] = [];
  let lastIndex = 0;
  for (const match of body.matchAll(MENTION_TOKEN)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      segments.push({ type: "text", value: body.slice(lastIndex, start) });
    }
    segments.push({ type: "mention", name: match[1].trim(), id: match[2].trim() });
    lastIndex = start + match[0].length;
  }
  if (lastIndex < body.length) {
    segments.push({ type: "text", value: body.slice(lastIndex) });
  }
  return segments;
}

/** Build a mention token from a member. */
export function mentionToken(name: string, id: string): string {
  return `@[${name}](${id})`;
}

/** Human-readable body with tokens flattened to `@Name` — for notification previews. */
export function stripMentionTokens(body: string): string {
  return body.replace(MENTION_TOKEN, (_all, name: string) => `@${name.trim()}`);
}
