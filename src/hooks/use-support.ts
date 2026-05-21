"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSupportClient,
  createSupportConnection,
  createSupportWorkflowRule,
  deleteSupportTicket,
  deleteSupportWorkflowRule,
  generateAiDraft,
  getSupportClient,
  listSupportAuditLogs,
  listSupportClients,
  listSupportConnections,
  listSupportConversations,
  listSupportDraftActions,
  listSupportMembers,
  listSupportMessages,
  listSupportTickets,
  listSupportWorkflowRules,
  sendSupportMessage,
  updateSupportClient,
  updateSupportConnection,
  updateSupportConversation,
  updateSupportDraftAction,
  updateSupportTicket,
} from "@/lib/api";
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

export function useGenerateAiDraft(clientId: string | null) {
  return useMutation({
    mutationFn: (convId: string) =>
      generateAiDraft(clientId as string, convId),
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
