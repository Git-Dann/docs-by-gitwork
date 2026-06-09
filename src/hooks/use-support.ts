"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSupportClient,
  createSupportConnection,
  createSupportReport,
  createSupportWorkflowRule,
  updateSupportWorkflowRule,
  deleteSupportConnection,
  purgeConnectionConversations,
  deleteSupportReport,
  deleteSupportTicket,
  deleteSupportWorkflowRule,
  generateAiDraft,
  getSupportClient,
  getSupportReport,
  listSupportAuditLogs,
  listSupportClients,
  listSupportConnections,
  listSupportConversations,
  listSupportDraftActions,
  listSupportMembers,
  listSupportMessages,
  listSupportReports,
  listSupportTickets,
  listSupportWorkflowRules,
  seedSupportDefaultRules,
  sendSupportMessage,
  syncSupportConnection,
  updateSupportClient,
  updateSupportConnection,
  updateSupportConversation,
  updateSupportDraftAction,
  updateSupportReport,
  updateSupportTicket,
  batchUpdateSupportTickets,
  searchConversationsSemantic,
} from "@/lib/api";
import type { SupportReport, SupportReportPayload } from "@/types/support";
import type { SupportClient, Conversation, DraftAction, Ticket, WorkflowRule, Connection } from "@/types/support";

// ─── Clients ──────────────────────────────────────────────────────────────────

export function useSupportClients() {
  return useQuery({
    queryKey: ["support", "clients"],
    queryFn: () => listSupportClients(),
    staleTime: 1000 * 30,
  });
}

export function useSupportClient(clientId: string | null) {
  return useQuery({
    queryKey: ["support", "client", clientId],
    queryFn: () => getSupportClient(clientId as string),
    enabled: Boolean(clientId),
    staleTime: 1000 * 30,
  });
}

export function useCreateSupportClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<SupportClient>) => createSupportClient(data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["support", "clients"] });
    },
  });
}

export function useUpdateSupportClient(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<SupportClient>) => updateSupportClient(clientId, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["support", "clients"] });
      void qc.invalidateQueries({ queryKey: ["support", "client", clientId] });
    },
  });
}

// ─── Conversations ────────────────────────────────────────────────────────────

export function useSupportConversations(clientId: string | null) {
  return useQuery({
    queryKey: ["support", "conversations", clientId],
    queryFn: () => listSupportConversations(clientId as string),
    enabled: Boolean(clientId),
    staleTime: 1000 * 15,
  });
}

export function useSemanticSearch(clientId: string | null) {
  return useMutation({
    mutationFn: ({ query, limit }: { query: string; limit?: number }) =>
      searchConversationsSemantic(clientId as string, query, limit),
  });
}

export function useUpdateConversation(clientId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ convId, data }: { convId: string; data: Partial<Conversation> }) =>
      updateSupportConversation(clientId as string, convId, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["support", "conversations", clientId] });
    },
  });
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export function useSupportMessages(clientId: string | null, convId: string | null) {
  return useQuery({
    queryKey: ["support", "messages", convId],
    queryFn: () => listSupportMessages(clientId as string, convId as string),
    enabled: Boolean(clientId) && Boolean(convId),
    staleTime: 1000 * 10,
  });
}

export function useSendMessage(clientId: string | null, convId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { direction: "inbound" | "outbound"; authorLabel: string; body: string }) =>
      sendSupportMessage(clientId as string, convId as string, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["support", "messages", convId] });
      void qc.invalidateQueries({ queryKey: ["support", "conversations", clientId] });
    },
  });
}

// ─── Tickets ──────────────────────────────────────────────────────────────────

export function useSupportTickets(clientId: string | null) {
  return useQuery({
    queryKey: ["support", "tickets", clientId],
    queryFn: () => listSupportTickets(clientId as string),
    enabled: Boolean(clientId),
    staleTime: 1000 * 15,
  });
}

export function useUpdateTicket(clientId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ticketId, data }: { ticketId: string; data: Partial<Ticket> }) =>
      updateSupportTicket(clientId as string, ticketId, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["support", "tickets", clientId] });
    },
  });
}

export function useDeleteTicket(clientId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ticketId: string) => deleteSupportTicket(clientId as string, ticketId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["support", "tickets", clientId] });
    },
  });
}

export function useBatchUpdateTickets(clientId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      ticketIds,
      data,
    }: {
      ticketIds: string[];
      data: Partial<{ status: string; priority: string; assignedTo: string }>;
    }) => batchUpdateSupportTickets(clientId as string, ticketIds, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["support", "tickets", clientId] });
    },
  });
}

// ─── Connections ──────────────────────────────────────────────────────────────

export function useSupportConnections(clientId: string | null) {
  return useQuery({
    queryKey: ["support", "connections", clientId],
    queryFn: () => listSupportConnections(clientId as string),
    enabled: Boolean(clientId),
    staleTime: 1000 * 30,
  });
}

