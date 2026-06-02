"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { AiCostSummary } from "@/server/ai-cost";

// Type-only import above is erased at build, so no server code is bundled into the client.

export function useAiCost(enabled: boolean) {
  return useQuery({
    queryKey: ["ai-cost"],
    queryFn: () => apiFetch<AiCostSummary>("/api/admin/ai-cost"),
    enabled,
    staleTime: 60 * 60 * 1000, // matches the server-side cache TTL
    refetchOnWindowFocus: false,
    retry: false,
  });
}
