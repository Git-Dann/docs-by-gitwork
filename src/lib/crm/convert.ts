/**
 * Lead → client conversion: what the CRM can fill in on the new Portal client. Pure.
 *
 * Two rules, both deliberate:
 *  - It only ever proposes values for EMPTY fields. A value someone typed is a decision; a value
 *    inferred from email traffic is a guess. A guess never overwrites a decision.
 *  - A contact's name and email travel as a PAIR. If the client already has a primary email for
 *    someone, we never propose a name unless it belongs to that same address — otherwise the
 *    record would end up naming one person at another person's address.
 */

import { addressDomain, matchesLeadDomain } from "@/lib/crm/signals";

export interface ContactEvidence {
  direction: string | null;
  counterpartEmail: string | null;
  counterpartName: string | null;
  occurredAt: Date;
}

export interface DerivedContact {
  name: string | null;
  email: string;
  /** How many emails this person SENT us (inbound), or received from us when nobody wrote. */
  messages: number;
}

/** Automated senders never become a client's main contact. */
const AUTOMATED = /^(no-?reply|do-?not-?reply|notifications?|mailer-daemon|postmaster|bounces?|alerts?)([+.-]|@)/i;

/**
 * The person on their side we've dealt with most: whoever emailed us most often. When nobody on
 * their side has written yet, whoever we've emailed most. Ties go to the most recent.
 */
export function deriveMainContact(
  rows: readonly ContactEvidence[],
  leadDomains: readonly string[],
): DerivedContact | null {
  const pick = (direction: "inbound" | "outbound"): DerivedContact | null => {
    const byEmail = new Map<string, { name: string | null; nameAt: number; count: number; lastAt: number }>();
    for (const r of rows) {
      if (r.direction !== direction || !r.counterpartEmail) continue;
      const email = r.counterpartEmail.trim().toLowerCase();
      if (AUTOMATED.test(email)) continue;
      if (!matchesLeadDomain(addressDomain(email), leadDomains)) continue;
      const at = r.occurredAt.getTime();
      const entry = byEmail.get(email) ?? { name: null, nameAt: -1, count: 0, lastAt: 0 };
      entry.count += 1;
      entry.lastAt = Math.max(entry.lastAt, at);
      const name = r.counterpartName?.trim();
      if (name && at > entry.nameAt && name.toLowerCase() !== email) {
        entry.name = name;
        entry.nameAt = at;
      }
      byEmail.set(email, entry);
    }
    let best: [string, { name: string | null; count: number; lastAt: number }] | null = null;
    for (const entry of byEmail) {
      if (!best || entry[1].count > best[1].count || (entry[1].count === best[1].count && entry[1].lastAt > best[1].lastAt)) {
        best = entry;
      }
    }
    return best ? { name: best[1].name, email: best[0], messages: best[1].count } : null;
  };
  return pick("inbound") ?? pick("outbound");
}

export type ConvertField = "primaryContactName" | "primaryContactEmail" | "website";

export interface ConvertFieldProposal {
  field: ConvertField;
  label: string;
  proposed: string;
  /** Where the value came from, in words — shown beside the checkbox. */
  source: string;
}

const blank = (v: string | null | undefined) => !v || !v.trim();

export function buildConversionProposals(
  client: { primaryContactName: string | null; primaryContactEmail: string | null; website: string | null },
  contact: DerivedContact | null,
  leadDomains: readonly string[],
): ConvertFieldProposal[] {
  const out: ConvertFieldProposal[] = [];

  if (contact) {
    const evidence = `${contact.messages} email${contact.messages === 1 ? "" : "s"} in the CRM`;
    if (blank(client.primaryContactEmail)) {
      out.push({ field: "primaryContactEmail", label: "Main contact email", proposed: contact.email, source: evidence });
      if (blank(client.primaryContactName) && contact.name) {
        out.push({ field: "primaryContactName", label: "Main contact name", proposed: contact.name, source: evidence });
      }
    } else if (
      blank(client.primaryContactName) &&
      contact.name &&
      client.primaryContactEmail!.trim().toLowerCase() === contact.email
    ) {
      out.push({ field: "primaryContactName", label: "Main contact name", proposed: contact.name, source: evidence });
    }
  }

  if (blank(client.website) && leadDomains.length > 0) {
    out.push({ field: "website", label: "Website", proposed: `https://${leadDomains[0]}`, source: "Their email domain" });
  }
  return out;
}
