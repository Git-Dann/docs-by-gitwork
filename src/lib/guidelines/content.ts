/**
 * The Gitwork brand guidelines, as data: chapters, pages and the words on them.
 *
 * Built from the Gitwork design system (BG-2026-01: tokens, components and the brand book)
 * plus the Foundry assets that ship in this repo. The viewer at /guidelines renders it as a
 * 16:9 deck. Framework-free, so the server, the API and the tests read the same list.
 *
 * Text on a page is editable in place (admins, behind the viewer's ⋯ menu). An edit is stored
 * as an override keyed `<pageId>:<field>`, and only the fields listed in `EDITABLE_FIELDS` can
 * be overridden. Everything visual (swatches, specimens, lockups) is code, so an edit can change
 * what a page says but never break what it shows.
 *
 * The copy keeps the brand's own rules: no em dashes, UK spelling, never "free".
 */

export type VisualId =
  | "positioning"
  | "voice"
  | "copy-rules"
  | "taglines"
  | "delivery-line"
  | "offers"
  | "logo-primary"
  | "roundel"
  | "clear-space"
  | "logo-variations"
  | "logo-misuse"
  | "type-families"
  | "type-scale"
  | "web-scale"
  | "labels-numerals"
  | "palette"
  | "semantic"
  | "contrast"
  | "surfaces"
  | "components"
  | "bullets"
  | "page-geometry"
  | "architecture"
  | "foundry"
  | "product-lockup"
  | "product-rules"
  | "modules"
  | "product-cards"
  | "doc-cover"
  | "slide-example"
  | "checklist";

export type PageKind = "cover" | "contents" | "chapter" | "content";

export interface GuidelinePage {
  id: string;
  kind: PageKind;
  title: string;
  /** The small line under a content page's title. */
  subtitle?: string;
  /** The NOTE column on a content page, or the lede on a cover or chapter page. */
  note?: string;
  visual?: VisualId;
  /** Extra words the sidebar search should match. */
  keywords?: string;
}

export interface GuidelineChapter {
  id: string;
  /** "01". The cover chapter is "00". */
  number: string;
  title: string;
  pages: GuidelinePage[];
}

/** One chapter cover per chapter except the first; it carries the chapter's title and lede. */
function chapter(
  id: string,
  number: string,
  title: string,
  lede: string,
  pages: Omit<GuidelinePage, "kind">[],
): GuidelineChapter {
  return {
    id,
    number,
    title,
    pages: [
      { id: id, kind: "chapter", title, note: lede },
      ...pages.map((p) => ({ ...p, kind: "content" as const })),
    ],
  };
}

export const GUIDELINES_VERSION = "BG-2026-01";

/** The Gitwork design system these guidelines are built from (tokens, components, brand book). */
export const GUIDELINES_SOURCE_URL = "https://claude.ai/artifact/YNfoDN4W6WxZ6NYeTB6QwK";

