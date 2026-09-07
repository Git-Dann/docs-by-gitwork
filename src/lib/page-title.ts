/**
 * Document titles — the text in the browser tab.
 *
 * Every `/app` page rendered four identical "Foundry by Gitwork" tabs, because
 * the root layout set one flat title and no page overrode it. With several tabs
 * open on different clients there was nothing to tell them apart.
 *
 * ONE formatter, used by both the server (`generateMetadata`) and the client
 * (AppShell's title sync), so the two can never disagree about the same page —
 * which is the failure mode a second implementation would quietly introduce.
 */

export const APP_NAME = "Foundry";
/** Thin space either side reads better in a tab than a hyphen. */
const SEP = " · ";

/**
 * `buildPageTitle("Tasks", "YourGroop")` → `"YourGroop · Tasks · Foundry"`
 * `buildPageTitle("Pulse")`             → `"Pulse · Foundry"`
 *
 * Context first, deliberately: a tab is truncated from the RIGHT, so the client
 * name — the thing that distinguishes one tab from four others — has to come
 * before the feature, and "Foundry" last since it is the same on every tab.
 */
export function buildPageTitle(feature: string, context?: string | null): string {
  const parts = [context?.trim(), feature?.trim()].filter(
    (p): p is string => Boolean(p && p.length > 0),
  );
  if (parts.length === 0) return `${APP_NAME} by Gitwork`;
  // De-duplicate: a page whose title already names the client shouldn't repeat it.
  const unique = parts.filter((p, i) => parts.findIndex((q) => q.toLowerCase() === p.toLowerCase()) === i);
  return [...unique, APP_NAME].join(SEP);
}

/**
 * The `title` object for a Next.js route's metadata.
 *
 * `absolute` rather than a template string: the root layout's template would
 * otherwise append " · Foundry" to a value that already ends in it.
 */
export function pageMetadataTitle(feature: string, context?: string | null) {
  return { absolute: buildPageTitle(feature, context) };
}
