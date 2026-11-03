/**
 * The short plan that follows from a report's findings: what to do first, how long it
 * takes and how much risk it removes. Same ranking as the portfolio planner, so the report
 * and the portfolio never disagree about what comes first.
 */

import type { WorkItem } from "@/lib/code-portfolio";

export interface PlanStep {
  /** "Fix the 3 serious security holes", "Split buildInvoice"… */
  title: string;
  /** Why, in a sentence a client can repeat. */
  benefit: string;
  days: number;
  /** Share of all measured risk removed once this step and the ones before it are done (0–1). */
  cumulativeShare: number;
}

export interface ActionPlan {
  steps: PlanStep[];
  /** Days, following the plan, until most (80%) of the measured risk is gone. Null with no work. */
  daysToMost: number | null;
  totalDays: number;
}

const round = (d: number) => Math.round(d * 4) / 4;
const fileName = (p: string) => p.split("/").pop() ?? p;
const names = (xs: string[], max = 3) => (xs.length <= max ? xs : [...xs.slice(0, max), `${xs.length - max} more`]).join(", ").replace(/, ([^,]+)$/, " and $1");

/** Product areas a client cares most about first, when grouping debt into themes. */
const AREA_ORDER = ["payments", "sign-in and accounts", "bookings", "data syncing", "content", "the shop", "notifications", "reporting", "search", "admin tools"];

interface Theme {
  title: string;
  benefit: string;
  items: WorkItem[];
  security?: boolean;
}

/**
 * Group the work into themes a client can approve, rather than a list of the cheapest fixes:
 * a plan ranked item by item on value per day surfaced three trivial two-file loops ahead of
 * a 181-file knot on a real app. Each item lands in exactly one theme.
 */
function themesOf(items: WorkItem[], nameRepo: (title: string, repos: string[]) => string): Theme[] {
  const left = new Set(items);
  const take = (pred: (i: WorkItem) => boolean) => {
    const got = [...left].filter(pred);
    got.forEach((g) => left.delete(g));
    return got;
  };
  const themes: Theme[] = [];
  const repos = (xs: WorkItem[]) => xs.map((x) => x.repo);

  const security = take((i) => i.lane === "security");
  if (security.length) {
    themes.push({
      security: true,
      items: security,
      title: nameRepo(security.length === 1 ? security[0].title : `Upgrade the ${security.length} outside libraries with known security holes`, repos(security)),
      benefit: "Closes every published security hole in the libraries it is built on. Usually a version bump and a test run each.",
    });
  }

  const cycles = [...left].filter((i) => i.kind === "dependency_cycle").sort((a, b) => b.value - a.value);
  const big = cycles.filter((c) => /Untangle (\d+)/.test(c.title) && Number(c.title.match(/Untangle (\d+)/)![1]) >= 10);
  for (const c of big) {
    left.delete(c);
    themes.push({ items: [c], title: nameRepo(c.title, [c.repo]), benefit: c.why });
  }
  const small = take((i) => i.kind === "dependency_cycle");
  if (small.length) {
    themes.push({
      items: small,
      title: nameRepo(small.length === 1 ? small[0].title : `Untangle ${small.length} small loops between files`, repos(small)),
      benefit: "Each is a few files that depend on each other; cutting one import usually frees them. Cheap, and it stops the loops growing.",
    });
  }

  // The most-changed hard code, one step per file (worst two files).
  const hotByFile = new Map<string, WorkItem[]>();
  for (const i of [...left].filter((i) => i.hot && i.file)) hotByFile.set(`${i.repo}:${i.file}`, [...(hotByFile.get(`${i.repo}:${i.file}`) ?? []), i]);
  const hotFiles = [...hotByFile.values()].sort((a, b) => b.reduce((s, i) => s + i.value, 0) - a.reduce((s, i) => s + i.value, 0)).slice(0, 2);
  for (const group of hotFiles) {
    group.forEach((g) => left.delete(g));
    const area = group[0].area;
    themes.push({
      items: group,
      title: nameRepo(`Simplify ${fileName(group[0].file!)}${area ? ` (${area})` : ""}`, [group[0].repo]),
      benefit: `One of the most-changed files, with ${group.length} hard-to-change ${group.length === 1 ? "part" : "parts"} in it, so the cost is paid every week. Simplifying it makes every future change here faster and safer.`,
    });
  }

  // Remaining debt grouped by product area, the areas clients care most about first.
  const areas = [...new Set([...left].map((i) => i.area).filter((a): a is string => !!a))].sort((a, b) => AREA_ORDER.indexOf(a) - AREA_ORDER.indexOf(b));
  for (const area of areas) {
    const group = take((i) => i.area === area && i.kind === "debt");
    if (!group.length) continue;
    const files = [...new Set(group.map((g) => fileName(g.file ?? "")))];
    themes.push({
      items: group,
      title: nameRepo(`Simplify the ${area} code (${group.length} ${group.length === 1 ? "place" : "places"})`, repos(group)),
      benefit: `Hard-to-change code in ${names(files)}. ${area === "payments" || area === "sign-in and accounts" ? "Mistakes here cost money or lock people out, which is why it is called out on its own." : "Simpler code here means faster, safer changes."}`,
    });
  }

  const hubs = take((i) => i.kind === "hub_module");
  if (hubs.length) {
    themes.push({
      items: hubs,
      title: nameRepo(`Make ${hubs.length === 1 ? fileName(hubs[0].file ?? "") : `the ${hubs.length} central files`} safer to change`, repos(hubs)),
      benefit: `Many other files depend on ${names(hubs.map((h) => fileName(h.file ?? "")))} and they are complicated, so a change there can break things far away.`,
    });
  }

  const rest = [...left];
  if (rest.length) {
    themes.push({
      items: rest,
      title: nameRepo(`Tidy the remaining ${rest.length} hard-to-change ${rest.length === 1 ? "place" : "places"}`, repos(rest)),
      benefit: "Smaller items spread across the code. Best done a few at a time alongside normal work, not as a project.",
    });
  }
  return themes;
}