export function useCreateSupportConnection(clientId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof createSupportConnection>[1]) =>
      createSupportConnection(clientId as string, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["support", "connections", clientId] });
    },
  });
}

export function useUpdateConnection(clientId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ connId, data }: { connId: string; data: Partial<Connection> }) =>
      updateSupportConnection(clientId as string, connId, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["support", "connections", clientId] });
    },
  });
}

export function useDeleteConnection(clientId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (connId: string) => deleteSupportConnection(clientId as string, connId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["support", "connections", clientId] });
    },
  });
}

export function useGenerateAiDraft(clientId: string | null) {
  return useMutation({
    mutationFn: (convId: string) =>
      generateAiDraft(clientId as string, convId),
  });
}

export function usePurgeConversations(clientId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (connId: string) => purgeConnectionConversations(clientId as string, connId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["support", "conversations", clientId] });
    },
  });
}

export function useSyncConnection(clientId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: string | { connId: string; resync?: boolean }) => {
      const { connId, resync } = typeof input === "string" ? { connId: input, resync: false } : input;
      return syncSupportConnection(clientId as string, connId, { resync });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["support", "conversations", clientId] });
      void qc.invalidateQueries({ queryKey: ["support", "tickets", clientId] });
    },
  });
}

// ─── Draft Actions ────────────────────────────────────────────────────────────

export function useSupportDraftActions(clientId: string | null) {
  return useQuery({
    queryKey: ["support", "drafts", clientId],
    queryFn: () => listSupportDraftActions(clientId as string),
    enabled: Boolean(clientId),
    staleTime: 1000 * 15,
  });
}

export function useUpdateDraftAction(clientId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ draftId, data }: { draftId: string; data: Partial<DraftAction> }) =>
      updateSupportDraftAction(clientId as string, draftId, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["support", "drafts", clientId] });
    },
  });
}

// ─── Workflow Rules ───────────────────────────────────────────────────────────

export function useSupportWorkflowRules(clientId: string | null) {
  return useQuery({
    queryKey: ["support", "rules", clientId],
    queryFn: () => listSupportWorkflowRules(clientId as string),
    enabled: Boolean(clientId),
    staleTime: 1000 * 30,
  });
}

export function useCreateWorkflowRule(clientId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<WorkflowRule>) =>
      createSupportWorkflowRule(clientId as string, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["support", "rules", clientId] });
    },
  });
}

export function useDeleteWorkflowRule(clientId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ruleId: string) => deleteSupportWorkflowRule(clientId as string, ruleId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["support", "rules", clientId] });
    },
  });
}

export function useUpdateWorkflowRule(clientId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ruleId, data }: { ruleId: string; data: Partial<WorkflowRule> }) =>
      updateSupportWorkflowRule(clientId as string, ruleId, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["support", "rules", clientId] });
    },
  });
}

// ─── Audit Logs ───────────────────────────────────────────────────────────────

export function useSupportAuditLogs(clientId: string | null) {
  return useQuery({
    queryKey: ["support", "audit-logs", clientId],
    queryFn: () => listSupportAuditLogs(clientId as string),
    enabled: Boolean(clientId),
    staleTime: 1000 * 30,
  });
}

// ─── Members ──────────────────────────────────────────────────────────────────

export function useSupportMembers(clientId: string | null) {
  return useQuery({
    queryKey: ["support", "members", clientId],
    queryFn: () => listSupportMembers(clientId as string),
    enabled: Boolean(clientId),
    staleTime: 1000 * 60,
  });
}

export function useSeedDefaultRules(clientId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => seedSupportDefaultRules(clientId as string),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["support", "rules", clientId] });
    },
  });
}

// ─── Monthly Reports ──────────────────────────────────────────────────────────

export function useReport(reportId: string) {
  return useQuery({
    queryKey: ["support", "report", reportId],
    queryFn: () => getSupportReport(reportId),
    enabled: Boolean(reportId),
    staleTime: 1000 * 60,
  });
}

export function useSupportReports(clientId: string | null) {
  return useQuery({
    queryKey: ["support", "reports", clientId],
    queryFn: () => listSupportReports(clientId as string),
    enabled: Boolean(clientId),
    staleTime: 1000 * 30,
  });
}

export function useCreateSupportReport(clientId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { period: string; payload: SupportReportPayload; createdBy?: string }) =>
      createSupportReport(clientId as string, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["support", "reports", clientId] });
    },
  });
}

export function useUpdateSupportReport(clientId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      reportId,
      data,
    }: {
      reportId: string;
      data: { period?: string; payload?: SupportReportPayload };
    }) => updateSupportReport(clientId as string, reportId, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["support", "reports", clientId] });
    },
  });
}

export function useDeleteSupportReport(clientId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reportId: string) => deleteSupportReport(clientId as string, reportId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["support", "reports", clientId] });
    },
  });
}

// Re-export SupportReport type for use in dashboard without extra import
export type { SupportReport };
