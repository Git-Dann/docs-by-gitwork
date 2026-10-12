/**
 * Pure helpers for turning raw Gmail / Slack data into CRM signals. No I/O, so the parts that
 * decide what we read and how it is classified are unit-tested.
 */

/** A domain we will put inside a Gmail search. Anything else is refused, not escaped. */
const DOMAIN_RE = /^(?=.{3,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

/**
 * Normalise something a person typed as a lead's email domain ("https://www.Valu.com/about",
 * "@valu.com", "valu.com") to a bare domain, or null when it isn't one. Refusing rather than
 * escaping matters: the result goes inside a Gmail search, where `OR`, braces and quotes are
 * operators.
 */
export function normaliseDomainInput(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  s = s.replace(/^.*@/, "");
  s = s.split(/[/?#:]/)[0] ?? "";
  s = s.replace(/^www\./, "").replace(/\.$/, "");
  return DOMAIN_RE.test(s) ? s : null;
}

/** De-duplicated, validated list of domains. */
export function normaliseDomains(inputs: ReadonlyArray<string | null | undefined>): string[] {
  const out = new Set<string>();
  for (const raw of inputs) {
    if (!raw) continue;
    const d = normaliseDomainInput(raw);
    if (d) out.add(d);
  }
  return [...out];
}

/**
 * The Gmail search for every message to, from or cc'ing one of the lead's domains, after a
 * moment in time. Restricting the query to the lead's own domains is the privacy boundary:
 * the sync never lists the rest of a mailbox.
 */
export function buildGmailQuery(domains: readonly string[], after: Date): string | null {
  const safe = domains.filter((d) => DOMAIN_RE.test(d));
  if (safe.length === 0) return null;
  const terms = safe.flatMap((d) => [`from:${d}`, `to:${d}`, `cc:${d}`]);
  return `{${terms.join(" ")}} after:${Math.floor(after.getTime() / 1000)}`;
}

/** The domain of the first address in a header like `"Jane Doe" <jane@valu.com>`. */
export function addressDomain(header: string | null | undefined): string | null {
  if (!header) return null;
  const angled = header.match(/<([^>]+)>/);
  const addr = (angled ? angled[1] : header.split(",")[0] ?? "").trim().toLowerCase();
  const at = addr.lastIndexOf("@");
  if (at === -1) return null;
  const d = addr.slice(at + 1).replace(/[>\s].*$/, "");
  return d || null;
}

export interface ParsedAddress {
  name: string | null;
  email: string;
}

/**
 * Parse an address header into addresses: `"Doe, Jane" <jane@valu.com>, bob@valu.com`. Commas
 * inside quotes are part of the name, not separators — splitting naively breaks every
 * "Surname, First" display name into two broken addresses.
 */
export function parseAddressList(header: string | null | undefined): ParsedAddress[] {
  if (!header) return [];
  const parts: string[] = [];
  let buf = "";
  let quoted = false;
  let angled = false;
  for (const ch of header) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "<") angled = true;
    else if (ch === ">") angled = false;
    if (ch === "," && !quoted && !angled) {
      parts.push(buf);
      buf = "";
    } else {
      buf += ch;
    }
  }
  parts.push(buf);

  const out: ParsedAddress[] = [];
  for (const part of parts) {
    const p = part.trim();
    if (!p) continue;
    const m = p.match(/^(.*)<([^>]+)>\s*$/);
    const email = (m ? m[2] : p).trim().toLowerCase();
    if (!email.includes("@")) continue;
    const name = m ? m[1].trim().replace(/^"|"$/g, "").trim() : "";
    out.push({ name: name || null, email });
  }
  return out;
}

/** The first address in the headers that belongs to the lead — who on their side we wrote to. */
export function firstLeadAddress(
  headers: ReadonlyArray<string | null | undefined>,
  leadDomains: readonly string[],
): ParsedAddress | null {
  for (const h of headers) {
    for (const a of parseAddressList(h)) {
      if (matchesLeadDomain(addressDomain(a.email), leadDomains)) return a;
    }
  }
  return null;
}

/** True when `domain` is one of `leadDomains` or a subdomain of one (mail.valu.com ⊂ valu.com). */
export function matchesLeadDomain(domain: string | null, leadDomains: readonly string[]): boolean {
  if (!domain) return false;
  return leadDomains.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/**
 * Who sent it. From one of the lead's domains → inbound; anything else → outbound (we only ever
 * fetch messages that involve the lead, so a message not FROM them was sent TO them).
 */
export function emailDirection(fromHeader: string | null | undefined, leadDomains: readonly string[]): "inbound" | "outbound" {
  return matchesLeadDomain(addressDomain(fromHeader), leadDomains) ? "inbound" : "outbound";
}

/**
 * RFC 5322 Message-ID → a stable dedupe key. The same email reaches every mailbox that was on
 * it, each with a different Gmail id; the Message-ID is what they share, so two teammates both
 * opting in doesn't log one email twice.
 */
export function normaliseMessageId(header: string | null | undefined): string | null {
  if (!header) return null;
  const s = header.trim().replace(/^<|>$/g, "").trim().toLowerCase();
  return s || null;
}

/** Slack mrkdwn → readable text: `<@U1>` → `@someone`, `<url|label>` → `label`, `<url>` → `url`. */
export function cleanSlackText(text: string): string {
  return text
    .replace(/<@[A-Z0-9]+(?:\|([^>]+))?>/g, (_, name: string | undefined) => `@${name ?? "someone"}`)
    .replace(/<#[A-Z0-9]+\|([^>]+)>/g, "#$1")
    .replace(/<!(here|channel|everyone)>/g, "@$1")
    .replace(/<([^|>]+)\|([^>]+)>/g, "$2")
    .replace(/<([^>]+)>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** Truncate for a timeline row, on a word boundary where possible. */
export function clip(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
