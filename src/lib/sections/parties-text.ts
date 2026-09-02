/**
 * Pure text/layout helpers for the counterparties of an agreement.
 *
 * Shared by TWO renderers so they can never drift apart:
 *   · `src/lib/sections/parties.tsx` — the content-page clause prose ("(a) … ; (b) … ; and (c) … .")
 *   · `src/components/document-cover.tsx` — the cover's bottom strip (party columns)
 *
 * Everything here is framework-free and side-effect-free so it can be unit-tested without a DOM
 * (`__tests__/parties-text.test.ts`). Nothing in here reads `documentType` — a document renders
 * parties because it HAS parties, never because of what kind of document it claims to be.
 */

import type { PartyItem } from "@/types/proposal";

/** The subset of `PartyItem` these helpers actually read — so a cover/meta shape can reuse them. */
export type PartyLike = Partial<
  Pick<PartyItem, "name" | "role" | "organization" | "email" | "details" | "definedTerm">
>;

/** One column of the cover's party strip. Structurally assignable to `DocumentCoverParty`. */
export interface CoverPartyColumn {
  label?: string;
  name: string;
  lines: string[];
}

/** `Party A` / `Party B` / … fallback when a party carries no explicit role. */
export function partyFallbackLabel(index: number): string {
  return index < 26 ? `Party ${String.fromCharCode(65 + index)}` : `Party ${index + 1}`;
}

/** The party's label: its authored `role` when it has one, else the auto `Party A/B/C…` index. */
export function partyLabel(party: PartyLike, index: number): string {
  return party.role?.trim() || partyFallbackLabel(index);
}

/** The bold lead of a party — its display name, falling back to the organisation. */
export function partyDisplayName(party: PartyLike): string {
  return (party.name || party.organization || "").trim();
}

/**
 * Detail lines under/after the name — company number, registered office, "in a personal capacity".
 *
 * `details` is the authored field (one entry per line, blanks dropped). Documents written before
 * `details` existed carried that information in `organization` / `email` instead, so those are the
 * back-compat fallback — never merged with `details`, or an old doc that gets a `details` line
 * would print its organisation twice.
 */
export function partyDetailLines(party: PartyLike): string[] {
  const authored = (party.details ?? []).map((line) => (line ?? "").trim()).filter(Boolean);
  if (authored.length) return authored;
  const name = partyDisplayName(party);
  return [
    party.organization && party.organization.trim() !== name ? party.organization : null,
    party.email,
  ]
    .map((line) => (line ?? "").trim())
    .filter(Boolean);
}

/** Entity-type words a defined term drops — "Gitwork Group Ltd" is referred to as "Gitwork". */
const ENTITY_SUFFIXES = new Set([
  "ltd",
  "ltd.",
  "limited",
  "llp",
  "llc",
  "plc",
  "inc",
  "inc.",
  "incorporated",
  "corp",
  "corp.",
  "corporation",
  "co",
  "co.",
  "company",
  "gmbh",
  "pty",
  "group",
  "holdings",
]);

/** Strip trailing entity words while at least one word remains ("Gitwork Group Ltd" → "Gitwork"). */
function shortenEntityName(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  while (words.length > 1 && ENTITY_SUFFIXES.has(words[words.length - 1].toLowerCase())) {
    words.pop();
  }
  return words.join(" ");
}

/**
 * The quoted defined term a clause introduces — `("Gitwork")`, `("the Client")`.
 *
 * Precedence: the authored `definedTerm` verbatim → the `role` as a defined term (`Client` →
 * `the Client`, already-articled roles left alone) → the name with its entity words stripped.
 * Returns `null` when there is nothing to quote, so the renderer omits the parenthetical rather
 * than printing empty quotes.
 */
export function partyDefinedTerm(party: PartyLike): string | null {
  const explicit = (party.definedTerm ?? "").trim().replace(/^["“”'']+|["“”'']+$/g, "").trim();
  if (explicit) return explicit;
  const role = (party.role ?? "").trim();
  if (role) return /^(the|a|an)\s+/i.test(role) ? role : `the ${role}`;
  const short = shortenEntityName(partyDisplayName(party));
  return short || null;
}

