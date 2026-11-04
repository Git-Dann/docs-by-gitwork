/**
 * Pure helpers for the Mac app's mail view: who a message is from, and a link that opens the
 * thread in the right Gmail account. No message bodies are read or stored, only headers and
 * Gmail's own short snippet.
 */

export interface InboxMessage {
  id: string;
  threadId: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  snippet: string;
  date: string | null;
  unread: boolean;
  link: string;
}

/** `"Luke McFarland" <luke@bigwedgegolf.com>` → { name: "Luke McFarland", email: "luke@…" }. */
export function parseFrom(raw: string): { name: string; email: string } {
  const s = raw.trim();
  const angle = s.match(/^(.*?)<([^>]+)>\s*$/);
  if (angle) {
    const email = angle[2].trim().toLowerCase();
    const name = angle[1].trim().replace(/^"(.*)"$/, "$1").trim();
    return { name: name || email, email };
  }
  const email = s.toLowerCase();
  return { name: email, email };
}

/** Opens the thread in the account the message belongs to, not whichever account is first. */
export function gmailThreadLink(threadId: string, accountEmail: string | null): string {
  const auth = accountEmail ? `?authuser=${encodeURIComponent(accountEmail)}` : "";
  return `https://mail.google.com/mail/${auth}#all/${encodeURIComponent(threadId)}`;
}

/** The Gmail search the view uses: unread in the primary inbox this week. */
export const DEFAULT_INBOX_QUERY = "in:inbox is:unread category:primary newer_than:7d";

/** Only Gmail search operators and words; anything else falls back to the default. */
export function safeQuery(q: string | null): string {
  if (!q) return DEFAULT_INBOX_QUERY;
  const trimmed = q.trim().slice(0, 200);
  return /^[\w\s:@.\-"()]+$/.test(trimmed) && trimmed.length > 0 ? trimmed : DEFAULT_INBOX_QUERY;
}

export function dateIso(raw: string): string | null {
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}
