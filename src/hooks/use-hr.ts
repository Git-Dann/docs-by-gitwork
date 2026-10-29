"use client";

/** People & HR (docs/hr-platform.md): a person's profile, personal details, access log, suppliers. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type {
  EmploymentUpdate,
  HrAccessEntry,
  SensitiveDetails,
  StaffProfile,
  SupplierInput,
  SupplierRecord,
} from "@/lib/hr";

const json = (body: unknown) => ({ headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const profileKey = (id: string) => ["staff", "profile", id] as const;

export function useStaffProfile(recordId: string) {
  return useQuery({
    queryKey: profileKey(recordId),
    queryFn: () => apiFetch<StaffProfile>(`/api/staff/${encodeURIComponent(recordId)}`),
  });
}

/**
 * Personal details load only when asked for (`enabled`): opening someone's profile must
 * not read, or log, their personal details unless the viewer chooses to see them.
 */
export function useStaffPersonal(recordId: string, enabled: boolean) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["staff", "personal", recordId],
    queryFn: async () => {
      const details = await apiFetch<SensitiveDetails>(`/api/staff/${encodeURIComponent(recordId)}/personal`);
      // The look was just logged on the server, so the log on screen is now out of date.
      void qc.invalidateQueries({ queryKey: ["staff", "access-log", recordId] });
      return details;
    },
    enabled,
    // Never kept or refetched in the background: each look is a deliberate, logged act.
    gcTime: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useUpdateStaffPersonal(recordId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (details: SensitiveDetails) =>
      apiFetch<SensitiveDetails>(`/api/staff/${encodeURIComponent(recordId)}/personal`, { method: "PUT", ...json(details) }),
    onSuccess: (saved) => {
      qc.setQueryData(["staff", "personal", recordId], saved);
      void qc.invalidateQueries({ queryKey: profileKey(recordId) });
      void qc.invalidateQueries({ queryKey: ["staff", "access-log", recordId] });
    },
  });
}

export function useUpdateEmployment(recordId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (update: EmploymentUpdate) =>
      apiFetch<{ ok: true }>(`/api/staff/${encodeURIComponent(recordId)}/employment`, { method: "PATCH", ...json(update) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: profileKey(recordId) });
      void qc.invalidateQueries({ queryKey: ["staff", "access-log", recordId] });
      void qc.invalidateQueries({ queryKey: ["staff", "suppliers"] });
    },
  });
}

export function useAccessLog(recordId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["staff", "access-log", recordId],
    queryFn: () => apiFetch<{ entries: HrAccessEntry[] }>(`/api/staff/${encodeURIComponent(recordId)}/access-log`),
    enabled,
  });
}

export function useSuppliers(enabled = true, includeArchived = false) {
  return useQuery({
    queryKey: ["staff", "suppliers", includeArchived],
    queryFn: () => apiFetch<{ suppliers: SupplierRecord[] }>(`/api/staff/suppliers${includeArchived ? "?archived=1" : ""}`),
    enabled,
  });
}

export function useSaveSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: SupplierInput & { archived?: boolean } }): Promise<unknown> =>
      id
        ? apiFetch<{ ok: true }>(`/api/staff/suppliers/${encodeURIComponent(id)}`, { method: "PATCH", ...json(input) })
        : apiFetch<{ id: string }>("/api/staff/suppliers", { method: "POST", ...json(input) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["staff", "suppliers"] }),
  });
}