/**
 * Legal-list punctuation: every item ends `;`, the penultimate ends `; and`, the last ends `.`
 * (a single item is simply a sentence, so it ends `.`).
 */
export function clauseItemPunctuation(index: number, total: number): string {
  if (index >= total - 1) return ".";
  if (index === total - 2) return "; and";
  return ";";
}

/**
 * Columns for the cover's party strip. 1–3 sit on one row; **4 splits 2×2** rather than leaving a
 * ragged 3+1; 5+ run 3-up and wrap. Never more than 3 across — a 4th column on A4 crushes a
 * registered-office line into slivers.
 */
export function partyColumnCount(count: number): number {
  if (count <= 1) return 1;
  if (count <= 3) return count;
  if (count === 4) return 2;
  return 3;
}

/**
 * Which of the cover's two bottom-strip modes to render — the ONE decision point.
 *
 * `"parties"` when the document carries parties with something to print (a contract leads with who
 * is bound), `"meta"` otherwise (Prepared for · Prepared by · Date · Valid until), `null` when
 * there is neither and the strip is omitted entirely rather than drawing an empty frame.
 *
 * Deliberately data-driven: an NDA gets columns because it HAS parties, and adding a parties block
 * to a proposal switches its cover over with no per-document-type branch anywhere.
 */
export function coverStripMode(input: {
  parties?: ReadonlyArray<{ name?: string; lines?: string[] }>;
  meta?: ReadonlyArray<unknown>;
}): "parties" | "meta" | null {
  if (filterCoverParties(input.parties ?? []).length) return "parties";
  return (input.meta?.length ?? 0) > 0 ? "meta" : null;
}

/**
 * Drop columns with nothing to print. Used by `coverStripMode` AND by the renderer, so the mode
 * decision and the thing rendered can never disagree about how many parties there are.
 */
export function filterCoverParties<T extends { name?: string; lines?: string[] }>(
  parties: ReadonlyArray<T>,
): T[] {
  return parties.filter(
    (party) => (party.name ?? "").trim() || (party.lines ?? []).some((line) => (line ?? "").trim()),
  );
}

/** Normalise stored parties into the cover's column shape (label = role, details = the lines). */
export function toCoverParties(parties: ReadonlyArray<PartyLike>): CoverPartyColumn[] {
  return parties
    .map((party) => ({
      // Left undefined (not the fallback) so the cover owns the `Party A/B/C…` indexing — it is the
      // only renderer that knows the final, filtered column order.
      label: party.role?.trim() || undefined,
      name: partyDisplayName(party),
      lines: partyDetailLines(party),
    }))
    .filter((party) => party.name || party.lines.length);
}

/** One signature block, as authored in the `signatures` section. */
export interface SignatureBlockLike {
  partyName?: string;
  signatoryName?: string;
  signatoryRole?: string;
  signatoryEmail?: string;
  details?: string[];
  type?: "gitwork" | "client";
  variableName?: string;
}

/**
 * Cover columns derived from the SIGNATURES block, used when the `parties` block has none.
 *
 * A contract's signatories are its parties — the two blocks describe the same people, and older
 * documents carry the names in only one of them. NDA-2026-002 is exactly that: its `parties`
 * block is empty (it predates the current template) while its `signatures` block holds
 * "Gitwork Group Ltd" and the client, so the cover had nothing to show and silently fell back to
 * the meta grid. Reading both means a contract's cover names who is bound whichever block the
 * author filled in, instead of depending on which template version minted the document.
 *
 * `details` is preferred over the signatory's own name/email for the same reason it is in
 * `partyDetailLines`: it is the authored company detail, and mixing the two would print a
 * person's email under a company name.
 */
export function coverPartiesFromSignatures(
  blocks: ReadonlyArray<SignatureBlockLike>,
): CoverPartyColumn[] {
  return blocks
    .map((block) => {
      const name = (block.partyName || block.signatoryName || "").trim();
      const authored = (block.details ?? []).map((line) => (line ?? "").trim()).filter(Boolean);
      const lines = authored.length
        ? authored
        : [block.signatoryRole, block.signatoryEmail]
            .map((line) => (line ?? "").trim())
            .filter(Boolean);
      return { name, lines };
    })
    .filter((party) => party.name || party.lines.length);
}
