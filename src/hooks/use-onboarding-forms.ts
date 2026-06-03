import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createOnboardingForm,
  deleteOnboardingForm,
  duplicateOnboardingForm,
  getOnboardingForm,
  listOnboardingForms,
  updateOnboardingForm,
} from "@/lib/api";
import type { OnboardingFormStructure } from "@/types/onboarding";

const KEY = ["onboarding-forms"] as const;

export function useOnboardingForms(includeArchived = false) {
  return useQuery({
    queryKey: [...KEY, { includeArchived }],
    queryFn: () => listOnboardingForms(includeArchived),
  });
}

export function useOnboardingForm(id: string | null) {
  return useQuery({
    queryKey: [...KEY, id],
    queryFn: () => getOnboardingForm(id as string),
    enabled: Boolean(id),
  });
}

export function useCreateOnboardingForm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      description?: string;
      cloneFromId?: string;
      structure?: OnboardingFormStructure;
    }) => createOnboardingForm(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useUpdateOnboardingForm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: string;
      name?: string;
      description?: string | null;
      structure?: OnboardingFormStructure;
      isDefault?: boolean;
      isArchived?: boolean;
    }) => updateOnboardingForm(id, input),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: KEY });
      qc.setQueryData([...KEY, data.form.id], data);
    },
  });
}

export function useDuplicateOnboardingForm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => duplicateOnboardingForm(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useDeleteOnboardingForm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteOnboardingForm(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
    },
  });
}
