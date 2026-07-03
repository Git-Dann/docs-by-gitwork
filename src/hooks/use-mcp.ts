// React Query hooks for the MCP settings panels.
//
// Two independent surfaces:
//   • useMcpAdmin / useToggleMcp / useRevokeAdminConnection
//     — workspace-level admin (Settings → Workspace → MCP, Super Admin)
//   • useMyMcp / useRevokeOwnConnection
//     — per-user (Settings → Account → Connected apps)

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const ADMIN_KEY = ["mcp-admin"] as const;
const ME_KEY = ["me-mcp"] as const;

export type McpConnection = {
  id: string;
  label: string;
  clientName: string;
  clientLogoUri: string | null;
  clientUri: string | null;
  user: { id: string; name: string | null; email: string };
  connectedAt: string;
  lastUsedAt: string | null;
};

export type McpAdminPayload = {
  state: { enabled: boolean; connectionCount: number };
  connections: McpConnection[];
  setup: McpSetupContext;
};

export type McpSetupContext = {
  mcpUrl: string;
  discoveryUrl: string;
  claudeCodeSnippet: string;
  claudeDesktopSnippet: string;
  enabled: boolean;
};

export type MeMcpPayload = {
  setup: McpSetupContext;
  connections: McpConnection[];
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function patchJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function deleteJson(url: string): Promise<void> {
  const res = await fetch(url, { method: "DELETE", credentials: "same-origin" });
  if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
}

// ── admin ──────────────────────────────────────────────────────────────────

export function useMcpAdmin() {
  return useQuery({
    queryKey: ADMIN_KEY,
    queryFn: () => getJson<McpAdminPayload>("/api/settings/mcp"),
  });
}

export function useToggleMcp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) =>
      patchJson<{ state: McpAdminPayload["state"] }>("/api/settings/mcp", { enabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ADMIN_KEY });
      qc.invalidateQueries({ queryKey: ME_KEY });
    },
  });
}

export function useRevokeAdminConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (connectionId: string) =>
      deleteJson(`/api/settings/mcp/connections/${encodeURIComponent(connectionId)}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ADMIN_KEY });
      qc.invalidateQueries({ queryKey: ME_KEY });
    },
  });
}

// ── self-service ───────────────────────────────────────────────────────────

export function useMyMcp() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: () => getJson<MeMcpPayload>("/api/me/mcp"),
  });
}

export function useRevokeOwnConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (connectionId: string) =>
      deleteJson(`/api/me/mcp/connections/${encodeURIComponent(connectionId)}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ME_KEY });
      qc.invalidateQueries({ queryKey: ADMIN_KEY });
    },
  });
}
