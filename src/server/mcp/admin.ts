// Admin + per-user helpers for managing MCP connections.
//
// Both surfaces are now one page, Settings → MCP (see mcp-admin-panel.tsx):
//   • The Workspace functions (setMcpEnabled, listConnectionsForWorkspace,
//     revokeConnectionByAdmin) back the Status + all-connections sections,
//     shown only to Super Admins.
//   • The Own functions (listOwnConnections, revokeOwnConnection) back the
//     Quick start + your-connections sections, shown to anyone with mcp.connect.
//
// Every state change is audited via recordAuditEntry — same pattern as the
// other integration toggles (Google, Slack, email).

import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { recordAuditEntry } from "@/server/audit-log";
import { revokeConnection as oauthRevokeConnection } from "@/server/oauth";
import {
  assertSuperAdmin,
  ForbiddenError,
  type EffectiveUser,
} from "@/server/auth/effective-user";

// ── workspace-level toggle ─────────────────────────────────────────────────

export type McpAdminState = {
  enabled: boolean;
  connectionCount: number;
};

export async function getMcpAdminState(): Promise<McpAdminState> {
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { slug: DEFAULT_WORKSPACE_SLUG },
    select: { id: true, mcpEnabled: true },
  });
  const connectionCount = await prisma.mcpConnection.count({
    where: { workspaceId: workspace.id, revokedAt: null },
  });
  return { enabled: workspace.mcpEnabled, connectionCount };
}

export async function setMcpEnabled(actor: EffectiveUser, enabled: boolean): Promise<McpAdminState> {
  assertSuperAdmin(actor);
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { slug: DEFAULT_WORKSPACE_SLUG },
    select: { id: true, mcpEnabled: true },
  });
  if (workspace.mcpEnabled === enabled) {
    // No-op — don't pollute the audit log with non-events.
    return getMcpAdminState();
  }
  await prisma.workspace.update({
    where: { id: workspace.id },
    data: { mcpEnabled: enabled },
  });
  recordAuditEntry({
    workspaceId: workspace.id,
    actorId: actor.id,
    action: enabled ? "integration.mcp.enabled" : "integration.mcp.disabled",
    target: `workspace:${workspace.id}`,
    before: { mcpEnabled: workspace.mcpEnabled },
    after: { mcpEnabled: enabled },
  }).catch(() => undefined);
  return getMcpAdminState();
}

// ── shared shape ───────────────────────────────────────────────────────────

export type McpConnectionDTO = {
  id: string;
  label: string;
  clientName: string;
  clientLogoUri: string | null;
  clientUri: string | null;
  user: { id: string; name: string | null; email: string };
  connectedAt: string;
  lastUsedAt: string | null;
};

function toDto(row: {
  id: string;
  label: string;
  connectedAt: Date;
  lastUsedAt: Date | null;
  user: { id: string; name: string | null; email: string };
  client: { clientName: string; logoUri: string | null; clientUri: string | null };
}): McpConnectionDTO {
  return {
    id: row.id,
    label: row.label,
    clientName: row.client.clientName,
    clientLogoUri: row.client.logoUri,
    clientUri: row.client.clientUri,
    user: row.user,
    connectedAt: row.connectedAt.toISOString(),
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
  };
}

// ── admin queries ──────────────────────────────────────────────────────────

export async function listConnectionsForWorkspace(actor: EffectiveUser): Promise<McpConnectionDTO[]> {
  assertSuperAdmin(actor);
  const rows = await prisma.mcpConnection.findMany({
    where: { workspaceId: actor.workspaceId, revokedAt: null },
    orderBy: [{ lastUsedAt: { sort: "desc", nulls: "last" } }, { connectedAt: "desc" }],
    include: {
      user: { select: { id: true, name: true, email: true } },
      client: { select: { clientName: true, logoUri: true, clientUri: true } },
    },
  });
  return rows.map(toDto);
}

export async function revokeConnectionByAdmin(
  actor: EffectiveUser,
  connectionId: string,
): Promise<void> {
  assertSuperAdmin(actor);
  const row = await prisma.mcpConnection.findUnique({
    where: { id: connectionId },
    select: { id: true, userId: true, oauthClientId: true, workspaceId: true },
  });
  if (!row) throw new ForbiddenError("Connection not found.");
  if (row.workspaceId !== actor.workspaceId) {
    throw new ForbiddenError("Connection belongs to a different workspace.");
  }
  await oauthRevokeConnection({ userId: row.userId, oauthClientId: row.oauthClientId });
  recordAuditEntry({
    workspaceId: row.workspaceId,
    actorId: actor.id,
    action: "integration.mcp.revoked",
    target: `mcpConnection:${row.id}`,
    metadata: { revokedBy: "admin", targetUserId: row.userId },
  }).catch(() => undefined);
}

// ── per-user queries ───────────────────────────────────────────────────────

export async function listOwnConnections(user: EffectiveUser): Promise<McpConnectionDTO[]> {
  const rows = await prisma.mcpConnection.findMany({
    where: { userId: user.id, revokedAt: null },
    orderBy: [{ lastUsedAt: { sort: "desc", nulls: "last" } }, { connectedAt: "desc" }],
    include: {
      user: { select: { id: true, name: true, email: true } },
      client: { select: { clientName: true, logoUri: true, clientUri: true } },
    },
  });
  return rows.map(toDto);
}

export async function revokeOwnConnection(
  user: EffectiveUser,
  connectionId: string,
): Promise<void> {
  const row = await prisma.mcpConnection.findUnique({
    where: { id: connectionId },
    select: { id: true, userId: true, oauthClientId: true, workspaceId: true },
  });
  if (!row) throw new ForbiddenError("Connection not found.");
  if (row.userId !== user.id) {
    throw new ForbiddenError("You can only revoke your own connections.");
  }
  await oauthRevokeConnection({ userId: row.userId, oauthClientId: row.oauthClientId });
  recordAuditEntry({
    workspaceId: row.workspaceId,
    actorId: user.id,
    action: "integration.mcp.revoked",
    target: `mcpConnection:${row.id}`,
    metadata: { revokedBy: "self" },
  }).catch(() => undefined);
}

// ── setup info for the user-facing panel ───────────────────────────────────

export type McpSetupContext = {
  /** Base URL Claude pastes into "Add custom connector". */
  mcpUrl: string;
  /** Discovery URL (Claude reads this automatically). */
  discoveryUrl: string;
  /** Pre-formatted Claude Code CLI snippet (uses the discovery URL). */
  claudeCodeSnippet: string;
  /** Pre-formatted Claude Desktop config snippet. */
  claudeDesktopSnippet: string;
  /** Whether the workspace toggle is on — UI hides the connect button if not. */
  enabled: boolean;
};

export function buildSetupContext(origin: string, enabled: boolean): McpSetupContext {
  const mcpUrl = `${origin}/api/mcp`;
  const discoveryUrl = `${origin}/.well-known/oauth-authorization-server`;
  const claudeCodeSnippet = `claude mcp add --transport http foundry ${mcpUrl}`;
  const claudeDesktopSnippet = JSON.stringify(
    {
      mcpServers: {
        foundry: { url: mcpUrl },
      },
    },
    null,
    2,
  );
  return { mcpUrl, discoveryUrl, claudeCodeSnippet, claudeDesktopSnippet, enabled };
}
