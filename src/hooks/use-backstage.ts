"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  approveBackstageLeave,
  cancelBackstageLeave,
  createBackstageExpense,
  createBackstageLeave,
  updateBackstageLeave,
  listBackstageCalendarConnections,
  getBackstageTeamCalendarEvents,
  getBackstageCalendarTimeline,
  getBackstageAlerts,
  getBackstageAllowance,
  getBackstageCalendar,
  listBackstageExpenses,
  listBackstageLeave,
  listBackstageTeam,
  rejectBackstageLeave,
  reviewBackstageExpense,
  setBackstageMemberPermission,
  uploadBackstageReceipt,
  type BackstageScope,
} from "@/lib/api";
import type { ExpenseStatus, LeaveStatus } from "@/types/backstage";

const QK = {
  leave: (scope: BackstageScope, status?: LeaveStatus) =>
    ["backstage", "leave", scope, status ?? null] as const,
  expenses: (scope: BackstageScope, status?: ExpenseStatus) =>
    ["backstage", "expenses", scope, status ?? null] as const,
  allowance: (userId?: string) => ["backstage", "allowance", userId ?? "me"] as const,
  alerts: ["backstage", "alerts"] as const,
  team: ["backstage", "team"] as const,
  calendar: (year: number, month: number) =>
    ["backstage", "calendar", year, month] as const,
};

// ─── Leave ─────────────────────────────────────────────────────────────────

export function useLeaveRequests(scope: BackstageScope = "me", status?: LeaveStatus) {
  return useQuery({
    queryKey: QK.leave(scope, status),
    queryFn: () => listBackstageLeave({ scope, status }),
    staleTime: 30_000,
  });
}

export function useCreateLeaveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof createBackstageLeave>[0]) =>
      createBackstageLeave(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["backstage", "leave"] });
      void qc.invalidateQueries({ queryKey: ["backstage", "allowance"] });
      void qc.invalidateQueries({ queryKey: ["backstage", "alerts"] });
    },
  });
}

export function useUpdateLeaveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof updateBackstageLeave>[1] }) =>
      updateBackstageLeave(id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["backstage", "leave"] });
      void qc.invalidateQueries({ queryKey: ["backstage", "allowance"] });
      void qc.invalidateQueries({ queryKey: ["backstage", "alerts"] });
    },
  });
}

export function useCancelLeaveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cancelBackstageLeave(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["backstage", "leave"] });
      void qc.invalidateQueries({ queryKey: ["backstage", "allowance"] });
      void qc.invalidateQueries({ queryKey: ["backstage", "alerts"] });
    },
  });
}

export function useApproveLeaveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      approveBackstageLeave(id, note),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["backstage", "leave"] });
      void qc.invalidateQueries({ queryKey: ["backstage", "allowance"] });
      void qc.invalidateQueries({ queryKey: ["backstage", "alerts"] });
    },
  });
}

export function useRejectLeaveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      rejectBackstageLeave(id, note),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["backstage", "leave"] });
      void qc.invalidateQueries({ queryKey: ["backstage", "allowance"] });
    },
  });
}

export function useLeaveAllowance(userId?: string) {
  return useQuery({
    queryKey: QK.allowance(userId),
    queryFn: () => getBackstageAllowance(userId),
    staleTime: 60_000,
  });
}

// ─── Expenses ──────────────────────────────────────────────────────────────

export function useExpenses(scope: BackstageScope = "me", status?: ExpenseStatus) {
  return useQuery({
    queryKey: QK.expenses(scope, status),
    queryFn: () => listBackstageExpenses({ scope, status }),
    staleTime: 30_000,
  });
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof createBackstageExpense>[0]) =>
      createBackstageExpense(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["backstage", "expenses"] });
    },
  });
}

export function useUploadReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ expenseId, file }: { expenseId: string; file: File }) =>
      uploadBackstageReceipt(expenseId, file),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["backstage", "expenses"] });
    },
  });
}

export function useReviewExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      status,
      note,
    }: {
      id: string;
      status: "APPROVED" | "REJECTED" | "REIMBURSED";
      note?: string;
    }) => reviewBackstageExpense(id, status, note),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["backstage", "expenses"] });
    },
  });
}

// ─── Staffing alerts + team ───────────────────────────────────────────────

export function useStaffingAlerts() {
  return useQuery({
    queryKey: QK.alerts,
    queryFn: () => getBackstageAlerts(30),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useBackstageTeam() {
  return useQuery({
    queryKey: QK.team,
    queryFn: () => listBackstageTeam(),
    staleTime: 5 * 60_000,
  });
}

export function useSetMemberPermission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, canApprove }: { userId: string; canApprove: boolean }) =>
      setBackstageMemberPermission(userId, canApprove),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["backstage", "team"] });
    },
  });
}

export function useBackstageCalendar(year: number, month: number) {
  return useQuery({
    queryKey: QK.calendar(year, month),
    queryFn: () => getBackstageCalendar(year, month),
    staleTime: 60_000,
  });
}

// ─── Google Calendar overlay ───────────────────────────────────────────────

export function useCalendarConnections() {
  return useQuery({
    queryKey: ["backstage", "calendarConnections"] as const,
    queryFn: () => listBackstageCalendarConnections(),
    staleTime: 5 * 60_000,
  });
}

export function useTeamCalendarEvents(year: number, month: number, userIds: string[]) {
  const key = [...userIds].sort().join(",");
  return useQuery({
    queryKey: ["backstage", "teamCalendar", year, month, key] as const,
    queryFn: () => getBackstageTeamCalendarEvents(year, month, userIds),
    enabled: userIds.length > 0,
    staleTime: 60_000,
  });
}

// Portal Gantt overlay (admin-only). `enabled` gates the fetch so non-admins
// (or when the overlay is toggled off) never hit the admin-gated route.
export function useBackstageCalendarTimeline(year: number, month: number, enabled: boolean) {
  return useQuery({
    queryKey: ["backstage", "calendarTimeline", year, month] as const,
    queryFn: () => getBackstageCalendarTimeline(year, month),
    enabled,
    staleTime: 60_000,
  });
}
