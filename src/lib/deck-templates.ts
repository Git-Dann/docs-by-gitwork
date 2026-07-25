/**
 * Deck template catalogue — the Foundry-side view of the decks Deck can build.
 *
 * WHY THIS IS A SECOND LIST. The templates themselves live in
 * `vendor/bento/slides/src/foundry/templates.ts`, inside the vendored app, which
 * has its own toolchain and is excluded from this tsconfig — Next cannot import
 * it. So the split is deliberate and narrow:
 *
 *   · Foundry knows the CATALOGUE (slug, name, blurb, house) — enough to render
 *     the picker in the create-document modal and to label a deck in the library.
 *   · Deck knows how to BUILD one. The create flow stores only the slug on
 *     `metadata.deckTemplate`; Deck materialises the slides on first open and
 *     saves the result back to `Document.deckDoc`.
 *
 * The slugs are the contract between the two. `npm run deck:verify` drives every
 * template in the picker, so a slug that stops existing on the Deck side fails
 * there; keep this list in step when adding one.
 */

export type DeckTemplateHouse = "foundry" | "gitwork";

export interface DeckTemplateSummary {
  /** Matches the slug in vendor/bento/slides/src/foundry/templates.ts. */
  slug: string;
  house: DeckTemplateHouse;
  name: string;
  blurb: string;
  /** Slides the template starts with — shown in the picker. */
  slides: number;
}

export const DECK_TEMPLATES: DeckTemplateSummary[] = [
  // Delivery — the work we do with a client once they're signed.
  {
    slug: "kickoff",
    house: "foundry",
    name: "Project kickoff",
    blurb: "First session with a signed client — goals, team, how we work.",
    slides: 6,
  },
  {
    slug: "sprint-review",
    house: "foundry",
    name: "Sprint review",
    blurb: "What shipped, what it moved, what is next.",
    slides: 6,
  },
  {
    slug: "monthly-report",
    house: "foundry",
    name: "Monthly client report",
    blurb: "Usage, support and roadmap for a retained client.",
    slides: 6,
  },
  {
    slug: "tech-proposal",
    house: "foundry",
    name: "Technical approach",
    blurb: "Architecture and delivery plan for a scoped build.",
    slides: 6,
  },
  {
    slug: "discovery-readout",
    house: "foundry",
    name: "Discovery readout",
    blurb: "Research findings and where the opportunity is.",
    slides: 6,
  },
  // Sales — the work of winning them.
  {
    slug: "gw-pitch",
    house: "gitwork",
    name: "New business pitch",
    blurb: "The core Gitwork pitch — problem, approach, proof, ask.",
    slides: 6,
  },
  {
    slug: "gw-talent",
    house: "gitwork",
    name: "Developer talent",
    blurb: "Selling vetted developers — the hiring problem and how vetting works.",
    slides: 6,
  },
  {
    slug: "gw-build-proposal",
    house: "gitwork",
    name: "Build proposal",
    blurb: "Scoped project proposal — phases, price, timeline.",
    slides: 6,
  },
  {
    slug: "gw-case-study",
    house: "gitwork",
    name: "Case study",
    blurb: "One client, one problem, one result — the proof deck.",
    slides: 6,
  },
  {
    slug: "gw-retainer",
    house: "gitwork",
    name: "Retainer proposal",
    blurb: "Ongoing partnership — what a monthly retainer buys.",
    slides: 6,
  },
];

/** A blank deck — the starter, for when none of the ten fit. */
export const DECK_BLANK_SLUG = "";

export function deckTemplateBySlug(slug: string | null | undefined): DeckTemplateSummary | null {
  if (!slug) return null;
  return DECK_TEMPLATES.find((t) => t.slug === slug) ?? null;
}

/**
 * The URL that opens a deck document in the Deck window. `doc` is the Document
 * id — Deck loads the slides from the API and saves back to it, so Foundry stays
 * the source of truth (the standalone .deck.html is an export, via Save a copy).
 */
export function deckHref(documentId: string, brand?: DeckTemplateHouse): string {
  const params = new URLSearchParams({ doc: documentId });
  if (brand) params.set("brand", brand);
  return `/deck?${params.toString()}`;
}
