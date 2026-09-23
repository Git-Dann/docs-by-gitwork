"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getClientSummaryBoard, updateClientSummary } from "@/lib/api";

const KEY = ["client-summary"] as const;

export function useClientSummaryBoard() {
  return useQuery({ queryKey: KEY, queryFn: getClientSummaryBoard });
}

/**
 * Every write refetches the whole board rather than patching a card into the cache.
 *
 * ⚠️ Hiding a client changes the ordering, the bucket counts AND the "N hidden" line,
 * so a local patch would leave three derived figures disagreeing with the cards under
 * them — the class of staleness §42.6 had to unpick in Care.
 */
export function useUpdateClientSummary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { clientId: string; note?: string | null; hidden?: boolean }) =>
      updateClientSummary(args.clientId, { note: args.note, hidden: args.hidden }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
