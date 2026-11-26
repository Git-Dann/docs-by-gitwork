"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { DispatchBrief } from "@/server/dispatch/assistant/brief";

export type { DispatchBrief };

/** Whether the signed-in person can use Dispatch. One cached request shared by every entry point. */
export function useDispatchAvailable(): boolean {
  const q = useQuery({
    queryKey: ["dispatch", "available"],
    queryFn: () => apiFetch<{ available: boolean }>("/api/dispatch/conversations").then((r) => r.available),
    staleTime: 5 * 60_000,
    retry: false,
  });
  return q.data === true;
}

/** The brief query, shared so the header button can fetch it before the panel opens (§175). */
export function briefQuery(clientSlug: string, taskId: string | null) {
  return {
    queryKey: ["dispatch", "brief", clientSlug, taskId] as const,
    queryFn: () =>
      apiFetch<DispatchBrief>(
        `/api/dispatch/brief?clientSlug=${encodeURIComponent(clientSlug)}${taskId ? `&taskId=${encodeURIComponent(taskId)}` : ""}`,
      ),
    staleTime: 60_000,
    retry: false,
  };
}

/** What the panel opens on for a client (and the task it came from): no AI, so it's free. */
export function useDispatchBrief(clientSlug: string, taskId: string | null, enabled: boolean) {
  return useQuery({ ...briefQuery(clientSlug, taskId), enabled: enabled && Boolean(clientSlug) });
}
