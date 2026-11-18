/**
 * The import plan: for every item on Big Wedge's planning board, what the import would do on
 * the Wedge board. Pure — it reads the feed and a snapshot of the board and writes nothing; the
 * dry run IS this function, and the apply step re-computes it against the live board before
 * acting, so applying twice does nothing the second time.
 *
 * The rules (Dan, Nov 2026):
 *   - Every item becomes a PRODUCT CARD (a task with an itemType), in its own column.
 *   - The team's own tasks are never moved, reparented, archived or deleted. A dev task that is
 *     the same work is LINKED to the card (Task.productCardId) and stays exactly where it is.
 *   - Only an EXACT title match is acted on without a person looking. Anything looser, and any
 *     match that isn't one-to-one, waits in the review list until it's decided.
 *   - An item imported before (externalRef "forge:<id>") is never imported again; its card only
 *     gets fields that are still empty. Nothing the team has changed is overwritten.
 */

import type { BoardColumnDef } from "@/lib/tasks/board-columns";
import { columnNameKey } from "@/lib/tasks/board-columns";
import type { TaskPriority, TaskStatus } from "@/types/tasks";
import type { ForgeFeed, ForgeItem, ForgeItemType, ForgeRelease } from "./feed";
import { compareTitles, titled, type MatchKind, type Titled } from "./match";
import { placementFor, requiredColumns } from "./stages";

export const FORGE_REF_PREFIX = "forge:";

export function forgeRef(id: string): string {
  return `${FORGE_REF_PREFIX}${id}`;
}

/** The slice of a Foundry task the plan needs. */
export interface BoardTask {
  id: string;
  title: string;
  status: TaskStatus | string;
  parentId: string | null;
  archived: boolean;
  itemType: string | null;
  productCardId: string | null;
  externalRef: string | null;
  description: string | null;
  releaseId: string | null;
  tier: string | null;
  area: string | null;
  estimateHours: number | null;
  /**
   * Fields the importer has already filled on this task (metadata.forge.filled). Never filled
   * again: a value the team CLEARED stays cleared.
   */
  forgeFilled: string[];
}

export interface BoardRelease {
  id: string;
  version: string;
  name: string | null;
  externalRef: string | null;
  docUrl: string | null;
}

export type ReviewDecision = { forgeId: string; decision: string };

export type PlanAction = "create" | "link" | "already-imported" | "review" | "skip" | "waiting";

export interface TaskRef {
  id: string;
  title: string;
  status: string;
  archived: boolean;
}

export interface CardFields {
  title: string;
  description: string;
  status: TaskStatus;
  /** Board column by name, or null for the status's own lane. */
  column: string | null;
  priority: TaskPriority;
  itemType: ForgeItemType;
  tier: string | null;
  area: string | null;
  estimateHours: number | null;
  externalRef: string;
  /** The Forge release id; the apply step resolves it to a ClientRelease. */
  releaseForgeId: string | null;
  /** A sub-item's feature (Forge id); the apply step makes the card its subtask. */
  parentForgeId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  metadata: Record<string, unknown>;
}

export interface PlanItem {
  forgeId: string;
  forgeType: ForgeItemType;
  title: string;
  stage: string;
  stageKnown: boolean;
  action: PlanAction;
  /** link: the existing task that becomes the card. already-imported: the card made last time. */
  target: TaskRef | null;
  /** Dev tasks that will be linked to this card (productCardId), staying where they are. */
  devLinks: TaskRef[];
  /** review: the suggestions, best first. */
  candidates: Array<TaskRef & { kind: MatchKind; score: number; why: string }>;
  reason: string | null;
  card: CardFields;
  /** already-imported / link: the empty fields that would be filled. */
  fill: string[];
  /** Things a person should know about this item (an odd value in the feed, a shortened title). */
  warnings: string[];
}