/**
 * Turn the findings into a short plan a client can approve: themes, security first, then by
 * how much risk each removes. The same weights as the portfolio planner, so the report and
 * the portfolio never disagree about what matters.
 */
export function actionPlan(items: WorkItem[], maxSteps = 5, opts: { nameRepos?: boolean } = {}): ActionPlan {
  if (items.length === 0) return { steps: [], daysToMost: null, totalDays: 0 };
  // Across several repositories a step must say which one it is in; in one report it would be noise.
  const nameRepo = (title: string, repos: string[]) => (opts.nameRepos ? `${title} (${names([...new Set(repos)], 2)})` : title);
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  const value = (t: Theme) => t.items.reduce((s, i) => s + i.value, 0);
  const all = themesOf(items, nameRepo);
  // Security first, the catch-all last, everything else by risk removed.
  const tail = all[all.length - 1]?.title.includes("Tidy the remaining") ? [all[all.length - 1]] : [];
  const head = all.filter((t) => t.security);
  // Payments and sign-in come before other code of similar weight: a mistake there costs money
  // or locks people out, which is what their step says, so the order has to agree with it.
  const priority = (t: Theme) => value(t) * (/\b(payments|sign-in and accounts) code\b/.test(t.title) ? 3 : 1);
  const middle = all.filter((t) => !t.security && !tail.includes(t)).sort((a, b) => priority(b) - priority(a));
  const ordered = [...head, ...middle, ...tail];

  let removed = 0;
  let days = 0;
  let daysToMost: number | null = null;
  const steps: PlanStep[] = [];
  for (const t of ordered) {
    removed += value(t);
    const d = round(t.items.reduce((s, i) => s + i.days, 0));
    days += d;
    if (daysToMost === null && removed / total >= 0.8) daysToMost = round(days);
    if (steps.length < maxSteps) steps.push({ title: t.title, benefit: t.benefit, days: d, cumulativeShare: removed / total });
  }
  return { steps, daysToMost, totalDays: round(days) };
}
