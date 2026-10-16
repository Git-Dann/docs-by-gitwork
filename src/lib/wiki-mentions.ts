/**
 * @mentions in a request's reply thread — the pure half.
 *
 * Framework-free so the composer (client) and the Slack notifier (server) share
 * one set of rules. A mention is stored twice on purpose: as readable text in the
 * body (`@Javed Iqbal`) and as a structured `{ id, name, kind }` entry on the
 * comment. The text is what a person reads; the entry is what we notify and
 * highlight, so renaming a person or typing "@Javed" by hand can never page the
 * wrong human.
 */

export type MentionKind = "TEAM" | "CLIENT";

/** Someone who can be @mentioned on a client's requests. Never carries an email —
 *  this shape is sent to the public wiki, and the client has no need of our
 *  team's addresses. */
export interface MentionPerson {
  /** Opaque, stable: `team:<userId>` · `client:<wikiUserId>` · `contact:primary`. */
  id: string;
  name: string;
  kind: MentionKind;
}

export interface StoredMention {
  id: string;
  name: string;
  kind: MentionKind;
}

/** Cap on how many people one reply can page — a reply naming the whole roster is
 *  a broadcast, and the channel is shared with the client. */
export const MAX_MENTIONS_PER_COMMENT = 8;

/**
 * The `@query` being typed at the caret, if any. An `@` only opens a mention at the
 * start of the text or after whitespace / an opening bracket — so an email address
 * (`dan@gitwork.co.uk`) never pops the picker. The query may contain one space so
 * "@Javed Iq" still narrows; a second space, or a newline, closes it.
 */
export function activeMentionQuery(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  const before = text.slice(0, Math.max(0, Math.min(caret, text.length)));
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  const prev = at === 0 ? "" : before[at - 1];
  if (prev && !/[\s(\[{]/.test(prev)) return null;
  const query = before.slice(at + 1);
  if (/[\n\r]/.test(query)) return null;
  if ((query.match(/ /g) ?? []).length > 1) return null;
  if (query.length > 40) return null;
  return { start: at, query };
}

/** People matching a partial name, best first: a name that STARTS with the query,
 *  then one with a word starting with it, then anywhere. Empty query → everyone. */
export function matchMentionables(
  people: readonly MentionPerson[],
  query: string,
  limit = 6,
): MentionPerson[] {
  const q = query.trim().toLowerCase();
  const scored: { p: MentionPerson; score: number }[] = [];
  for (const p of people) {
    const name = p.name.toLowerCase();
    let score: number;
    if (!q) score = 1;
    else if (name.startsWith(q)) score = 3;
    else if (name.split(/\s+/).some((w) => w.startsWith(q))) score = 2;
    else if (name.includes(q)) score = 1;
    else continue;
    scored.push({ p, score });
  }
  scored.sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name));
  return scored.slice(0, limit).map((s) => s.p);
}

/** Replace the `@query` that runs from `start` to the caret with `@Full Name `. */
export function insertMention(
  text: string,
  start: number,
  caret: number,
  person: Pick<MentionPerson, "name">,
): { text: string; caret: number } {
  const token = `@${person.name} `;
  const next = text.slice(0, start) + token + text.slice(caret);
  return { text: next, caret: start + token.length };
}

/**
 * The mentions that SURVIVED editing. A person picked from the list and then
 * deleted from the text must not be paged, so the picked set is filtered back
 * against the body before sending. De-duplicated and capped.
 */
export function mentionsInBody<T extends { id: string; name: string }>(
  body: string,
  picked: readonly T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const p of picked) {
    if (seen.has(p.id)) continue;
    if (!body.includes(`@${p.name}`)) continue;
    seen.add(p.id);
    out.push(p);
    if (out.length >= MAX_MENTIONS_PER_COMMENT) break;
  }
  return out;
}

/** A comment body split into plain text and mention runs, for highlighting.
 *  Longest names first so "@Javed Iqbal" wins over a "@Javed" that is a prefix. */
export function splitMentions(
  body: string,
  mentions: readonly { name: string }[],
): { text: string; mention: boolean }[] {
  const names = [...new Set(mentions.map((m) => m.name).filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
  if (names.length === 0) return [{ text: body, mention: false }];
  const escaped = names.map((n) => `@${n}`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "g");
  const out: { text: string; mention: boolean }[] = [];
  let last = 0;
  for (const m of body.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ text: body.slice(last, i), mention: false });
    out.push({ text: m[0], mention: true });
    last = i + m[0].length;
  }
  if (last < body.length) out.push({ text: body.slice(last), mention: false });
  return out;
}

/**
 * Escape text for Slack mrkdwn. ⚠️ Not cosmetic: the channel is shared with the
 * client, and a reply containing `<!channel>` or `<!here>` would otherwise page
 * everybody in both workspaces. Slack's own rule — escape `&`, `<`, `>` and
 * nothing else.
 */
export function slackEscape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Quote a body for Slack: every line prefixed with `>`, trimmed to a readable
 *  length so a long reply doesn't flood a shared channel. */
export function slackQuote(body: string, max = 600): string {
  const trimmed = body.trim();
  const clipped = trimmed.length > max ? `${trimmed.slice(0, max - 1).trimEnd()}…` : trimmed;
  return slackEscape(clipped)
    .split(/\r?\n/)
    .map((l) => `>${l ? ` ${l}` : ""}`)
    .join("\n");
}

export interface MentionSlackInput {
  author: string;
  /** Each mentioned person, with their Slack user id when we could resolve one. */
  mentioned: { name: string; slackUserId: string | null }[];
  requestTitle: string;
  body: string;
  /** Where the request can be opened; omitted when no shared link exists. */
  link: string | null;
}

/**
 * The Slack message for a reply that @mentions someone. A resolved person is a
 * real `<@U…>` mention so Slack pings them; anyone we couldn't find in Slack is
 * named in bold so the message still reads correctly.
 */
export function mentionSlackText(input: MentionSlackInput): string {
  const who = input.mentioned
    .map((m) => (m.slackUserId ? `<@${m.slackUserId}>` : `*${slackEscape(m.name)}*`))
    .join(", ");
  const title = slackEscape(input.requestTitle.trim());
  const subject = input.link ? `<${input.link}|${title.replace(/\|/g, "¦")}>` : `“${title}”`;
  return [
    `${who} — *${slackEscape(input.author)}* mentioned you on ${subject}`,
    slackQuote(input.body),
  ].join("\n");
}
