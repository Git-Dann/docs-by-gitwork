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
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { FeedbackKind } from "@/lib/wiki-board";
import { DONE_PAGE_MAX, type DoneLaneKind, type DoneLanePage } from "@/lib/wiki-board-layout";
import type { TaskPriority, TaskStatus } from "@/types/tasks";
import type { WikiBoardCard, WikiBoardFeedback, WikiBoardKeyDate } from "@/types/wiki-board";

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

/** Re-read the board after a write: the internal wiki is a query, the public page is server-rendered. */
export function useBoardRefresh(target: BoardTarget): () => void {
  const queryClient = useQueryClient();
  const router = useRouter();
  const key = target.mode === "internal" ? target.slug : target.token;
  const mode = target.mode;
  return useCallback(() => {
    if (mode === "internal") {
      void queryClient.invalidateQueries({ queryKey: ["client-wiki", key] });
      // The team's own board shows the client's sign-off too.
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    } else {
      router.refresh();
    }
  }, [mode, key, queryClient, router]);
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

/** Add a card: the client on their link, or the team on the internal wiki. */
export async function addBoardCardApi(target: BoardTarget, input: BoardCardForm): Promise<WikiBoardCard> {
  const res = await apiFetch<{ card: WikiBoardCard }>(
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
  return res.card;
}

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