export const CHAPTERS: GuidelineChapter[] = [
  {
    id: "start",
    number: "00",
    title: "Cover & Contents",
    pages: [
      {
        id: "cover",
        kind: "cover",
        title: "From prompt to production.",
        note: "How Gitwork and its products look, sound and present themselves. One studio, one voice, on every page.",
      },
      { id: "contents", kind: "contents", title: "Contents" },
    ],
  },
  chapter("foundation", "01", "Brand Foundation", "Who we are, how we sound, and the words we never use.", [
    {
      id: "who-we-are",
      title: "Who we are",
      subtitle: "Positioning",
      note: "Gitwork is a UK-led software delivery studio. We take AI-built and half-built apps to production. Every document, deck and page should read like it came from the same studio.",
      visual: "positioning",
    },
    {
      id: "voice",
      title: "Voice",
      subtitle: "Tone of voice",
      note: "Confident, plain-spoken, founder to founder. Short sentences. Concrete over abstract. We speak the language of the AI tooling world: Cursor, v0, Lovable, Bolt, Claude Code. Write we for Gitwork and you for the reader.",
      visual: "voice",
      keywords: "tone writing copy",
    },
    {
      id: "copy-rules",
      title: "Copy rules",
      subtitle: "Every word, every time",
      note: "These apply to anything a client, prospect or the public will see. Strip every internal note before a file is called client-ready.",
      visual: "copy-rules",
      keywords: "em dash free verify spelling",
    },
    {
      id: "taglines",
      title: "Taglines",
      subtitle: "One per document",
      note: "Pick one tagline per document. Never stack two on the same page.",
      visual: "taglines",
    },
    {
      id: "delivery-line",
      title: "The delivery line",
      subtitle: "Word for word",
      note: "Use it exactly as written. Never name the studio location, partners or suppliers. Never imply we do not use offshore, and never claim senior-only. The pillar is the UK quality gate.",
      visual: "delivery-line",
      keywords: "offshore quality uk",
    },
    {
      id: "offers",
      title: "Offers",
      subtitle: "As priced",
      note: "Four offers, each priced from. The call to action is the 30 minute audit at gitwork.co.uk/audit, offered at no charge.",
      visual: "offers",
      keywords: "pricing launch pad mvp sprint greenfield care plan audit",
    },
  ]),
  chapter(
    "logo",
    "02",
    "Logo",
    "The logo is the brand's primary identifier. Reproduce it faithfully on every surface, at every scale.",
    [
      {
        id: "primary-logo",
        title: "Primary logo",
        subtitle: "The wordmark",
        note: "The wordmark is always a placed asset. Never set Gitwork. in a font, in anything. The purple full stop is part of the mark and is never recoloured.",
        visual: "logo-primary",
        keywords: "wordmark",
      },
      {
        id: "roundel",
        title: "The roundel",
        subtitle: "G.",
        note: "The roundel carries the brand where the wordmark will not fit: page heads, avatars and favicons. A cream disc, an ink G and the purple full stop.",
        visual: "roundel",
        keywords: "mark icon favicon avatar",
      },
      {
        id: "clear-space",
        title: "Clear space and size",
        subtitle: "Breathing room",
        note: "Clear space is the height of the purple dot on every side. Minimum sizes: the wordmark 90px wide, the roundel 24px. Below that, use the plain mark.",
        visual: "clear-space",
        keywords: "minimum size padding",
      },
      {
        id: "logo-variations",
        title: "Variations",
        subtitle: "Which logo goes where",
        note: "Ink variants on paper or white. Paper variants on ink. White on purple or photography. One logo per page.",
        visual: "logo-variations",
        keywords: "ink paper white dark",
      },
      {
        id: "logo-misuse",
        title: "Misuse",
        subtitle: "Never do this",
        note: "The mark is only ever scaled in proportion. Anything on this page is a defect, whoever made it.",
        visual: "logo-misuse",
        keywords: "dont stretch rotate shadow recolour",
      },
    ],
  ),
  chapter("typography", "03", "Typography", "Four families, no others. Each one has a job and keeps to it.", [
    {
      id: "typefaces",
      title: "Typefaces",
      subtitle: "Four families",
      note: "Fraunces for headings. Inter for copy and interface. JetBrains Mono for labels. Playfair Display Italic for step numerals, and nowhere else.",
      visual: "type-families",
      keywords: "fraunces inter jetbrains playfair fonts",
    },
    {
      id: "print-scale",
      title: "Print scale",
      subtitle: "A4 at 1000px",
      note: "Print sizes run smaller than web sizes because a page is 1000px wide. Both scales are correct. Never shrink type to make content fit: cut copy or add a page.",
      visual: "type-scale",
      keywords: "sizes headings",
    },
    {
      id: "web-scale",
      title: "Web scale",
      subtitle: "Screens",
      note: "Headings scale up on wide viewports within each range. Body copy never drops below 16px on the web.",
      visual: "web-scale",
    },
    {
      id: "labels-numerals",
      title: "Labels and numerals",
      subtitle: "The small details",
      note: "Labels are mono, uppercase and tracked. Step numerals are Playfair Display Italic in purple, and that face appears nowhere else.",
      visual: "labels-numerals",
      keywords: "eyebrow mono",
    },
  ]),
  chapter(
    "colour",
    "04",
    "Colour",
    "Seven colours. Paper is the ground, ink the dark page, and purple is the one accent on each page.",
    [
      {
        id: "palette",
        title: "Palette",
        subtitle: "Seven colours",
        note: "Paper is the default ground, ink the dark page, warm the break page and white the card. Signal purple is an accent: one purple thing per page, no more.",
        visual: "palette",
        keywords: "hex colours swatches signal purple",
      },
      {
        id: "semantic",
        title: "Semantic tokens",
        subtitle: "Paper and ink pages",
        note: "Build with the semantic tokens so a component works on both page types. The same token resolves to a different colour on a paper page and on an ink page.",
        visual: "semantic",
        keywords: "tokens surface fg rule",
      },
      {
        id: "contrast",
        title: "Contrast",
        subtitle: "Flagged, not hidden",
        note: "The palette is kept exact, so three pairs miss WCAG AA for small text. All three pass at 24px and above. Keep purple text to headline accents, numerals and figures.",
        visual: "contrast",
        keywords: "accessibility wcag",
      },
    ],
  ),
  chapter(
    "visual-language",
    "05",
    "Visual Language",
    "Flat surfaces, hairline rules and one accent. Nothing competes with the words.",
    [
      {
        id: "surfaces",
        title: "Surfaces and cards",
        subtitle: "Flat, ruled, rounded",
        note: "No shadows and no gradients. Cards are white with a hairline border and a 14px radius. Badges and buttons are pills. Hairline rules separate sections.",
        visual: "surfaces",
        keywords: "cards radius shadow",
      },
      {
        id: "components",
        title: "Components",
        subtitle: "The kit",
        note: "Badges, buttons, stats and steps. A stat only ever shows a verified number. Leave a verify marker in place until it has been checked.",
        visual: "components",
        keywords: "badge button stat step",
      },
      {
        id: "bullets",
        title: "Bullets and icons",
        subtitle: "The arrow",
        note: "There is no icon set. The house bullet is the arrow, in signal purple. No emoji and no icon fonts.",
        visual: "bullets",
        keywords: "iconography list arrow",
      },
      {
        id: "page-geometry",
        title: "Page geometry",
        subtitle: "One section, one page",
        note: "A document page is 1000 by 1414px and never reflows. Every content page carries a page head and a page foot. The cover counts as page 1.",
        visual: "page-geometry",
        keywords: "a4 margins layout pdf",
      },
    ],
  ),
  chapter(
    "products",
    "06",
    "Products",
    "Gitwork builds products as well as software for clients. This is how they sit under the Gitwork name.",
    [
      {
        id: "architecture",
        title: "Brand architecture",
        subtitle: "Studio, offers and products",
        note: "Gitwork is the masterbrand. Offers are what we sell as a service. Products are software we build and run ourselves. Modules live inside a product and never stand alone.",
        visual: "architecture",
        keywords: "masterbrand hierarchy",
      },
      {
        id: "foundry",
        title: "Foundry",
        subtitle: "A Gitwork product",
        note: "Foundry is Gitwork's delivery platform: proposals, clients, support, developer vetting and production-readiness checks in one place. It carries its own wordmark, endorsed by Gitwork.",
        visual: "foundry",
        keywords: "platform foundry logo",
      },
      {
        id: "product-lockup",
        title: "Product lockups",
        subtitle: "Name, dot, endorsement",
        note: "Every Gitwork product is a word and a full stop, with by Gitwork set beneath it and aligned to the dot. The dot carries the product's own colour, and nothing else in the lockup does.",
        visual: "product-lockup",
        keywords: "endorsed by gitwork",
      },
      {
        id: "product-rules",
        title: "Endorsement rules",
        subtitle: "Who leads, where",
        note: "The product leads its own surfaces. Gitwork leads the page head and the sign-off. Never set the two logos side by side at the same size.",
        visual: "product-rules",
        keywords: "co-branding",
      },
      {
        id: "foundry-modules",
        title: "Inside Foundry",
        subtitle: "Modules",
        note: "Modules are named in plain type inside the product. They never get a wordmark, a dot or a colour of their own, so the product stays the thing people remember.",
        visual: "modules",
        keywords: "pulse care docs code portal studio provenance",
      },
      {
        id: "product-cards",
        title: "Showing a product",
        subtitle: "On a page or a slide",
        note: "When a Gitwork page lists products, each one gets the same card: its mark, its name, one line on what it does, and where it lives. A new product takes the next slot.",
        visual: "product-cards",
        keywords: "portfolio card",
      },
    ],
  ),
  chapter(
    "applications",
    "07",
    "Applications",
    "The system, applied. Duplicate the nearest example, replace the copy, and do not restyle anything.",
    [
      {
        id: "doc-cover",
        title: "Document cover",
        subtitle: "Proposals and contracts",
        note: "Covers are ink, with the lockup top left, one headline with one purple accent phrase, and the meta row at the foot.",
        visual: "doc-cover",
        keywords: "proposal pdf",
      },
      {
        id: "slides",
        title: "Slides",
        subtitle: "16:9",
        note: "Slides follow the page rules at 16:9: paper ground, a mono eyebrow, a Fraunces headline with one accent, and the page foot.",
        visual: "slide-example",
        keywords: "deck presentation",
      },
      {
        id: "checklist",
        title: "Before it goes out",
        subtitle: "The final pass",
        note: "Run this list on anything a client, a prospect or the public will see.",
        visual: "checklist",
        keywords: "review qa",
      },
    ],
  ),
];