export interface PlanRelease {
  forgeId: string;
  version: string;
  name: string | null;
  startDate: string | null;
  endDate: string | null;
  docLinks: string[];
  /** The release document, kept on the release (ClientRelease.docUrl). */
  docUrl: string | null;
  externalRef: string;
  /**
   * The client's release this one IS: the one carrying its Forge id, or else the one release
   * with the same version and name that came from nowhere else. Null → it will be created.
   */
  existingId: string | null;
  /** The existing release doesn't carry the Forge id yet; applying stamps it. */
  stampRef: boolean;
}

export interface ForgePlan {
  counts: {
    considered: number;
    create: number;
    link: number;
    alreadyImported: number;
    review: number;
    skip: number;
    devLinks: number;
    waiting: number;
    releasesToCreate: number;
    unknownStages: number;
    skippedFromFeed: number;
  };
  /** Board columns the import needs that the board doesn't have. Non-empty → apply refuses. */
  missingColumns: string[];
  releases: PlanRelease[];
  items: PlanItem[];
}

/** ⚠️ A Map, not an object: these keys come from someone else's feed ("constructor", "__proto__"). */
const PRIORITY = new Map<string, TaskPriority>([
  ["high", "HIGH"],
  ["medium", "MEDIUM"],
  ["low", "LOW"],
]);
const TIERS = new Set(["free", "premium", "scoping"]);

function ref(t: BoardTask): TaskRef {
  return { id: t.id, title: t.title, status: String(t.status), archived: t.archived };
}

const normName = (s: string | null) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const normVersion = (v: string) => v.trim().toLowerCase().replace(/^v(?=\d)/, "");

/**
 * Which of the client's releases each Forge release is.
 *
 * The Forge id is the key (ClientRelease.externalRef). Only a release that came from nowhere
 * (no externalRef) can be recognised by version + name, and only one Forge release may claim
 * it — so two Forge releases with the same version and name never collapse into one, and a
 * release someone renamed in Foundry is still found by its id, not re-created.
 */
function planReleases(feed: ForgeFeed, existing: BoardRelease[]): PlanRelease[] {
  const byRef = new Map(existing.filter((e) => e.externalRef).map((e) => [e.externalRef as string, e]));
  const claimed = new Set<string>();
  for (const r of feed.releases) {
    const e = byRef.get(forgeRef(r.id));
    if (e) claimed.add(e.id);
  }
  return feed.releases.map((r: ForgeRelease) => {
    const externalRef = forgeRef(r.id);
    const base = {
      forgeId: r.id,
      version: r.version,
      name: r.name,
      startDate: r.startDate,
      endDate: r.endDate,
      docLinks: r.links.map((l) => l.url),
      docUrl: r.docUrl,
      externalRef,
    };
    const own = byRef.get(externalRef);
    if (own) return { ...base, existingId: own.id, stampRef: false };
    // Version alone isn't enough: Big Wedge has five releases called v2.0.0, told apart by name.
    const match = existing.filter(
      (e) =>
        !e.externalRef &&
        !claimed.has(e.id) &&
        normVersion(e.version) === normVersion(r.version) &&
        normName(e.name) === normName(r.name),
    );
    if (match.length === 1) {
      claimed.add(match[0].id);
      return { ...base, existingId: match[0].id, stampRef: true };
    }
    return { ...base, existingId: null, stampRef: false };
  });
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "link";
  }
}

/** Markdown in the subset task descriptions render (§41): bullets and links only. */
export function describeItem(item: ForgeItem, titleById: Map<string, string>): string {
  const lines: string[] = [];
  const about = [item.linkedFeatureId, item.linkedSubItemId, item.linkedBugId]
    .map((id) => (id ? titleById.get(id) : undefined))
    .filter((t): t is string => Boolean(t));
  if (about.length) lines.push(`About: ${about.join(", ")}`);
  const deps = item.dependsOn.map((id) => titleById.get(id) ?? `#${id}`);
  if (deps.length) lines.push(`Depends on: ${deps.join(", ")}`);
  if (item.links.length || item.images.length) {
    if (lines.length) lines.push("");
    for (const l of item.links) lines.push(`- [${(l.label || hostLabel(l.url)).replace(/[[\]]/g, "")}](${l.url})`);
    item.images.forEach((url, i) => lines.push(`- [Screenshot${item.images.length > 1 ? ` ${i + 1}` : ""}](${url})`));
  }
  if (lines.length) lines.push("");
  lines.push(`Imported from Big Wedge's planning board (Forge #${item.id}).`);
  return lines.join("\n");
}

