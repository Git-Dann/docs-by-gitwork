/**
 * The Desk — data hooks for the internal aggregator drawer.
 *
 * The Desk owns almost no data: TODAY/TASKS reuse `useMyDay` + `useTaskAttention`
 * (light DB reads, safe to run for the collapsed dock summary). The Google-backed
 * queries below hit the user's Calendar/Gmail, so callers gate them on `enabled`
 * (the drawer only fetches them once opened). The action-items query is the one
 * Desk-specific endpoint.
 */

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getCalendarEvents,
  getGmailMessages,
  getDeskActionItems,
  getDeskSlack,
  getDeskMentions,
  getDeskHolidays,
  getDeskReminders,
  createDeskReminder,
  updateDeskReminder,
  deleteDeskReminder,
  getActiveBroadcast,
  postBroadcast,
  dismissBroadcast,
  getDeskAttention,
  getPurgeCandidates,
  approvePurge,
} from "@/lib/api";
import type { BroadcastDuration } from "@/types/desk";

export function useDeskAttention(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["desk", "attention"] as const,
    queryFn: getDeskAttention,
    enabled: opts.enabled ?? true,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export function usePurgeCandidates(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["retention", "purge-candidates"] as const,
    queryFn: getPurgeCandidates,
    enabled: opts.enabled ?? true,
    refetchOnWindowFocus: false,
  });
}

export function useApprovePurge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => approvePurge(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["retention", "purge-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["desk", "attention"] });
    },
  });
}

export function useDeskCalendar(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["integrations", "calendar"] as const,
    queryFn: getCalendarEvents,
    enabled: opts.enabled ?? true,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useDeskGmail(opts: { enabled?: boolean; query?: string } = {}) {
  return useQuery({
    queryKey: ["integrations", "gmail", opts.query ?? null] as const,
    queryFn: () => getGmailMessages(opts.query),
    enabled: opts.enabled ?? true,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useDeskActionItems(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["desk", "action-items"] as const,
    queryFn: getDeskActionItems,
    enabled: opts.enabled ?? true,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useDeskSlack(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["desk", "slack"] as const,
    queryFn: getDeskSlack,
    enabled: opts.enabled ?? true,
    staleTime: 120_000,
    refetchOnWindowFocus: false,
  });
}

export function useDeskMentions(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["desk", "mentions"] as const,
    queryFn: getDeskMentions,
    enabled: opts.enabled ?? true,
    staleTime: 120_000,
    refetchOnWindowFocus: false,
  });
}

export function useDeskHolidays() {
  return useQuery({
    queryKey: ["desk", "holidays"] as const,
    queryFn: getDeskHolidays,
    // Holidays barely change — cache hard for the session.
    staleTime: 6 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

// ─── Reminders (temporary personal list) ─────────────────────────────────────

const REMINDERS_KEY = ["desk", "reminders"] as const;

export function useDeskReminders(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: REMINDERS_KEY,
    queryFn: getDeskReminders,
    enabled: opts.enabled ?? true,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

export function useCreateDeskReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => createDeskReminder(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: REMINDERS_KEY }),
  });
}

export function useUpdateDeskReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: { done?: boolean; body?: string } }) =>
      updateDeskReminder(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: REMINDERS_KEY }),
  });
}

export function useDeleteDeskReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteDeskReminder(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: REMINDERS_KEY }),
  });
}

// ─── Broadcast (workspace-wide banner) ───────────────────────────────────────

const BROADCAST_KEY = ["desk", "broadcast"] as const;

export function useActiveBroadcast(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: BROADCAST_KEY,
    queryFn: getActiveBroadcast,
    enabled: opts.enabled ?? true,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function usePostBroadcast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { message: string; durationDays: BroadcastDuration }) => postBroadcast(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: BROADCAST_KEY }),
  });
}

export function useDismissBroadcast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => dismissBroadcast(),
    onSuccess: () => qc.invalidateQueries({ queryKey: BROADCAST_KEY }),
  });
}
