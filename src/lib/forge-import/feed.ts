/**
 * Big Wedge's planning site runs a WordPress plugin ("Forge") that publishes the whole plan as
 * public JSON at /wp-json/forge/v1/items. This turns that response into a typed list, and is
 * deliberately forgiving: a field that is missing or the wrong shape is dropped, never thrown,
 * so one odd item can't stop the rest being read. Items with no id or no title are skipped and
 * counted, so the report can say what was left out rather than losing it silently.
 */

import { RELEASE_LIMITS } from "@/lib/tasks/releases";
import { KEY_DATE_LIMITS } from "@/lib/wiki-board-key-dates";

export type ForgeItemType = "feature" | "subitem" | "bug" | "feedback";

/**
 * Hard caps on what the feed may hand us. The feed is someone else's site: a single 4MB title
 * would otherwise be compared against every task on the board (matching costs length × length),
 * and a value longer than its column would be cut on save and never match itself again. A title
 * over its cap is shortened and FLAGGED, never dropped, so no item goes missing.
 */
export const FEED_LIMITS = {
  title: 500,
  id: 40,
  stage: 60,
  category: 80,
  shortValue: 20,
  label: 200,
  url: 2048,
  version: RELEASE_LIMITS.version,
  releaseName: RELEASE_LIMITS.name,
  listLength: 200,
} as const;

export interface ForgeLink {
  label: string;
  url: string;
}

export interface ForgeItem {
  id: string;
  type: ForgeItemType;
  title: string;
  stage: string;
  releaseId: string | null;
  category: string | null;
  /** free | premium | scoping (features and sub-items only). */
  price: string | null;
  priority: string | null;
  timeEstimate: number | null;
  /** Sub-item → its feature. */
  parentFeatureId: string | null;
  /** Bug / feedback → the feature (or sub-item, or bug) it's about. */
  linkedFeatureId: string | null;
  linkedSubItemId: string | null;
  linkedBugId: string | null;
  dependsOn: string[];
  links: ForgeLink[];
  images: string[];
  /** createdDate (features) or reportedDate (bugs, feedback). */
  date: string | null;
  stageDates: Record<string, string>;
  /** The title was longer than FEED_LIMITS.title and has been shortened (the plan says so). */
  truncated: boolean;
}

export interface ForgeRelease {
  id: string;
  version: string;
  /** "Q4: Refinement Session (Weeks 48 -> 49)" — the full name without its "v2.0.0 |" prefix. */
  name: string | null;
  startDate: string | null;
  endDate: string | null;
  links: ForgeLink[];
  /** The release document: the first link labelled like one ("Release Doc"), else the first link. */
  docUrl: string | null;
}

/** A dated event on the planning tool's calendar ("companyDates": content drops, events). */
export interface ForgeKeyDate {
  id: string;
  title: string;
  /** YYYY-MM-DD, or null when the feed's date is unusable. */
  date: string | null;
}

export interface ForgeFeed {
  items: ForgeItem[];
  releases: ForgeRelease[];
  /** The planning tool's own calendar dates, for the Board's Schedule (key dates). */
  keyDates: ForgeKeyDate[];
  /** Items with no id or no title, by type. */
  skipped: number;
}

/** The Forge endpoint starts its body with a UTF-8 byte-order mark, which JSON.parse refuses. */
export function parseForgeJson(text: string): unknown {
  return JSON.parse(text.replace(/^﻿/, ""));
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);
/** A string capped at `max` characters (a value is never longer than where it's stored). */
const capped = (v: unknown, max: number): string | null => {
  const s = str(v);
  return s === null ? null : s.slice(0, max).trim() || null;
};
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const ids = (v: unknown): string[] =>
  Array.isArray(v)
    ? v
        .slice(0, FEED_LIMITS.listLength)
        .map((x) => capped(x, FEED_LIMITS.id))
        .filter((x): x is string => x !== null)
    : [];
const isoDate = (v: unknown): string | null => {
  const s = str(v);
  return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};

/** Only http(s) links survive: they go into a task description, where a javascript: URL would be live. */
export function safeHttpUrl(v: unknown): string | null {
  const s = str(v);
  if (!s || s.length > FEED_LIMITS.url) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function links(v: unknown): ForgeLink[] {
  if (!Array.isArray(v)) return [];
  const out: ForgeLink[] = [];
  for (const l of v.slice(0, FEED_LIMITS.listLength)) {
    if (!l || typeof l !== "object") continue;
    const url = safeHttpUrl((l as Record<string, unknown>).url);
    if (url) out.push({ label: capped((l as Record<string, unknown>).label, FEED_LIMITS.label) ?? "", url });
  }
  return out;
}

function stageDates(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, d] of Object.entries(v as Record<string, unknown>).slice(0, FEED_LIMITS.listLength)) {
    const iso = isoDate(d);
    if (iso) out[k.slice(0, FEED_LIMITS.stage)] = iso;
  }
  return out;
}

