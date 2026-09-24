"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addHandoverItem,
  createHandover,
  deleteHandover,
  deleteHandoverItem,
  getHandover,
  listHandovers,
  updateHandover,
  updateHandoverItem,
} from "@/lib/api";
import type { HandoverInput, HandoverItemInput } from "@/types/handover";

const QK = {
  list: () => ["backstage", "handover"] as const,
  one: (id: string) => ["backstage", "handover", id] as const,
};

export function useHandovers(enabled = true) {
  return useQuery({ queryKey: QK.list(), queryFn: listHandovers, enabled });
}

/**
 * `staleTime: 0` on purpose. Half of what this returns is derived live — Care
 * queues, overdue counts — and the whole point is that whoever is covering
 * never reads a figure that has moved on.
 */
export function useHandover(id: string | null) {
  return useQuery({
    queryKey: QK.one(id ?? ""),
    queryFn: () => getHandover(id as string),
    enabled: Boolean(id),
    staleTime: 0,
  });
}

export function useCreateHandover() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: HandoverInput) => createHandover(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.list() }),
  });
}

export function useUpdateHandover(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<HandoverInput>) => updateHandover(id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QK.one(id) });
      void qc.invalidateQueries({ queryKey: QK.list() });
    },
  });
}

export function useDeleteHandover() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteHandover(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.list() }),
  });
}

export function useAddHandoverItem(handoverId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: HandoverItemInput) => addHandoverItem(handoverId, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QK.one(handoverId) });
      void qc.invalidateQueries({ queryKey: QK.list() });
    },
  });
}

export function useUpdateHandoverItem(handoverId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, input }: { itemId: string; input: Partial<HandoverItemInput> }) =>
      updateHandoverItem(itemId, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QK.one(handoverId) });
      void qc.invalidateQueries({ queryKey: QK.list() });
    },
  });
}

export function useDeleteHandoverItem(handoverId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => deleteHandoverItem(itemId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QK.one(handoverId) });
      void qc.invalidateQueries({ queryKey: QK.list() });
    },
  });
}
