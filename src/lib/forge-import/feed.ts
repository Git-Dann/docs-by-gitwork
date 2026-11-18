/**
 * Big Wedge's planning site runs a WordPress plugin ("Forge") that publishes the whole plan as
 * public JSON at /wp-json/forge/v1/items. This turns that response into a typed list, and is
 * deliberately forgiving: a field that is missing or the wrong shape is dropped, never thrown,
 * so one odd item can't stop the rest being read. Items with no id or no title are skipped and
 * counted, so the report can say what was left out rather than losing it silently.
 */

export type ForgeItemType = "feature" | "subitem" | "bug" | "feedback";

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
}

export interface ForgeRelease {
  id: string;
  version: string;
  /** "Q4: Refinement Session (Weeks 48 -> 49)" — the full name without its "v2.0.0 |" prefix. */
  name: string | null;
  startDate: string | null;
  endDate: string | null;
  links: ForgeLink[];
}

export interface ForgeFeed {
  items: ForgeItem[];
  releases: ForgeRelease[];
  /** Items with no id or no title, by type. */
  skipped: number;
}

/** The Forge endpoint starts its body with a UTF-8 byte-order mark, which JSON.parse refuses. */
export function parseForgeJson(text: string): unknown {
  return JSON.parse(text.replace(/^﻿/, ""));
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter((x): x is string => x !== null) : []);
const isoDate = (v: unknown): string | null => {
  const s = str(v);
  return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};

/** Only http(s) links survive: they go into a task description, where a javascript: URL would be live. */
export function safeHttpUrl(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
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
  for (const l of v) {
    if (!l || typeof l !== "object") continue;
    const url = safeHttpUrl((l as Record<string, unknown>).url);
    if (url) out.push({ label: str((l as Record<string, unknown>).label) ?? "", url });
  }
  return out;
}

function stageDates(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, d] of Object.entries(v as Record<string, unknown>)) {
    const iso = isoDate(d);
    if (iso) out[k] = iso;
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
      const id = str(e.id);
      const title = str(e[c.titleKey]);
      if (!id || !title) {
        skipped++;
        continue;
      }
      items.push({
        id,
        type: c.type,
        title,
        stage: str(e.workflowStage) ?? "",
        releaseId: str(e.releaseId),
        category: str(e.category),
        price: str(e.featurePrice),
        priority: str(e.priority),
        timeEstimate: num(e.timeEstimate),
        parentFeatureId: str(e.parentFeatureId),
        linkedFeatureId: str(e.linkedFeatureId),
        linkedSubItemId: str(e.linkedSubItemId),
        linkedBugId: str(e.linkedBugId),
        dependsOn: ids(e.dependsOn),
        links: links(e.links),
        images: (Array.isArray(e.images) ? e.images : []).map(safeHttpUrl).filter((u): u is string => u !== null),
        date: isoDate(e[c.dateKey]),
        stageDates: stageDates(e.stageDates),
      });
    }
  }
  const releases: ForgeRelease[] = [];
  for (const entry of Array.isArray(root.releases) ? root.releases : []) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const id = str(e.id);
    const versionNumber = str(e.versionNumber);
    if (!id || !versionNumber) continue;
    const full = str(e.name);
    // "v2.0.0 | Q4: Refinement Session (Weeks 48 -> 49)" → "Q4: Refinement Session (Weeks 48 -> 49)".
    const name = full && full.includes("|") ? full.slice(full.indexOf("|") + 1).trim() : str(e.releaseName);
    releases.push({
      id,
      version: /^v/i.test(versionNumber) ? versionNumber : `v${versionNumber}`,
      name: name || null,
      startDate: isoDate(e.startWeek),
      endDate: isoDate(e.endWeek),
      links: links(e.links),
    });
  }
  return { items, releases, skipped };
}