const COLLECTIONS: Array<{ key: string; type: ForgeItemType; titleKey: "name" | "title"; dateKey: string }> = [
  { key: "features", type: "feature", titleKey: "name", dateKey: "createdDate" },
  { key: "subitems", type: "subitem", titleKey: "name", dateKey: "createdDate" },
  { key: "bugs", type: "bug", titleKey: "title", dateKey: "reportedDate" },
  { key: "feedback", type: "feedback", titleKey: "title", dateKey: "reportedDate" },
];

export function parseForgeFeed(raw: unknown): ForgeFeed {
  const root = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const items: ForgeItem[] = [];
  let skipped = 0;
  for (const c of COLLECTIONS) {
    const list = Array.isArray(root[c.key]) ? (root[c.key] as unknown[]) : [];
    for (const entry of list) {
      if (!entry || typeof entry !== "object") {
        skipped++;
        continue;
      }
      const e = entry as Record<string, unknown>;
      const id = capped(e.id, FEED_LIMITS.id);
      const rawTitle = str(e[c.titleKey]);
      if (!id || !rawTitle) {
        skipped++;
        continue;
      }
      const truncated = rawTitle.length > FEED_LIMITS.title;
      items.push({
        id,
        type: c.type,
        title: truncated ? rawTitle.slice(0, FEED_LIMITS.title).trim() : rawTitle,
        stage: capped(e.workflowStage, FEED_LIMITS.stage) ?? "",
        releaseId: capped(e.releaseId, FEED_LIMITS.id),
        category: capped(e.category, FEED_LIMITS.category),
        price: capped(e.featurePrice, FEED_LIMITS.shortValue),
        priority: capped(e.priority, FEED_LIMITS.shortValue),
        timeEstimate: num(e.timeEstimate),
        parentFeatureId: capped(e.parentFeatureId, FEED_LIMITS.id),
        linkedFeatureId: capped(e.linkedFeatureId, FEED_LIMITS.id),
        linkedSubItemId: capped(e.linkedSubItemId, FEED_LIMITS.id),
        linkedBugId: capped(e.linkedBugId, FEED_LIMITS.id),
        dependsOn: ids(e.dependsOn),
        links: links(e.links),
        images: (Array.isArray(e.images) ? e.images.slice(0, FEED_LIMITS.listLength) : [])
          .map(safeHttpUrl)
          .filter((u): u is string => u !== null),
        date: isoDate(e[c.dateKey]),
        stageDates: stageDates(e.stageDates),
        truncated,
      });
    }
  }
  const releases: ForgeRelease[] = [];
  for (const entry of Array.isArray(root.releases) ? root.releases : []) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const id = capped(e.id, FEED_LIMITS.id);
    const versionNumber = str(e.versionNumber);
    if (!id || !versionNumber) continue;
    const full = str(e.name);
    // "v2.0.0 | Q4: Refinement Session (Weeks 48 -> 49)" → "Q4: Refinement Session (Weeks 48 -> 49)".
    const name = full && full.includes("|") ? full.slice(full.indexOf("|") + 1).trim() : str(e.releaseName);
    const releaseLinks = links(e.links);
    releases.push({
      id,
      // Capped here, to the column's own length, so the value stored is the value read: a value
      // cut only on save would never match the feed again.
      version: (/^v/i.test(versionNumber) ? versionNumber : `v${versionNumber}`).slice(0, FEED_LIMITS.version),
      name: name ? name.slice(0, FEED_LIMITS.releaseName).trim() || null : null,
      startDate: isoDate(e.startWeek),
      endDate: isoDate(e.endWeek),
      links: releaseLinks,
      docUrl: (releaseLinks.find((l) => /\bdoc/i.test(l.label)) ?? releaseLinks[0])?.url ?? null,
    });
  }
  const keyDates: ForgeKeyDate[] = [];
  for (const entry of (Array.isArray(root.companyDates) ? root.companyDates : []).slice(0, FEED_LIMITS.listLength)) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const id = capped(e.id, FEED_LIMITS.id);
    const title = capped(e.title, KEY_DATE_LIMITS.title);
    if (!id || !title) continue;
    keyDates.push({ id, title, date: isoDate(e.date) });
  }
  return { items, releases, keyDates, skipped };
}
