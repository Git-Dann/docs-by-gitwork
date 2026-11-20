"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { StaffDetailsUpdate, StaffRoster } from "@/lib/staff";
import type { DeveloperSelfDetails, OwnDeveloperDetails } from "@/lib/developer-self-details";
import type { MyPublicProfile, MyPublicProfileInput } from "@/server/public-profile";

const STAFF_KEY = ["staff", "roster"] as const;

/** The roster. `archived` lists who has left (restorable members, archived records). */
export function useStaffRoster(view: "active" | "archived" = "active") {
  return useQuery({
    queryKey: [...STAFF_KEY, view],
    queryFn: () => apiFetch<StaffRoster>(view === "archived" ? "/api/staff?view=archived" : "/api/staff"),
  });
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
    onSuccess: (_data, { recordId }) => {
      void qc.invalidateQueries({ queryKey: STAFF_KEY });
      // The profile page too. Not the whole ["staff"] tree: refetching personal details
      // would be a second, logged look nobody asked for.
      void qc.invalidateQueries({ queryKey: ["staff", "profile", recordId] });
    },
  });
}

/** The signed-in person's own developer details (Backstage → Me). Null when they have no record. */
export function useOwnDeveloperDetails(enabled = true) {
  return useQuery({
    queryKey: ["staff", "me", "developer"],
    queryFn: () => apiFetch<OwnDeveloperDetails | null>("/api/staff/me/developer"),
    enabled,
  });
}

export function useUpdateOwnDeveloperDetails() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DeveloperSelfDetails) =>
      apiFetch<OwnDeveloperDetails>("/api/staff/me/developer", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: (saved) => {
      qc.setQueryData(["staff", "me", "developer"], saved);
      // Their card on People and in Code reads the same record.
      void qc.invalidateQueries({ queryKey: STAFF_KEY });
      void qc.invalidateQueries({ queryKey: ["codeclear"] });
    },
  });
}

/** null = your own page; a record id = someone else's, for an Admin editing it from Staff. */
const publicProfileKey = (recordId: string | null) => ["staff", "public-profile", recordId ?? "me"] as const;
const publicProfileUrl = (recordId: string | null) =>
  recordId ? `/api/staff/${encodeURIComponent(recordId)}/public-profile` : "/api/staff/me/public-profile";

/** A public profile's settings (CLAUDE.md §139): your own, or someone's you may edit. */
export function usePublicProfile(recordId: string | null = null, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: publicProfileKey(recordId),
    queryFn: () => apiFetch<MyPublicProfile>(publicProfileUrl(recordId)),
    enabled,
  });
}

export function useSavePublicProfile(recordId: string | null = null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: MyPublicProfileInput) =>
      apiFetch<MyPublicProfile>(publicProfileUrl(recordId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    // Only this key: a broad ["staff"] invalidation would re-fetch the logged personal-details
    // read (§94), and nothing else shows these fields.
    onSuccess: (saved) => qc.setQueryData(publicProfileKey(recordId), saved),
  });
}

