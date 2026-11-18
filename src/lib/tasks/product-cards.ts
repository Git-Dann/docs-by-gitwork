/**
 * Product cards and the dev tasks that deliver them (CLAUDE.md §124). Pure: no Prisma, no React.
 *
 * Two levels of work live on one board. A client plans PRODUCT CARDS — "Tee Shot Planner", a
 * bug, a piece of feedback — and the developers break each one into DEV TASKS split by platform
 * and step ("Calculate tee shot planner", "Tee Shot Planner - IOS"). Before this, both were
 * plain tasks with different names, so the client's plan and the devs' work could not be lined
 * up (Wedge, Nov 2026: 16 of 199 items matched by name).
 *
 * A task is a product card when it has an `itemType`. A dev task points at the card it
 * delivers with `productCardId` and stays exactly where it is: never re-parented, because
 * subtasks are hidden from the board and a dev task that vanished from it would be lost work.
 * The card's progress is derived from its linked tasks, never stored.
 */

import type { TaskStatus } from "@/types/tasks";

export const ITEM_TYPES = ["feature", "subitem", "bug", "feedback"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  feature: "Feature",
  subitem: "Sub-item",
  bug: "Bug",
  feedback: "Feedback",
};

export const TIERS = ["free", "premium", "scoping"] as const;
export type Tier = (typeof TIERS)[number];

export const TIER_LABELS: Record<Tier, string> = {
  free: "Free",
  premium: "Premium",
  scoping: "Scoping",
};

export const PRODUCT_CARD_LIMITS = { area: 80, estimateHours: 10_000 } as const;

export function isItemType(v: unknown): v is ItemType {
  return typeof v === "string" && (ITEM_TYPES as readonly string[]).includes(v);
}

export function isTier(v: unknown): v is Tier {
  return typeof v === "string" && (TIERS as readonly string[]).includes(v);
}

/** A task is a product card when it has an item type. */
export function isProductCard(task: { itemType?: string | null }): boolean {
  return isItemType(task.itemType);
}

export interface CardProgress {
  /** Dev tasks linked to the card (archived ones excluded by the caller). */
  linked: number;
  done: number;
  doing: number;
}

/** A card's progress from its linked dev tasks. Null when nothing is linked: "no tasks" is not "0%". */
export function cardProgress(statuses: readonly TaskStatus[]): CardProgress | null {
  if (statuses.length === 0) return null;
  let done = 0;
  let doing = 0;
  for (const s of statuses) {
    if (s === "DONE") done++;
    else if (s === "DOING" || s === "IN_REVIEW" || s === "UI_DONE") doing++;
  }
  return { linked: statuses.length, done, doing };
}

export interface LinkCandidate {
  id: string;
  clientId: string;
  itemType: string | null;
  productCardId: string | null;
}

/**
 * Why a dev task can't be linked to this card, as a sentence, or null when it can.
 *
 * One level only: a card links to nothing, so following links can never loop and a card's
 * progress never counts the same work twice.
 */
export function linkProblem(
  task: { id: string | null; clientId: string; isCard: boolean },
  card: LinkCandidate | null,
): string | null {
  if (!card) return "That card doesn't exist.";
  if (task.id && card.id === task.id) return "A task can't deliver itself.";
  if (card.clientId !== task.clientId) return "A task can only deliver a card on the same client.";
  if (!isProductCard(card)) return "Link to a product card (a task with a type such as Feature or Bug).";
  if (card.productCardId) return "That card is itself linked to another card. Link to the top card instead.";
  if (task.isCard) return "A product card can't deliver another card. Remove its type first, or link its dev tasks.";
  return null;
}
