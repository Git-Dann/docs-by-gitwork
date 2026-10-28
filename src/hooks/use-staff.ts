"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { StaffDetailsUpdate, StaffRoster } from "@/lib/staff";

const STAFF_KEY = ["staff", "roster"] as const;

export function useStaffRoster() {
  return useQuery({ queryKey: STAFF_KEY, queryFn: () => apiFetch<StaffRoster>("/api/staff") });
}

export function useCreateStaffRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { memberId?: string; name?: string; email?: string | null } & StaffDetailsUpdate) =>
      apiFetch<{ recordId: string }>("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: STAFF_KEY }),
  });
}

export function useUpdateStaffDetails() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ recordId, update }: { recordId: string; update: StaffDetailsUpdate }) =>
      apiFetch<{ ok: true }>(`/api/staff/${encodeURIComponent(recordId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: STAFF_KEY }),
  });
}
