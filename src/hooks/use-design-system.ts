"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getClientDesignSystem,
  saveClientDesignSystem,
  setClientDesignSystemShare,
  setClientDesignSystemEnabled,
  setClientDesignSystemFoundryBranding,
  setClientDesignSystemGuidelinesEnabled,
} from "@/lib/api";
import type { DesignSystemStatus, DesignTokens } from "@/types/design-tokens";

const QK = {
  ds: (slug: string) => ["design-system", slug] as const,
};

export function useClientDesignSystem(slug: string | null) {
  return useQuery({
    queryKey: QK.ds(slug ?? ""),
    queryFn: () => getClientDesignSystem(slug as string),
    enabled: Boolean(slug),
    staleTime: 30_000,
  });
}

export function useSaveClientDesignSystem(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { tokens: DesignTokens; status?: DesignSystemStatus }) =>
      saveClientDesignSystem(slug, input),
    onSuccess: (data) => qc.setQueryData(QK.ds(slug), data),
  });
}

export function useSetClientDesignSystemShare(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => setClientDesignSystemShare(slug, enabled),
    onSuccess: () => void qc.invalidateQueries({ queryKey: QK.ds(slug) }),
  });
}

export function useSetClientDesignSystemEnabled(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => setClientDesignSystemEnabled(slug, enabled),
    onSuccess: (data) => qc.setQueryData(QK.ds(slug), data),
  });
}

export function useSetClientDesignSystemFoundryBranding(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => setClientDesignSystemFoundryBranding(slug, enabled),
    onSuccess: (data) => qc.setQueryData(QK.ds(slug), data),
  });
}

export function useSetClientDesignSystemGuidelinesEnabled(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => setClientDesignSystemGuidelinesEnabled(slug, enabled),
    onSuccess: (data) => qc.setQueryData(QK.ds(slug), data),
  });
}
