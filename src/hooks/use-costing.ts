"use client";

// Costing & Quote hooks (Super-Admin tool inside Studio). The config query prefills the levers
// (live FX, saved config, Rate-Card-seeded dev rates); the preview is an on-demand compute mutation
// re-run as the scope/config/rates change; saving persists the workspace costing config.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCostingConfig, previewCosting, saveCostingConfig } from "@/lib/api";

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

export function useSaveCostingConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: saveCostingConfig,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["costing", "config"] }),
  });
}