/** A page with its place in the deck. */
export interface PlacedPage {
  page: GuidelinePage;
  chapter: GuidelineChapter;
  /** 0-based position across the whole deck. */
  index: number;
}

export const PAGES: PlacedPage[] = CHAPTERS.flatMap((chapter) => chapter.pages.map((page) => ({ page, chapter }))).map(
  (p, index) => ({ ...p, index }),
);

export const PAGE_COUNT = PAGES.length;

/** The fields an override may change, per page kind. */
export const EDITABLE_FIELDS: Record<PageKind, readonly ("title" | "subtitle" | "note")[]> = {
  cover: ["title", "note"],
  contents: [],
  chapter: ["title", "note"],
  content: ["title", "subtitle", "note"],
};

export type EditableField = "title" | "subtitle" | "note";

export const OVERRIDE_LIMITS = { chars: 1200 } as const;

export type GuidelineOverrides = Record<string, string>;

export function overrideKey(pageId: string, field: EditableField): string {
  return `${pageId}:${field}`;
}

const VALID_KEYS: ReadonlySet<string> = new Set(
  PAGES.flatMap(({ page }) => EDITABLE_FIELDS[page.kind].map((f) => overrideKey(page.id, f))),
);

export function isValidOverrideKey(key: string): boolean {
  return VALID_KEYS.has(key);
}

/**
 * Read stored overrides defensively. Anything that is not a known `<pageId>:<field>` key with a
 * non-empty string value is dropped, so a page that was renamed or removed loses its stale edit
 * rather than throwing. Values are trimmed and capped.
 */
export function parseOverrides(raw: unknown): GuidelineOverrides {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: GuidelineOverrides = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isValidOverrideKey(key) || typeof value !== "string") continue;
    const text = value.trim().slice(0, OVERRIDE_LIMITS.chars);
    if (text) out[key] = text;
  }
  return out;
}

/** The text a field shows: its override when there is one, else the default. */
export function fieldText(
  overrides: GuidelineOverrides,
  page: GuidelinePage,
  field: EditableField,
): string {
  return overrides[overrideKey(page.id, field)] ?? page[field] ?? "";
}

/** Two-digit page number as printed in the corner, counting the cover as page 1. */
export function pageNumber(index: number): string {
  return String(index + 1).padStart(2, "0");
}
