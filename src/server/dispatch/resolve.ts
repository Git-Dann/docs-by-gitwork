/**
 * Dispatch — subject resolution. Pure: no DB, no fetch, fully unit-testable.
 *
 * Turns "@Foundry where are we with the ElectricFire onboarding?" into "this question is about
 * client `electricfire`". Deliberately deterministic rather than asking the model to pick — if
 * the model chose the subject it could confidently answer about the wrong client, which is the
 * exact failure mode Dispatch exists to avoid. When nothing matches we say so and stop.
 *
 * Matching is done on a normalised form (lowercase, alphanumerics + single spaces) with two
 * passes: word-bounded on the spaced form, then a squashed no-spaces comparison so "ElectricFire"
 * finds a client stored as "Electric Fire". The squashed pass carries a minimum length so short
 * names can't collide with the inside of an unrelated word.
 */

import type { DispatchSubject } from "./types";

export interface ClientCandidate {
  id: string;
  name: string;
  slug: string;
}

export interface PersonCandidate {
  id: string;
  name: string;
  email: string;
  aliases?: string[];
}

export interface ResolvedSubject {
  subject: DispatchSubject | null;
  /** Secondary narrowing: "what has Howard done on ElectricFire" → subject=client, filter=Howard. */
  personFilter: { id: string; label: string; email: string } | null;
  /** Which literal string matched, for the audit row. */
  matchedOn: string | null;
}

/** Shortest squashed candidate we'll accept on the no-spaces pass. */
const MIN_SQUASH_LENGTH = 5;

/** Phrases that mean "the whole workspace", used only when no specific subject matched. */
const GLOBAL_HINTS = [
  "everything",
  "all clients",
  "every client",
  "across clients",
  "anything at risk",
  "at risk",
  "what is late",
  "whats late",
  "anything overdue",
  "all overdue",
  "anything slipping",
  "delivery",
  "this week",
];

export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function squash(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Remove the bot's own mention and Slack's link/channel markup so the question reads as plain
 * text. Other users' mentions are LEFT IN (as their display label where Slack gave us one) —
 * "what has <@U123|howard> done" should still find Howard by name.
 */
export function stripBotMention(text: string, botUserId: string | null): string {
  let out = text;
  if (botUserId) {
    out = out.replace(new RegExp(`<@${botUserId}(?:\\|[^>]*)?>`, "g"), " ");
  }
  // <@U123|label> → label; <@U123> → dropped (no label to match on).
  out = out.replace(/<@[A-Z0-9]+\|([^>]*)>/g, " $1 ");
  out = out.replace(/<@[A-Z0-9]+>/g, " ");
  // <#C123|general> → general
  out = out.replace(/<#[A-Z0-9]+\|([^>]*)>/g, " $1 ");
  // <https://example.com|label> → label; bare <https://…> → dropped
  out = out.replace(/<(https?:\/\/[^|>]+)\|([^>]*)>/g, " $2 ");
  out = out.replace(/<https?:\/\/[^>]+>/g, " ");
  return out.replace(/\s+/g, " ").trim();
}

/** Every Slack user id mentioned in the raw text, so the caller can resolve them via users.info. */
export function mentionedSlackUserIds(text: string, botUserId: string | null): string[] {
  const ids = [...text.matchAll(/<@([A-Z0-9]+)(?:\|[^>]*)?>/g)].map((m) => m[1]);
  return [...new Set(ids.filter((id) => id !== botUserId))];
}

interface Match {
  index: number;
  length: number;
  matchedOn: string;
}

/** Best (longest, earliest) match of any of `needles` inside the normalised question. */
function findMatch(spaced: string, squashed: string, needles: string[]): Match | null {
  let best: Match | null = null;
  for (const raw of needles) {
    const n = normalise(raw);
    if (!n) continue;

    // Pass 1 — word-bounded on the spaced form.
    const idx = ` ${spaced} `.indexOf(` ${n} `);
    if (idx !== -1) {
      const cand = { index: idx, length: n.length, matchedOn: raw };
      if (!best || cand.length > best.length || (cand.length === best.length && cand.index < best.index)) {
        best = cand;
      }
      continue;
    }

    // Pass 2 — squashed, for "ElectricFire" vs "Electric Fire". Length-guarded so a short
    // name can't match the inside of an unrelated word.
    const sq = squash(raw);
    if (sq.length >= MIN_SQUASH_LENGTH) {
      const sIdx = squashed.indexOf(sq);
      if (sIdx !== -1) {
        const cand = { index: sIdx, length: sq.length, matchedOn: raw };
        if (!best || cand.length > best.length || (cand.length === best.length && cand.index < best.index)) {
          best = cand;
        }
      }
    }
  }
  return best;
}

export function resolveSubject(
  question: string,
  candidates: { clients: ClientCandidate[]; people: PersonCandidate[] },
): ResolvedSubject {
  const spaced = normalise(question);
  const squashed = squash(question);
  if (!spaced) return { subject: null, personFilter: null, matchedOn: null };

  // ── Client (primary) ──
  let clientHit: { client: ClientCandidate; match: Match } | null = null;
  for (const c of candidates.clients) {
    // The slug is included as a needle: someone pasting a Foundry URL fragment should resolve.
    const m = findMatch(spaced, squashed, [c.name, c.slug]);
    if (!m) continue;
    if (!clientHit || m.length > clientHit.match.length) clientHit = { client: c, match: m };
  }

  // ── Person ──
  let personHit: { person: PersonCandidate; match: Match } | null = null;
  for (const p of candidates.people) {
    const m = findMatch(spaced, squashed, [p.name, ...(p.aliases ?? [])]);
    if (!m) continue;
    if (!personHit || m.length > personHit.match.length) personHit = { person: p, match: m };
  }

  if (clientHit) {
    return {
      subject: {
        kind: "client",
        id: clientHit.client.id,
        label: clientHit.client.name,
        slug: clientHit.client.slug,
      },
      personFilter: personHit
        ? { id: personHit.person.id, label: personHit.person.name, email: personHit.person.email }
        : null,
      matchedOn: clientHit.match.matchedOn,
    };
  }

  if (personHit) {
    return {
      subject: {
        kind: "person",
        id: personHit.person.id,
        label: personHit.person.name,
        email: personHit.person.email,
      },
      personFilter: null,
      matchedOn: personHit.match.matchedOn,
    };
  }

  // ── Nothing named — is this a workspace-wide question? ──
  const padded = ` ${spaced} `;
  const globalHit = GLOBAL_HINTS.find((h) => padded.includes(` ${normalise(h)} `));
  if (globalHit) {
    return {
      subject: { kind: "workspace", label: "Delivery" },
      personFilter: null,
      matchedOn: globalHit,
    };
  }

  return { subject: null, personFilter: null, matchedOn: null };
}
