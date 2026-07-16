"use client";

// Costing & Quote hooks (Super-Admin tool inside Studio). The config query prefills the levers
// (live FX, blended build day rate); the preview is an on-demand compute mutation the workspace
// re-runs as the scope/config change. Nothing is persisted — this is a live calculator for now.

import { useMutation, useQuery } from "@tanstack/react-query";
import { getCostingConfig, previewCosting } from "@/lib/api";

export function useCostingConfig(enabled: boolean) {
  return useQuery({
    queryKey: ["costing", "config"] as const,
    queryFn: getCostingConfig,
    enabled,
    staleTime: 60_000,
  });
}

export function useCostingPreview() {
  return useMutation({ mutationFn: previewCosting });
}
