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

import { useQuery } from "@tanstack/react-query";
import {
  getCalendarEvents,
  getGmailMessages,
  getDeskActionItems,
  getDeskSlack,
  getDeskHolidays,
} from "@/lib/api";

export function useDeskCalendar(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["integrations", "calendar"] as const,
    queryFn: getCalendarEvents,
    enabled: opts.enabled ?? true,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useDeskGmail(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["integrations", "gmail"] as const,
    queryFn: getGmailMessages,
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

export function useDeskHolidays() {
  return useQuery({
    queryKey: ["desk", "holidays"] as const,
    queryFn: getDeskHolidays,
    // Holidays barely change — cache hard for the session.
    staleTime: 6 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
