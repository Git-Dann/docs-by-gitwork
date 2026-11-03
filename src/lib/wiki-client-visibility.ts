/**
 * Which wiki sections a CLIENT can see on their share link — the one rule, used by the share
 * page to build its navigation and by the internal wiki to mark the sections the client can't
 * see, so the two can never disagree about what the client is shown.
 *
 * Moved verbatim out of `wiki-public-view.tsx` (Oct 2026). Every predicate is "enabled AND has
 * something in it": an enabled-but-empty section would land the client on a blank page that
 * reads as a broken link.
 */
import type { WikiDTO } from "@/lib/api";
import type { WikiSection } from "@/components/clients/wiki/wiki-sidebar";
import { COURSE_REQUESTS_SLUGS } from "@/lib/wiki-sections";
import { isPlannable } from "@/lib/wiki-estimates";
import { isPublishable as isPublishableComparison } from "@/lib/wiki-comparisons";

type WikiPageType = "IA_GUIDE" | "DEV_API_GUIDE" | "API_DOCS" | "ARCHITECTURE" | "RUNBOOK" | "DATA_MODEL" | "CUSTOM";

const TYPE_TO_SECTION: Partial<Record<WikiPageType, WikiSection>> = {
  IA_GUIDE: "ia",
  DEV_API_GUIDE: "dev-guide",
  API_DOCS: "api-docs",
  ARCHITECTURE: "architecture",
  RUNBOOK: "runbook",
  DATA_MODEL: "data-model",
};

/** The sections a client sees, in navigation order. Dashboard is always first. */
export function clientVisibleSections(wiki: WikiDTO): WikiSection[] {
  // The public portal only surfaces sections that have real content. Empty doc
  // pages and the privately-managed Design System are hidden so the client never
  // lands on a blank or dead-end page (per Dan, June 2026).
  const hiddenSections = new Set(wiki.hiddenSections ?? []);
  const existingDocSections = wiki.pages
    .map((page) => TYPE_TO_SECTION[page.type as WikiPageType])
    .filter((section): section is WikiSection => {
      if (!section) return false;
      return !hiddenSections.has(section);
    });
  const hasTimeline =
    wiki.timeline.blocks.length > 0 || wiki.timeline.milestones.length > 0;
  const availableSections: WikiSection[] = [
    // Dashboard is always the public landing — a visual overview that links into
    // whatever sections exist below.
    "dashboard",
    ...(hasTimeline ? (["timeline"] as const) : []),
    ...(wiki.monitors.enabled && wiki.monitors.monitors.some((m) => m.enabled)
      ? (["monitors"] as const)
      : []),
    // Resources shows with at least one resource, or with the client's Drive files switched on
    // (a folder they can see is something in it, even before a resource is added).
    ...(wiki.documents.enabled &&
    (wiki.documents.documents.length > 0 || (wiki.drive.enabled && wiki.drive.linked))
      ? (["documents"] as const)
      : []),
    // Requests shows when intake is on OR there are dev-raised blockers to action.
    ...(wiki.intakeEnabled || wiki.blockers.length > 0 ? (["intake"] as const) : []),
    // Launchpad shows once it is switched on AND a template is assigned — an
    // enabled-but-unassigned kit would land the client on an empty page, which
    // reads as a broken link rather than as work we have not set up yet.
    ...(wiki.launchpad?.enabled && wiki.launchpad.assigned ? (["launchpad"] as const) : []),
    // Enabled AND has boards. An enabled-but-empty section lands a client on a blank
    // page that reads as a broken link — the same predicate code-handover uses.
    ...(wiki.insights.enabled && wiki.insights.boards.length > 0 ? (["insights"] as const) : []),
    // Running costs needs at least one priced line. Enabled-and-empty would state a
    // cost per user of £0.00 — a confident figure derived from nothing, which is worse
    // than the blank page it would replace.
    ...(wiki.costs.enabled && wiki.costs.items.length > 0 ? (["costs"] as const) : []),
    // Estimates needs at least one estimate with effort in it. Enabled-and-empty would
    // promise a timeline and show none — and a timeline of "0 weeks" is worse than none.
    ...(wiki.estimates.enabled && wiki.estimates.estimates.some(isPlannable)
      ? (["estimates"] as const)
      : []),
    // Comparisons needs a table with columns and at least one feature row. Enabled-and-empty
    // would promise a comparison and show a blank grid.
    ...(wiki.comparisons.enabled && wiki.comparisons.comparisons.some(isPublishableComparison)
      ? (["comparisons"] as const)
      : []),
    // Sheets needs a sheet with columns. Enabled-and-empty would invite the client to a grid
    // with nothing in it — and the server already sends nothing while the section is off.
    ...(wiki.sheets.enabled && wiki.sheets.sheets.some((s) => s.columns.length > 0)
      ? (["sheets"] as const)
      : []),
    // RoundUp needs a breakdown to summarise. Enabled-and-empty would land a client on
    // "nothing to report", which reads as a broken link rather than as work not started.
    ...(wiki.roundupEnabled && wiki.timeline.blocks.length > 0 ? (["roundup"] as const) : []),
    // Delivery needs a timeline to describe, or the client lands on "no plan yet" from a
    // link that promised progress.
    ...(wiki.deliveryEnabled && wiki.timeline.blocks.length > 0 ? (["delivery"] as const) : []),
    // Support needs a LINKED Care record, not merely the flag — an unlinked section would
    // show "not connected", which is our problem to fix, not theirs to read.
    ...(wiki.support.enabled && wiki.support.linked ? (["support"] as const) : []),
    // Each needs more than its flag: an enabled page with nothing on it would read to the
    // client as a broken link. Metrics here are already the client's copy (hidden ones
    // removed server-side), so "at least one" means at least one they are allowed to see.
    ...(wiki.metrics.enabled && wiki.metrics.source && wiki.metrics.metrics.length > 0
      ? (["metrics"] as const)
      : []),
    ...(wiki.meetings.enabled && wiki.meetings.meetings.length > 0 ? (["meetings"] as const) : []),
    ...(wiki.clientPlatforms.enabled && wiki.clientPlatforms.platforms.length > 0
      ? (["platforms"] as const)
      : []),
    ...(wiki.codeHandover.enabled && wiki.codeHandover.modules.length > 0
      ? (["code-handover"] as const)
      : []),
    ...(wiki.designSystem ? (["design-system"] as const) : []),
    ...existingDocSections,
    ...(wiki.changelog.length > 0 ? (["changelog"] as const) : []),
    ...(COURSE_REQUESTS_SLUGS.includes(wiki.clientSlug)
      ? (["course-requests"] as const)
      : []),
  ];
  return availableSections;
}
