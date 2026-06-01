"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  approveBackstageLeave,
  cancelBackstageLeave,
  createBackstageExpense,
  createBackstageLeave,
  getBackstageAlerts,
  getBackstageAllowance,
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
