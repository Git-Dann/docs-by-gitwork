"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAutomationOnboardingLink,
  draftProposalFromMeeting,
  getFoundryAutomation,
  previewProjectPlan,
  seedProjectPlan,
} from "@/lib/api";

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

export function useDraftProposalFromMeeting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof draftProposalFromMeeting>[0]) => draftProposalFromMeeting(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QK.automation });
      void queryClient.invalidateQueries({ queryKey: ["proposals"] });
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

export function useCreateAutomationOnboardingLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof createAutomationOnboardingLink>[0]) =>
      createAutomationOnboardingLink(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QK.automation });
      void queryClient.invalidateQueries({ queryKey: ["onboarding-links"] });
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

export function usePreviewProjectPlan() {
  return useMutation({
    mutationFn: (input: Parameters<typeof previewProjectPlan>[0]) => previewProjectPlan(input),
  });
}
