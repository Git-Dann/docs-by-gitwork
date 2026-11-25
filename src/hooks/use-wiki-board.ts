"use client";

/**
 * The client Board's reads and writes (src/server/wiki-board.ts). One component serves both
 * audiences, so the calls go through a target:
 *   - public:   the client on their wiki link → /api/wiki/[token]/board/… (hardened posture)
 *   - internal: the team on the internal wiki → the task routes they already use, and the
 *               Board's own card routes (/api/clients/[slug]/wiki/board/cards/…) to add,
 *               edit, delete and restore cards
 */

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { FeedbackKind } from "@/lib/wiki-board";
import type { DashboardLayout } from "@/lib/wiki-dashboard-layout";
import { DONE_PAGE_MAX, type DoneLaneKind, type DoneLanePage } from "@/lib/wiki-board-layout";
import type { TaskPriority, TaskStatus } from "@/types/tasks";
import type { WikiBoardCard, WikiBoardFeedback, WikiBoardKeyDate, WikiBoardSection } from "@/types/wiki-board";

export type BoardTarget = { mode: "public"; token: string } | { mode: "internal"; slug: string };

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

function feedbackUrl(target: BoardTarget, taskId: string): string {
  return target.mode === "public"
    ? `/api/wiki/${encodeURIComponent(target.token)}/board/tasks/${encodeURIComponent(taskId)}/feedback`
    : `/api/tasks/${encodeURIComponent(taskId)}/client-feedback`;
}

/**
 * A card image's address. The client's page reads it through its own link; the team's wiki reads
 * the task's attachment. A value that's already a path (the demo's sample image) is used as is.
 */
export function boardImageUrl(target: BoardTarget, taskId: string, image: string, thumb: boolean): string {
  if (image.startsWith("/") || image.startsWith("blob:")) return image;
  const q = thumb ? "?thumb=1" : "";
  return target.mode === "public"
    ? `/api/wiki/${encodeURIComponent(target.token)}/board/tasks/${encodeURIComponent(taskId)}/images/${encodeURIComponent(image)}${q}`
    : `/api/tasks/${encodeURIComponent(taskId)}/attachments/${encodeURIComponent(image)}${q}`;
}

/**
 * The Board's cards, loaded on their own: the wiki sends only a summary (CLAUDE.md §140). The
 * team's key sits under the wiki's, so `useBoardRefresh` (which refreshes the wiki) refreshes
 * this too. The client's page reads its own link's copy.
 */
export function useBoardCards(target: BoardTarget) {
  return useQuery({
    queryKey: target.mode === "internal" ? ["client-wiki", target.slug, "board"] : ["public-wiki", target.token, "board"],
    queryFn: () =>
      apiFetch<WikiBoardSection>(
        target.mode === "internal"
          ? `/api/clients/${encodeURIComponent(target.slug)}/wiki/board`
          : `/api/wiki/${encodeURIComponent(target.token)}/board`,
      ),
    staleTime: 30_000,
  });
}

/** Re-read the board after a write. Both pages read the cards through a query; nothing reloads the page. */
export function useBoardRefresh(target: BoardTarget): () => void {
  const queryClient = useQueryClient();
  const key = target.mode === "internal" ? target.slug : target.token;
  const mode = target.mode;
  return useCallback(() => {
    if (mode === "internal") {
      void queryClient.invalidateQueries({ queryKey: ["client-wiki", key] });
      // The team's own board shows the client's sign-off too.
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    } else {
      // Only the Board's own query. The cards are loaded on their own (§140), so re-rendering the
      // whole server page (router.refresh) redrew everything and read as the page reloading every
      // time a client approved or moved a card.
      void queryClient.invalidateQueries({ queryKey: ["public-wiki", key, "board"] });
    }
  }, [mode, key, queryClient]);
}

export function useBoardFeedback(target: BoardTarget, taskId: string | null) {
  const key = target.mode === "internal" ? target.slug : target.token;
  return useQuery({
    queryKey: ["wiki-board-feedback", target.mode, key, taskId],
    queryFn: () => apiFetch<{ feedback: WikiBoardFeedback[] }>(feedbackUrl(target, taskId!)),
    enabled: Boolean(taskId),
    staleTime: 15_000,
  });
}

export function useSendBoardFeedback(target: BoardTarget, taskId: string) {
  const queryClient = useQueryClient();
  const refresh = useBoardRefresh(target);
  const key = target.mode === "internal" ? target.slug : target.token;
  return useMutation({
    mutationFn: (input: { kind: FeedbackKind; body: string }) =>
      apiFetch<{ entry: WikiBoardFeedback }>(
        feedbackUrl(target, taskId),
        json(target.mode === "public" ? input : { body: input.body }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["wiki-board-feedback", target.mode, key, taskId] });
      refresh();
    },
  });
}