function cardFor(
  item: ForgeItem,
  feed: ForgeFeed,
  titleById: Map<string, string>,
): { card: CardFields; known: boolean; warnings: string[] } {
  const { placement, known } = placementFor(item.stage);
  const warnings: string[] = [];
  const priorityKey = (item.priority ?? "").toLowerCase();
  const priority = PRIORITY.get(priorityKey);
  if (item.priority && !priority) warnings.push(`Priority "${item.priority}" isn't high, medium or low, so it's Medium.`);
  if (item.truncated) warnings.push("The title was very long and has been shortened.");
  const release = item.releaseId ? feed.releases.find((r) => r.id === item.releaseId) : undefined;
  const completedAt =
    placement.status === "DONE"
      ? item.stageDates["live-features"] ?? release?.endDate ?? item.date ?? null
      : null;
  return {
    known,
    warnings,
    card: {
      title: item.title.slice(0, 200),
      description: describeItem(item, titleById),
      status: placement.status,
      column: placement.column,
      priority: priority ?? "MEDIUM",
      itemType: item.type,
      tier: item.price && TIERS.has(item.price.toLowerCase()) ? item.price.toLowerCase() : null,
      area: item.category ? item.category.slice(0, 80) : null,
      estimateHours: item.timeEstimate && item.timeEstimate > 0 ? item.timeEstimate : null,
      externalRef: forgeRef(item.id),
      releaseForgeId: release ? release.id : null,
      parentForgeId: item.type === "subitem" ? item.parentFeatureId : null,
      startedAt: placement.status === "DOING" ? item.stageDates["in-development"] ?? null : null,
      completedAt,
      metadata: {
        forge: {
          id: item.id,
          type: item.type,
          stage: item.stage,
          stageDates: item.stageDates,
          releaseId: item.releaseId,
          price: item.price,
          category: item.category,
        },
      },
    },
  };
}

/**
 * Fields of an existing card that are still empty and would be filled. A field the importer
 * filled before is never filled again (the team may have cleared it on purpose). The board
 * column and status are never filled on an existing task: where a task sits is the team's call.
 */
export function fillFor(t: BoardTask, card: CardFields, releaseResolvable: boolean): string[] {
  const out: string[] = [];
  if (!t.itemType) out.push("itemType");
  if (!t.externalRef) out.push("externalRef");
  if (!t.tier && card.tier) out.push("tier");
  if (!t.area && card.area) out.push("area");
  if (t.estimateHours == null && card.estimateHours != null) out.push("estimateHours");
  if (!t.releaseId && card.releaseForgeId && releaseResolvable) out.push("releaseId");
  if (!t.description?.trim()) out.push("description");
  const done = new Set(t.forgeFilled);
  return out.filter((f) => !done.has(f));
}

/** Plan actions after which an item has a card on the board (made now, linked, or made before). */
const HAS_CARD: ReadonlySet<PlanAction> = new Set(["create", "link", "already-imported"]);

