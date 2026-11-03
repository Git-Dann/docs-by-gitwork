"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  convertLeadApi,
  createLeadActionApi,
  deleteLeadActionApi,
  getConvertPreview,
  getLeadCrm,
  getMyLeadActions,
  resolveCrmSuggestion,
  setMyCrmMailboxApi,
  syncLeadCrmApi,
  updateLeadActionApi,
  updateLeadCrm,
} from "@/lib/api";

export const crmKey = (slug: string) => ["client-crm", slug] as const;

/** Everything a CRM change can alter on screen: the panel, the activity log and the stage. */
function useInvalidateLead(slug: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: crmKey(slug) });
    void queryClient.invalidateQueries({ queryKey: ["client", slug] });
    void queryClient.invalidateQueries({ queryKey: ["client-touchpoints", slug] });
    void queryClient.invalidateQueries({ queryKey: ["desk", "lead-actions"] });
  };
}

export function useLeadCrm(slug: string, enabled = true) {
  return useQuery({
    queryKey: crmKey(slug),
    queryFn: () => getLeadCrm(slug).then((r) => r.crm),
    enabled: enabled && Boolean(slug),
    staleTime: 30_000,
  });
}

export function useUpdateLeadCrm(slug: string) {
  const invalidate = useInvalidateLead(slug);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof updateLeadCrm>[1]) => updateLeadCrm(slug, input),
    onSuccess: (data) => {
      queryClient.setQueryData(crmKey(slug), data.crm);
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

export function useSyncLeadCrm(slug: string) {
  const invalidate = useInvalidateLead(slug);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => syncLeadCrmApi(slug),
    onSuccess: (data) => {
      queryClient.setQueryData(crmKey(slug), data.crm);
      invalidate();
      if (data.result.moved) void queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

export function useResolveCrmSuggestion(slug: string) {
  const invalidate = useInvalidateLead(slug);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; action: "accept" | "dismiss" }) => resolveCrmSuggestion(slug, input.id, input.action),
    onSuccess: (data) => {
      queryClient.setQueryData(crmKey(slug), data.crm);
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

export function useCreateLeadAction(slug: string) {
  const invalidate = useInvalidateLead(slug);
  return useMutation({
    mutationFn: (input: Parameters<typeof createLeadActionApi>[1]) => createLeadActionApi(slug, input),
    onSuccess: invalidate,
  });
}

export function useUpdateLeadAction(slug: string) {
  const invalidate = useInvalidateLead(slug);
  return useMutation({
    mutationFn: (input: { id: string } & Parameters<typeof updateLeadActionApi>[2]) => {
      const { id, ...rest } = input;
      return updateLeadActionApi(slug, id, rest);
    },
    onSuccess: invalidate,
  });
}

export function useDeleteLeadAction(slug: string) {
  const invalidate = useInvalidateLead(slug);
  return useMutation({
    mutationFn: (id: string) => deleteLeadActionApi(slug, id),
    onSuccess: invalidate,
  });
}

export function useConvertPreview(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: ["client-crm", slug, "convert-preview"],
    queryFn: () => getConvertPreview(slug).then((r) => r.preview),
    enabled: enabled && Boolean(slug),
    staleTime: 0,
  });
}

export function useConvertLead(slug: string) {
  const invalidate = useInvalidateLead(slug);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fields: Parameters<typeof convertLeadApi>[1]) => convertLeadApi(slug, fields),
    onSuccess: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

export function useSetMyCrmMailbox(slug?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => setMyCrmMailboxApi(enabled),
    onSuccess: () => {
      if (slug) void queryClient.invalidateQueries({ queryKey: crmKey(slug) });
      else void queryClient.invalidateQueries({ queryKey: ["client-crm"] });
    },
  });
}

export function useMyLeadActions(enabled = true) {
  return useQuery({
    queryKey: ["desk", "lead-actions"],
    queryFn: () => getMyLeadActions().then((r) => r.actions),
    enabled,
    staleTime: 60_000,
  });
}
