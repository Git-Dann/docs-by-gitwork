/**
 * Every wiki page's header: the group it sits in, its title and one sentence saying what it is.
 * One copy for the team's wiki and the client's link, so the two can never name a page
 * differently (they each kept their own title map before Nov 2026).
 */
import type { WikiSection } from "@/components/clients/wiki/wiki-sidebar";
import { SECTION_GROUP, WIKI_SECTION_GROUPS, type GroupedWikiSection } from "@/lib/wiki-section-groups";

export const WIKI_PAGE_TITLES: Record<WikiSection, string> = {
  dashboard: "Dashboard",
  settings: "Settings",
  timeline: "Timeline",
  monitors: "Monitors",
  documents: "Resources",
  intake: "Requests",
  launchpad: "Launchpad",
  insights: "Charts",
  costs: "Running costs",
  estimates: "Estimates",
  comparisons: "Comparisons",
  board: "Board",
  roundup: "RoundUp",
  updates: "Updates",
  delivery: "Delivery",
  support: "Support",
  metrics: "Metrics",
  meetings: "Meetings",
  platforms: "Platforms",
  "code-handover": "Code Handover",
  "design-system": "Design System",
  ia: "Information Architecture",
  "dev-guide": "Developer Guide",
  "api-docs": "API Docs",
  architecture: "Architecture",
  runbook: "Runbook",
  "data-model": "Data Model",
  changelog: "Changelog",
  "course-requests": "Course Requests",
  "golf-data": "Golf Data",
};

/** One plain sentence per page, the same for the team and the client. */
export const WIKI_PAGE_DESCRIPTIONS: Record<WikiSection, string> = {
  dashboard: "Everything about this project at a glance.",
  settings: "Who can open this wiki, and how it connects to other systems.",
  timeline: "The plan, phase by phase, and how far each phase has got.",
  delivery: "Where the project stands, and what is waiting on you.",
  roundup: "The weekly write-up of what moved and what is next.",
  updates: "Our weekly updates to you, and what happened each week.",
  meetings: "Notes, decisions and actions from the meetings we've shared.",
  intake: "Bugs, feedback and requests, and where each one has got to.",
  board: "The product plan as cards you can move, add and sign off.",
  launchpad: "Everything we need from you to start and ship.",
  support: "Support figures, month by month.",
  "course-requests": "Golf courses players have asked for, and where each request is.",
  metrics: "The product's own numbers, month by month.",
  insights: "Charts and diagrams that explain the product.",
  "golf-data": "The golf data behind the app.",
  comparisons: "Features side by side, by plan or against other products.",
  estimates: "How long the work takes with different team sizes.",
  costs: "What the product costs to run each month.",
  platforms: "Links to every platform the product runs on.",
  monitors: "Live uptime checks for every service.",
  changelog: "What shipped in each release, and what is waiting for approval.",
  documents: "Files, links and folders for the project.",
  "design-system": "The colours, type and components the product is built from.",
  "code-handover": "Every version of the code, with what changed between them.",
  ia: "How the product's screens and content are organised.",
  "dev-guide": "How to build against the product.",
  "api-docs": "Endpoints, authentication and examples.",
  architecture: "How the system fits together.",
  runbook: "How to run the product, and what to do when something breaks.",
  "data-model": "The entities and fields the product stores.",
};

/** The sidebar group a page sits in, as its eyebrow; null for Dashboard and Settings. */
export function wikiPageGroupLabel(section: WikiSection): string | null {
  const id = SECTION_GROUP[section as GroupedWikiSection];
  return id ? (WIKI_SECTION_GROUPS.find((g) => g.id === id)?.label ?? null) : null;
}