export function buildForgePlan(input: {
  feed: ForgeFeed;
  tasks: BoardTask[];
  releases: BoardRelease[];
  columns: BoardColumnDef[];
  decisions?: ReviewDecision[];
}): ForgePlan {
  const { feed, tasks } = input;
  const have = new Set(input.columns.map((c) => columnNameKey(c.name)));
  const missingColumns = requiredColumns().filter((n) => !have.has(columnNameKey(n)));
  const releases = planReleases(feed, input.releases);
  const titleById = new Map(feed.items.map((i) => [i.id, i.title]));
  const decisions = new Map((input.decisions ?? []).map((d) => [d.forgeId, d.decision]));
  const taskById = new Map(tasks.map((t) => [t.id, t]));

  // 1. Already imported: the card carries the Forge id.
  const imported = new Map<string, BoardTask>();
  for (const t of tasks) {
    if (t.externalRef?.startsWith(FORGE_REF_PREFIX)) imported.set(t.externalRef.slice(FORGE_REF_PREFIX.length), t);
  }

  // 2. Title matches against the team's own tasks. Cards are never matched: they're the plan,
  // not the work, and a card can't deliver another card.
  const devTasks = tasks.filter((t) => !t.itemType && !t.externalRef);
  const devTitled: Array<{ t: BoardTask; tt: Titled }> = devTasks.map((t) => ({ t, tt: titled(t.title) }));
  const matches = new Map<string, Array<{ t: BoardTask; kind: MatchKind; score: number; why: string }>>();
  const byTask = new Map<string, string[]>();
  for (const item of feed.items) {
    if (imported.has(item.id)) continue;
    const it = titled(item.title);
    const found: Array<{ t: BoardTask; kind: MatchKind; score: number; why: string }> = [];
    for (const { t, tt } of devTitled) {
      const m = compareTitles(it, tt);
      if (m) found.push({ t, ...m });
    }
    found.sort((a, b) => b.score - a.score);
    matches.set(item.id, found);
    for (const f of found) byTask.set(f.t.id, [...(byTask.get(f.t.id) ?? []), item.id]);
  }

  const claimed = new Set<string>();
  const items: PlanItem[] = [];
  let unknownStages = 0;

  const actionByForge = new Map<string, PlanAction>();
  const feedIds = new Set(feed.items.map((i) => i.id));
  const push = (p: PlanItem) => {
    // A sub-item becomes a SUBTASK of its feature's card, so it can't be made before that card
    // exists. One whose feature is waiting in review (or skipped, or itself waiting) waits too,
    // and is made on the run after its feature's card is.
    if (p.forgeType === "subitem" && p.action === "create" && p.card.parentForgeId) {
      const parent = p.card.parentForgeId;
      if (feedIds.has(parent) && !HAS_CARD.has(actionByForge.get(parent) as PlanAction)) {
        p = {
          ...p,
          action: "waiting",
          devLinks: [],
          reason: [p.reason, "Waiting for its feature's card, which hasn't been decided yet; it's made on the run after."]
            .filter(Boolean)
            .join(" "),
        };
      }
    }
    if (p.forgeType === "subitem" && p.card.parentForgeId && !feedIds.has(p.card.parentForgeId)) {
      p = { ...p, warnings: [...p.warnings, "Its feature isn't in the feed, so it's a card of its own."] };
    }
    actionByForge.set(p.forgeId, p.action);
    items.push(p);
  };

  // Features first, so a sub-item knows what happened to its feature.
  const ordered = [...feed.items].sort((a, b) => Number(a.type === "subitem") - Number(b.type === "subitem"));
  for (const item of ordered) {
    const { card, known, warnings } = cardFor(item, feed, titleById);
    if (!known) unknownStages++;
    const base = {
      forgeId: item.id,
      forgeType: item.type,
      title: item.title,
      stage: item.stage,
      stageKnown: known,
      target: null as TaskRef | null,
      devLinks: [] as TaskRef[],
      candidates: [] as PlanItem["candidates"],
      reason: known ? null : `Stage "${item.stage}" isn't one of the twelve, so it goes in Future Idea.`,
      card,
      fill: [] as string[],
      warnings,
    };

    const prev = imported.get(item.id);
    if (prev) {
      const releaseResolvable = Boolean(card.releaseForgeId);
      const fill = fillFor(prev, card, releaseResolvable).filter((f) => f !== "itemType" && f !== "externalRef");
      // A sub-item card left without its feature (made before its feature's card existed) is
      // attached once the feature has a card — unless that was done before and undone.
      if (
        item.type === "subitem" &&
        !prev.parentId &&
        card.parentForgeId &&
        HAS_CARD.has(actionByForge.get(card.parentForgeId) as PlanAction) &&
        !prev.forgeFilled.includes("parentId")
      ) {
        fill.push("parentId");
      }
      push({ ...base, action: "already-imported", target: ref(prev), fill });
      continue;
    }

    const found = matches.get(item.id) ?? [];
    const candidates = found.map((f) => ({ ...ref(f.t), kind: f.kind, score: f.score, why: f.why }));

    // Accept one task as "the same work": it becomes the card when it can, else it's linked.
    const accept = (t: BoardTask, why: string): PlanItem => {
      claimed.add(t.id);
      const canBecomeCard = item.type !== "subitem" && !t.parentId && !t.archived && !t.productCardId;
      if (canBecomeCard) {
        const note =
          String(t.status) !== card.status
            ? `Kept at ${t.status} on the board (Big Wedge has it in ${item.stage}); move it if theirs is right.`
            : null;
        return { ...base, action: "link", target: ref(t), candidates, reason: [why, note].filter(Boolean).join(" "), fill: fillFor(t, card, Boolean(card.releaseForgeId)) };
      }
      const devLinks = t.productCardId ? [] : [ref(t)];
      const whyNot = t.productCardId
        ? `"${t.title}" already delivers another card, so it isn't linked.`
        : item.type === "subitem"
          ? `"${t.title}" stays where it is and is linked to the new sub-item card.`
          : `"${t.title}" is ${t.archived ? "archived" : "a subtask"}, so a new card is made and it's linked to it.`;
      return { ...base, action: "create", devLinks, candidates, reason: [why, whyNot].join(" ") };
    };

    const decision = decisions.get(item.id);
    if (decision) {
      if (decision === "skip") {
        push({ ...base, action: "skip", candidates, reason: "Skipped in review." });
        continue;
      }
      if (decision === "create") {
        push({ ...base, action: "create", candidates, reason: "New card, as decided in review." });
        continue;
      }
      const chosen = taskById.get(decision);
      if (!chosen || chosen.itemType || chosen.externalRef) {
        push({ ...base, action: "review", candidates, reason: "The task chosen in review isn't a team task on this board." });
        continue;
      }
      if (claimed.has(chosen.id)) {
        push({ ...base, action: "review", candidates, reason: `"${chosen.title}" was already chosen for another item.` });
        continue;
      }
      push(accept(chosen, "Matched in review."));
      continue;
    }

    if (found.length === 0) {
      push({ ...base, action: "create", reason: base.reason });
      continue;
    }
    const sharedTask = found.some((f) => (byTask.get(f.t.id) ?? []).length > 1);
    if (found.length > 1 || sharedTask) {
      const why =
        found.length > 1
          ? `${found.length} tasks look like this item.`
          : "The matching task also looks like another item.";
      push({ ...base, action: "review", candidates, reason: why });
      continue;
    }
    if (claimed.has(found[0].t.id)) {
      push({ ...base, action: "review", candidates, reason: `"${found[0].t.title}" was already chosen for another item.` });
      continue;
    }
    if (found[0].kind !== "exact") {
      push({ ...base, action: "review", candidates, reason: `Close but not the same title (${found[0].why}).` });
      continue;
    }
    push(accept(found[0].t, "Same title as an existing task."));
  }

  const count = (a: PlanAction) => items.filter((i) => i.action === a).length;
  return {
    counts: {
      considered: feed.items.length,
      create: count("create"),
      link: count("link"),
      alreadyImported: count("already-imported"),
      review: count("review"),
      skip: count("skip"),
      devLinks: items.reduce((n, i) => n + i.devLinks.length, 0),
      waiting: count("waiting"),
      releasesToCreate: releases.filter((r) => !r.existingId).length,
      unknownStages,
      skippedFromFeed: feed.skipped,
    },
    missingColumns,
    releases,
    items,
  };
}
