"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getFoundryAutomation, seedProjectPlan } from "@/lib/api";

const QK = {
  automation: ["foundry", "automation"] as const,
};

export function useFoundryAutomation() {
  return useQuery({
    queryKey: QK.automation,
    queryFn: () => getFoundryAutomation(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useSeedProjectPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof seedProjectPlan>[0]) => seedProjectPlan(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QK.automation });
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}
