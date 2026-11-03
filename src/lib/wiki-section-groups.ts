/**
 * How the client wiki's sections are grouped in the sidebar and in "+ Add New".
 *
 * The sidebar grew to 28 possible sections in one flat list, one row per feature as each
 * shipped. Grouping them by what a reader is looking for — how the project is going, what we
 * need from each other, the numbers, the product, the docs — is what lets a full wiki (Wedge
 * has 13) stay scannable. One map, read by both the sidebar and the Add New picker, so the two
 * can never file a section in different places.
 *
 * Framework-free on purpose: a node test imports it with no React tree behind it.
 */

export type WikiSectionGroupId = "overview" | "together" | "numbers" | "product" | "docs";

export const WIKI_SECTION_GROUPS: { id: WikiSectionGroupId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "together", label: "Working together" },
  { id: "numbers", label: "Numbers" },
  { id: "product", label: "Product" },
  { id: "docs", label: "Docs & handover" },
];

/**
 * Every section except Dashboard (home — always first, never grouped) and Settings (pinned to
 * the foot). Typed as a full record over the section ids, so a new section that is not filed
 * here is a compile error rather than a row that silently renders nowhere.
 */
export const SECTION_GROUP = {
  timeline: "overview",
  delivery: "overview",
  roundup: "overview",
  meetings: "overview",

  intake: "together",
  launchpad: "together",
  support: "together",
  "course-requests": "together",

  metrics: "numbers",
  insights: "numbers",
  sheets: "numbers",
  comparisons: "numbers",
  estimates: "numbers",
  costs: "numbers",
  "golf-data": "numbers",

  platforms: "product",
  monitors: "product",
  changelog: "product",
  documents: "product",

  "design-system": "docs",
  "code-handover": "docs",
  ia: "docs",
  "dev-guide": "docs",
  "api-docs": "docs",
  architecture: "docs",
  runbook: "docs",
  "data-model": "docs",
} as const satisfies Record<string, WikiSectionGroupId>;

export type GroupedWikiSection = keyof typeof SECTION_GROUP;

/**
 * The six single-page doc sections. In the sidebar they collapse into ONE "Docs" row, with tabs
 * on the page to move between them — six rows for six short pages was the heaviest part of the
 * sidebar (After Desk: 5 of its 9 rows). Each keeps its own section id underneath.
 */
export const DOC_PAGE_SECTIONS = ["ia", "dev-guide", "api-docs", "architecture", "runbook", "data-model"] as const satisfies readonly GroupedWikiSection[];
export type DocPageSection = (typeof DOC_PAGE_SECTIONS)[number];
export function isDocPageSection(section: string): section is DocPageSection {
  return (DOC_PAGE_SECTIONS as readonly string[]).includes(section);
}

/**
 * A short flat list reads faster than a grouped one: headings over a three-item sidebar would
 * add more rows than they organise. Groups appear once the list is longer than this.
 */
export const GROUP_HEADINGS_ABOVE = 6;

/** One line per section for the Add New picker — what it is, not what it contains. */
export const SECTION_BLURB: Record<GroupedWikiSection, string> = {
  timeline: "The plan, phase by phase",
  delivery: "Where the project stands",
  roundup: "Weekly progress write-up",
  meetings: "Shared meeting notes",
  intake: "Bugs, feedback and requests",
  launchpad: "What we need from the client",
  support: "Care figures, month by month",
  "course-requests": "Golf course requests",
  metrics: "Product numbers, monthly",
  insights: "Bar, pie, Venn and node charts",
  sheets: "Shared spreadsheets",
  comparisons: "Feature and plan tables",
  estimates: "Timescales by team size",
  costs: "Monthly running costs",
  "golf-data": "Golf data console",
  platforms: "Links to every platform",
  monitors: "Uptime checks",
  changelog: "Release notes",
  documents: "Files and links",
  "design-system": "Colours, type and components",
  "code-handover": "Code versions and handover",
  ia: "Information architecture",
  "dev-guide": "How to build against it",
  "api-docs": "Endpoints and auth",
  architecture: "How the system fits together",
  runbook: "How to run and fix it",
  "data-model": "Entities and fields",
};

/** Add New entries, grouped in sidebar order. Unknown sections fall to the end, ungrouped. */
export function groupAddable<T extends { section: string }>(
  items: T[],
): { id: WikiSectionGroupId | null; label: string | null; items: T[] }[] {
  const out = WIKI_SECTION_GROUPS.map((g) => ({
    id: g.id as WikiSectionGroupId | null,
    label: g.label as string | null,
    items: items.filter((i) => SECTION_GROUP[i.section as GroupedWikiSection] === g.id),
  }));
  const rest = items.filter((i) => !(i.section in SECTION_GROUP));
  if (rest.length) out.push({ id: null, label: null, items: rest });
  return out.filter((g) => g.items.length > 0);
}
