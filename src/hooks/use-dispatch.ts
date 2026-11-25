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

/** What the panel opens on for a client (and the task it came from): no AI, so it's free. */
export function useDispatchBrief(clientSlug: string, taskId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["dispatch", "brief", clientSlug, taskId],
    queryFn: () =>
      apiFetch<DispatchBrief>(
        `/api/dispatch/brief?clientSlug=${encodeURIComponent(clientSlug)}${taskId ? `&taskId=${encodeURIComponent(taskId)}` : ""}`,
      ),
    enabled: enabled && Boolean(clientSlug),
    staleTime: 60_000,
    retry: false,
  });
}