/** Move a card. The caller applies the move optimistically and rolls back if this throws. */
export async function moveBoardCardApi(
  target: BoardTarget,
  card: { id: string },
  lane: { key: string; stage: TaskStatus; columnId: string | null },
  orderKey: number,
): Promise<void> {
  if (target.mode === "public") {
    await apiFetch(
      `/api/wiki/${encodeURIComponent(target.token)}/board/tasks/${encodeURIComponent(card.id)}/move`,
      json({ laneKey: lane.key, orderKey }),
    );
  } else {
    await apiFetch(
      `/api/tasks/${encodeURIComponent(card.id)}/move`,
      json({ status: lane.stage, orderKey, boardColumnId: lane.columnId }),
    );
  }
}

/** The fields a card is added or edited with. Never an assignee: that stays the team's (§126). */
export interface BoardCardForm {
  title: string;
  itemType: "feature" | "subitem" | "bug" | "feedback";
  laneKey: string;
  parentId: string | null;
  releaseId: string | null;
  tier: string | null;
  area: string | null;
  /** The named list the card belongs to; the Table view groups by it. */
  list: string | null;
  priority: TaskPriority;
  estimateHours: number | null;
  dueDate: string | null;
  description: string;
  links: string[];
  dependsOn: string[];
}

function cardsUrl(target: BoardTarget): string {
  return target.mode === "public"
    ? `/api/wiki/${encodeURIComponent(target.token)}/board/tasks`
    : `/api/clients/${encodeURIComponent(target.slug)}/wiki/board/cards`;
}

function cardUrl(target: BoardTarget, taskId: string): string {
  return `${cardsUrl(target)}/${encodeURIComponent(taskId)}`;
}

/**
 * What adding a card did. A client's Bug or Feedback is logged in Requests rather than put on the
 * board (Decision B, CLAUDE.md §134): then `card` is null and `request` names what was logged.
 */
export type BoardAddResult =
  | { card: WikiBoardCard; request: null }
  | { card: null; request: { id: string; title: string } };

/** Add a card: the client on their link, or the team on the internal wiki. */
export async function addBoardCardApi(target: BoardTarget, input: BoardCardForm): Promise<BoardAddResult> {
  const res = await apiFetch<{ card: WikiBoardCard | null; request?: { id: string; title: string } | null }>(
    cardsUrl(target),
    json({
      ...input,
      parentId: input.itemType === "subitem" ? input.parentId : null,
      releaseId: input.releaseId || null,
      area: input.area?.trim() || null,
      list: input.list?.trim() || null,
      description: input.description.trim() || null,
    }),
  );
  return res.card ? { card: res.card, request: null } : { card: null, request: res.request! };
}

/** The toast for a card that went to Requests instead of the board. */
export const LOGGED_AS_REQUEST = {
  title: "Logged in Requests",
  body: "Bugs and feedback go to Requests, where the team picks them up and adds them to the board.",
};

