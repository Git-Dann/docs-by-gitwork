"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

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
