"use client";

/** People & HR (docs/hr-platform.md): a person's profile, personal details, access log, suppliers. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { HrDocumentSettings, StaffDocumentsView } from "@/lib/hr-documents";
import type {
  ComingUpItem,
  MissingDetail,
  StaffActivity,
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

/**
 * Archive or restore a person. Someone who signs in goes through Settings → Team's own
 * routes (by membership); someone without a login is archived on their Staff record.
 */
export function useSetArchived() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ recordId, memberId, archived }: { recordId: string; memberId: string | null; archived: boolean }): Promise<unknown> =>
      memberId
        ? apiFetch(`/api/team/members/${encodeURIComponent(memberId)}/${archived ? "archive" : "restore"}`, { method: "POST" })
        : apiFetch(`/api/staff/${encodeURIComponent(recordId)}/archive`, { method: "POST", ...json({ archived }) }),
    onSuccess: (_d, { recordId }) => {
      void qc.invalidateQueries({ queryKey: ["staff", "roster"] });
      void qc.invalidateQueries({ queryKey: ["staff", "profile", recordId] });
    },
  });
}

/** Delete a record made by mistake. The server refuses anyone with history. */
export function useDeleteStaffRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (recordId: string) => apiFetch<{ ok: true }>(`/api/staff/${encodeURIComponent(recordId)}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["staff", "roster"] }),
  });
}

export function useStaffActivity(recordId: string) {
  return useQuery({
    queryKey: ["staff", "activity", recordId],
    queryFn: () => apiFetch<StaffActivity>(`/api/staff/${encodeURIComponent(recordId)}/activity`),
  });
}

/** HR's reminders and missing details. Only fetched for people who hold hr.manage. */
export function useHrOverview(enabled: boolean) {
  return useQuery({
    queryKey: ["staff", "hr-overview"],
    queryFn: () => apiFetch<{ comingUp: ComingUpItem[]; missing: MissingDetail[] }>("/api/staff/hr-overview"),
    enabled,
  });
}

// ── Documents ───────────────────────────────────────────────────────────────────

const docsKey = (recordId: string) => ["staff", "documents", recordId] as const;

export function useStaffDocuments(recordId: string) {
  return useQuery({
    queryKey: docsKey(recordId),
    queryFn: () => apiFetch<StaffDocumentsView>(`/api/staff/${encodeURIComponent(recordId)}/documents`),
  });
}

/** Everything that changes a person's documents refreshes their list, their access log and HR's reminders. */
export function useDocumentsInvalidate(recordId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: docsKey(recordId) });
    void qc.invalidateQueries({ queryKey: ["staff", "access-log", recordId] });
    void qc.invalidateQueries({ queryKey: ["staff", "hr-overview"] });
  };
}

export function useRequestDocument(recordId: string) {
  const done = useDocumentsInvalidate(recordId);
  return useMutation({
    mutationFn: (input: { type: string; note?: string | null }) =>
      apiFetch(`/api/staff/${encodeURIComponent(recordId)}/documents/request`, { method: "POST", ...json(input) }),
    onSuccess: done,
  });
}

export function useLinkDocument(recordId: string) {
  const done = useDocumentsInvalidate(recordId);
  return useMutation({
    mutationFn: (input: { type: string; title?: string | null; link: string; expiresOn?: string | null; visibility?: string | null }) =>
      apiFetch(`/api/staff/${encodeURIComponent(recordId)}/documents/link`, { method: "POST", ...json(input) }),
    onSuccess: done,
  });
}

export function useUpdateDocument(recordId: string) {
  const done = useDocumentsInvalidate(recordId);
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; review?: "accept" | "reject"; note?: string | null; expiresOn?: string | null; visibility?: string }) =>
      apiFetch(`/api/staff/documents/${encodeURIComponent(id)}`, { method: "PATCH", ...json(input) }),
    onSuccess: done,
  });
}

export function useDeleteDocument(recordId: string) {
  const done = useDocumentsInvalidate(recordId);
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/staff/documents/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: done,
  });
}

export function useRetryDriveCopy(recordId: string) {
  const done = useDocumentsInvalidate(recordId);
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/staff/documents/${encodeURIComponent(id)}/drive`, { method: "POST" }),
    onSuccess: done,
  });
}

export function useDocumentSettings(enabled: boolean) {
  return useQuery({
    queryKey: ["staff", "document-settings"],
    queryFn: () => apiFetch<HrDocumentSettings>("/api/staff/document-settings"),
    enabled,
  });
}

export function useUpdateDocumentSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settings: HrDocumentSettings) =>
      apiFetch<HrDocumentSettings>("/api/staff/document-settings", { method: "PATCH", ...json(settings) }),
    onSuccess: (saved) => {
      qc.setQueryData(["staff", "document-settings"], saved);
      void qc.invalidateQueries({ queryKey: ["staff", "documents"] });
    },
  });
}
