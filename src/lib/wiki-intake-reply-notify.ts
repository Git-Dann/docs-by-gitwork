/**
 * The pure halves of telling people about a reply on a client's request — who to tell,
 * and what the email says. Framework-free so each rule can be tested without a request,
 * a database or a mail provider. The side effects live in
 * src/server/wiki-intake-reply-notify.ts.
 */
import type { StoredMention } from "@/lib/wiki-mentions";

/** Gitwork's own domains. A reply email is for the CLIENT — a Gitwork address on a
 *  request is a teammate who filed it on the client's behalf, and they already see the
 *  thread in Foundry. Matches the domain and any subdomain of it. */
export const INTERNAL_EMAIL_DOMAINS = ["gitwork.co.uk", "gitwork.io"] as const;

export function isInternalEmail(email: string | null | undefined): boolean {
  const domain = email?.trim().toLowerCase().split("@")[1];
  if (!domain) return false;
  return INTERNAL_EMAIL_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/**
 * The Foundry user ids a reply's TEAM mentions should notify. A mention id is
 * `team:<userId>`; client mentions are handled by Slack, not the in-app bell. The
 * author is never notified about their own reply, and nobody is notified twice.
 */
export function teamMentionRecipients(
  mentions: readonly Pick<StoredMention, "id" | "kind">[],
  authorUserId: string | null | undefined,
): string[] {
  const out = new Set<string>();
  for (const m of mentions) {
    if (m.kind !== "TEAM" || !m.id.startsWith("team:")) continue;
    const userId = m.id.slice("team:".length).trim();
    if (!userId || userId === authorUserId) continue;
    out.add(userId);
  }
  return [...out];
}

/**
 * Which of this client's OWN people a reply @mentioned, as wiki-user ids.
 *
 * ⚠️ The mirror of `teamMentionRecipients`, and it exists because the client half
 * of a mention went nowhere. A Gitwork person could @mention a client in a reply,
 * the name would highlight, the Slack post would go out — and the person named had
 * no way to learn about it except by opening the wiki and reading. `kind: "CLIENT"`
 * was simply not a case anything handled.
 *
 * ⚠️ `contact:primary` is deliberately dropped. It is a CLIENT-kind mention with no
 * `ClientWikiUser` behind it — a name and an address off the client record — so
 * there is no account and therefore no device to ring. It is still highlighted in
 * the body and still reaches them by email; it is only push that it cannot have.
 *
 * ⚠️ The author is never a recipient, whoever they are. A client @mentioning a
 * colleague must not ring their own phone.
 */
export function clientMentionRecipients(
  mentions: readonly Pick<StoredMention, "id" | "kind">[],
  authorClientUserId: string | null | undefined,
): string[] {
  const out = new Set<string>();
  for (const m of mentions) {
    if (m.kind !== "CLIENT" || !m.id.startsWith("client:")) continue;
    const userId = m.id.slice("client:".length).trim();
    if (!userId || userId === authorClientUserId) continue;
    out.add(userId);
  }
  return [...out];
}

export interface WikiUserContact {
  email: string;
  name: string | null;
}

/**
 * Who raised a request, as an email address we can write to — or null.
 *
 * `requestedBy` is the display string stamped when the request was filed: a signed-in
 * client wiki user's name, or their email when they have no name
 * (src/server/wiki-intake-attribution.ts). So it is matched back against this wiki's
 * own users, by email first and then by name.
 *
 * Deliberately conservative — a reply email reaching the wrong person is worse than
 * none, so:
 *   • a name shared by two wiki users is ambiguous → null;
 *   • a Gitwork address is never returned (see INTERNAL_EMAIL_DOMAINS);
 *   • a typed name with no matching wiki user → null. We never guess an address.
 */
export function pickRaiserEmail(
  requestedBy: string | null | undefined,
  users: readonly WikiUserContact[],
): string | null {
  const who = requestedBy?.trim().toLowerCase();
  if (!who) return null;

  const byEmail = users.filter((u) => u.email.trim().toLowerCase() === who);
  const byName = byEmail.length > 0 ? byEmail : users.filter((u) => u.name?.trim().toLowerCase() === who);
  if (byName.length !== 1) return null;
  const email = byName[0].email.trim();
  if (!email.includes("@") || isInternalEmail(email)) return null;
  return email;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** The longest reply body quoted in an email — the link carries the rest. */
export const REPLY_EMAIL_BODY_LIMIT = 2000;

/**
 * The email a client gets when Gitwork replies on their request. Every value that
 * came from a person (names, the request title, the reply) is escaped: a reply that
 * contains `<img src=x onerror=…>` arrives as text.
 *
 * `link` is the client's shared wiki URL, or null when sharing is off — in which case
 * the email says where to look rather than linking somewhere they can't open.
 */
export function buildTeamReplyEmail(input: {
  clientName: string;
  itemTitle: string;
  authorName: string;
  body: string;
  link: string | null;
}): { subject: string; html: string; text: string } {
  // A screenshot-only reply has no text. Say what was sent rather than quoting nothing.
  const screenshotOnly = !input.body.trim();
  const body = screenshotOnly
    ? "Sent a screenshot — open the conversation to see it."
    : input.body.length > REPLY_EMAIL_BODY_LIMIT
      ? `${input.body.slice(0, REPLY_EMAIL_BODY_LIMIT)}…`
      : input.body;
  const verb = screenshotOnly ? "sent a screenshot on" : "replied to";
  // Subjects are plain text, but a CR/LF in one is header injection territory.
  const flat = (s: string) => s.replace(/[\r\n]+/g, " ").trim();
  const subject = flat(`${input.authorName} ${verb} "${input.itemTitle}"`).slice(0, 200);

  const e = escapeHtml;
  const bodyHtml = e(body).replace(/\r?\n/g, "<br>");
  const action = input.link
    ? `<p style="margin:24px 0 0"><a href="${e(input.link)}" style="display:inline-block;background:#1D4ED8;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:600">View the conversation</a></p>`
    : `<p style="margin:24px 0 0;color:#64748B">Open the Requests page of your ${e(input.clientName)} wiki to reply.</p>`;

  const html = `<!doctype html><html><body style="font-family:Inter,Arial,sans-serif;color:#0F172A;line-height:1.5">
<p style="margin:0 0 4px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#64748B">${e(input.clientName)} · Requests</p>
<p style="margin:0 0 16px"><strong>${e(input.authorName)}</strong> ${verb} <strong>${e(input.itemTitle)}</strong></p>
<blockquote style="margin:0;padding:12px 16px;border-left:3px solid #1D4ED8;background:#F8FAFC">${bodyHtml}</blockquote>
${action}
</body></html>`;

  const text = [
    `${input.authorName} ${verb} "${input.itemTitle}"`,
    "",
    body,
    "",
    input.link ? `View the conversation: ${input.link}` : `Open the Requests page of your ${input.clientName} wiki to reply.`,
  ].join("\n");

  return { subject, html, text };
}