/** Edit a card. Only the fields given change. */
export async function updateBoardCardApi(
  target: BoardTarget,
  taskId: string,
  patch: Partial<Omit<BoardCardForm, "laneKey" | "parentId">>,
): Promise<WikiBoardCard> {
  const res = await apiFetch<{ card: WikiBoardCard }>(cardUrl(target, taskId), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return res.card;
}

/** Delete a card (soft). The team can restore it from the internal wiki. */
export async function deleteBoardCardApi(target: BoardTarget, taskId: string): Promise<void> {
  await apiFetch(cardUrl(target, taskId), { method: "DELETE" });
}

/** Add screenshots to a card. */
export async function uploadBoardImagesApi(target: BoardTarget, taskId: string, files: File[]): Promise<WikiBoardCard> {
  const form = new FormData();
  for (const f of files) form.append("file", f);
  const res = await apiFetch<{ card: WikiBoardCard }>(`${cardUrl(target, taskId)}/images`, { method: "POST", body: form });
  return res.card;
}

/**
 * Attach a screenshot to a request a client's bug card became (§134). A request holds one
 * image, so this sends the first; the caller says so when there were more.
 */
export async function uploadRequestImageApi(target: BoardTarget, requestId: string, file: File): Promise<void> {
  if (target.mode !== "public") return;
  const form = new FormData();
  form.append("file", file);
  await apiFetch(`/api/wiki/${encodeURIComponent(target.token)}/intake-items/${encodeURIComponent(requestId)}/image`, {
    method: "POST",
    body: form,
  });
}

/** Take a screenshot off a card. Answers with the card as the caller may see it. */
export async function removeBoardImageApi(target: BoardTarget, taskId: string, imageId: string): Promise<WikiBoardCard> {
  const res = await apiFetch<{ card: WikiBoardCard }>(`${cardUrl(target, taskId)}/images/${encodeURIComponent(imageId)}`, {
    method: "DELETE",
  });
  return res.card;
}

/** The team puts a removed screenshot back (internal wiki only; there is no client route). */
export async function restoreBoardImageApi(slug: string, taskId: string, imageId: string): Promise<WikiBoardCard> {
  const res = await apiFetch<{ card: WikiBoardCard }>(
    `/api/clients/${encodeURIComponent(slug)}/wiki/board/cards/${encodeURIComponent(taskId)}/images/${encodeURIComponent(imageId)}/restore`,
    { method: "POST" },
  );
  return res.card;
}

/** One card (or a sub-item of one) as the card popup opens it, in the copy the caller may see. */
export async function readBoardCardApi(target: BoardTarget, taskId: string): Promise<WikiBoardCard> {
  const res = await apiFetch<{ card: WikiBoardCard }>(cardUrl(target, taskId));
  return res.card;
}

/** Where a Done column's older cards are read from (src/server/wiki-board.ts `loadBoardLanePage`). */
function laneUrl(target: BoardTarget, laneKey: string, kind: DoneLaneKind, offset: number): string {
  const base =
    target.mode === "public"
      ? `/api/wiki/${encodeURIComponent(target.token)}/board/lanes/${encodeURIComponent(laneKey)}`
      : `/api/clients/${encodeURIComponent(target.slug)}/wiki/board/lanes/${encodeURIComponent(laneKey)}`;
  return `${base}?kind=${kind}&offset=${offset}&limit=${DONE_PAGE_MAX}`;
}

/**
 * Every card of one kind in a Done column, page by page (a page is up to `DONE_PAGE_MAX`). Starts
 * from the top, so the cards the board already shows come back too: merging them is how a card
 * that finished between the two reads can't be missed. Stops at `maxPages` as a safety net, and
 * says so, rather than looping on a server that keeps answering.
 */
export async function fetchDoneLane(
  target: BoardTarget,
  laneKey: string,
  kind: DoneLaneKind,
  maxPages = 50,
): Promise<{ cards: WikiBoardCard[]; complete: boolean }> {
  const cards: WikiBoardCard[] = [];
  let offset: number | null = 0;
  for (let i = 0; offset !== null && i < maxPages; i += 1) {
    const page: DoneLanePage = await apiFetch<DoneLanePage>(laneUrl(target, laneKey, kind, offset));
    cards.push(...page.cards);
    offset = page.nextOffset;
  }
  return { cards, complete: offset === null };
}

function keyDatesUrl(target: BoardTarget): string {
  return target.mode === "public"
    ? `/api/wiki/${encodeURIComponent(target.token)}/board/key-dates`
    : `/api/clients/${encodeURIComponent(target.slug)}/wiki/board/key-dates`;
}

export interface KeyDateForm {
  title: string;
  /** YYYY-MM-DD */
  date: string;
  note: string | null;
}

/** Add a key date to the Schedule: the client on their link, or the team on the internal wiki. */
export async function addKeyDateApi(target: BoardTarget, input: KeyDateForm): Promise<WikiBoardKeyDate> {
  const res = await apiFetch<{ keyDate: WikiBoardKeyDate }>(keyDatesUrl(target), json(input));
  return res.keyDate;
}

export async function updateKeyDateApi(target: BoardTarget, id: string, patch: Partial<KeyDateForm>): Promise<WikiBoardKeyDate> {
  const res = await apiFetch<{ keyDate: WikiBoardKeyDate }>(`${keyDatesUrl(target)}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return res.keyDate;
}

export async function deleteKeyDateApi(target: BoardTarget, id: string): Promise<void> {
  await apiFetch(`${keyDatesUrl(target)}/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** The team puts back a card deleted from the board. */
export async function restoreBoardCardApi(slug: string, taskId: string): Promise<WikiBoardCard> {
  const res = await apiFetch<{ card: WikiBoardCard }>(
    `/api/clients/${encodeURIComponent(slug)}/wiki/board/cards/${encodeURIComponent(taskId)}/restore`,
    { method: "POST" },
  );
  return res.card;
}

export async function setWikiBoardEnabledApi(slug: string, enabled: boolean): Promise<void> {
  await apiFetch(`/api/clients/${slug}/wiki/board`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
}

export function useSetWikiBoardEnabled(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => setWikiBoardEnabledApi(slug, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}

/** The team's "show all tasks to the client (titles only)" switch on the client's Board. */
export function useSetWikiBoardShowAllTasks(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (showAllTasks: boolean) =>
      apiFetch(`/api/clients/${slug}/wiki/board`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showAllTasks }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}

/** The team's default dashboard arrangement for a client (Decision E); null clears it. */
export function useSetWikiDashboardDefault(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (layout: DashboardLayout | null) =>
      apiFetch(`/api/clients/${slug}/wiki/dashboard-layout`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-wiki", slug] }),
  });
}
