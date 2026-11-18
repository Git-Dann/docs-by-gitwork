"use client";

/**
 * The client Board's reads and writes (src/server/wiki-board.ts). One component serves both
 * audiences, so the calls go through a target:
 *   - public:   the client on their wiki link → /api/wiki/[token]/board/… (hardened posture)
 *   - internal: the team on the internal wiki → the task routes they already use
 */

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { FeedbackKind } from "@/lib/wiki-board";
import type { TaskPriority, TaskStatus } from "@/types/tasks";
import type { WikiBoardCard, WikiBoardFeedback } from "@/types/wiki-board";

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

export interface NewBoardCard {
  title: string;
  itemType: "feature" | "bug" | "feedback";
  laneKey: string;
  releaseId: string | null;
  priority: TaskPriority;
  description: string;
  links: string[];
}

/** A client adds a card (public only: the team adds cards on their task board). */
export async function addBoardCardApi(token: string, input: NewBoardCard): Promise<WikiBoardCard> {
  const res = await apiFetch<{ card: WikiBoardCard }>(
    `/api/wiki/${encodeURIComponent(token)}/board/tasks`,
    json({
      ...input,
      releaseId: input.releaseId || null,
      description: input.description.trim() || null,
    }),
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
