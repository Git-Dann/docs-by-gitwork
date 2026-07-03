// Settings → Workspace → MCP (Super Admin only).
//
// Two stacked sections:
//   01 // STATUS       — master toggle + connection count
//   02 // CONNECTIONS  — live connections across the workspace, with revoke
//
// Connections show user, client (Claude / whoever), connected/last-used
// timestamps, and a Revoke button that kills the OAuth tokens and the row
// in one transaction.

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SettingsCard } from "@/components/settings/settings-card";
import {
  useMcpAdmin,
  useToggleMcp,
  useRevokeAdminConnection,
  type McpConnection,
} from "@/hooks/use-mcp";
import { McpToolsCatalog } from "@/components/settings/mcp-tools-catalog";
import { McpQuickStart } from "@/components/settings/mcp-quick-start";

export function McpAdminPanel() {
  const { data, isLoading, error } = useMcpAdmin();
  const toggle = useToggleMcp();

  if (isLoading) {
    return <div className="text-sm text-[var(--text-3)]">Loading…</div>;
  }
  if (error || !data) {
    return (
      <div className="app-card p-6 text-sm text-[var(--text-3)]">
        Couldn&apos;t load MCP settings. {error instanceof Error ? error.message : ""}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SettingsCard
        number="01"
        title="Status"
        right={
          <span className="text-[11px] uppercase tracking-wide text-[var(--text-3)]">
            {data.state.enabled ? "Enabled" : "Disabled"}
          </span>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-2)]">
            MCP is Foundry&apos;s in-app endpoint that lets Claude (and other MCP-compatible
            clients) act on a member&apos;s behalf. Each user authorizes their own connection;
            this toggle is the workspace-wide kill switch.
          </p>
          <div className="flex items-center gap-3">
            <Button
              variant={data.state.enabled ? "secondary" : "primary"}
              loading={toggle.isPending}
              onClick={() => toggle.mutate(!data.state.enabled)}
            >
              {data.state.enabled ? "Disable MCP" : "Enable MCP"}
            </Button>
            <span className="text-xs text-[var(--text-3)]">
              {data.state.connectionCount} active connection
              {data.state.connectionCount === 1 ? "" : "s"} across the workspace.
            </span>
          </div>
          {toggle.error ? (
            <p className="text-xs text-[var(--accent-danger)]">
              {toggle.error instanceof Error ? toggle.error.message : "Couldn't update."}
            </p>
          ) : null}
        </div>
      </SettingsCard>

      <SettingsCard
        number="02"
        title="Connect your Claude"
        right={
          <span className="text-[11px] uppercase tracking-wide text-[var(--text-3)]">
            {data.state.enabled ? "Admins only" : "Enable above"}
          </span>
        }
      >
        {data.state.enabled ? (
          <McpQuickStart setup={data.setup} />
        ) : (
          <p className="text-sm text-[var(--text-3)]">
            Turn MCP on above, then follow the steps here to connect Claude to your own account.
            Connecting is restricted to workspace admins.
          </p>
        )}
      </SettingsCard>

      <SettingsCard number="03" title="What Claude can do">
        <McpToolsCatalog variant="admin" />
      </SettingsCard>

      <SettingsCard
        number="04"
        title="Connections"
        right={
          <span className="text-[11px] uppercase tracking-wide text-[var(--text-3)]">
            {data.connections.length}
          </span>
        }
      >
        {data.connections.length === 0 ? (
          <p className="text-sm text-[var(--text-3)]">
            No active connections yet. Members connect Claude from{" "}
            <strong>Settings → Profile → Connected apps</strong>.
          </p>
        ) : (
          <ConnectionTable connections={data.connections} variant="admin" />
        )}
      </SettingsCard>
    </div>
  );
}

function ConnectionTable({
  connections,
  variant,
}: {
  connections: McpConnection[];
  variant: "admin" | "self";
}) {
  return (
    <div className="-mx-2 overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--text-3)]">
            <th className="px-2 py-2 font-medium">Client</th>
            {variant === "admin" ? <th className="px-2 py-2 font-medium">Member</th> : null}
            <th className="px-2 py-2 font-medium">Connected</th>
            <th className="px-2 py-2 font-medium">Last used</th>
            <th className="px-2 py-2" />
          </tr>
        </thead>
        <tbody>
          {connections.map((c) => (
            <ConnectionRow key={c.id} connection={c} variant={variant} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConnectionRow({
  connection,
  variant,
}: {
  connection: McpConnection;
  variant: "admin" | "self";
}) {
  const adminRevoke = useRevokeAdminConnection();
  const [confirming, setConfirming] = useState(false);

  const onRevoke = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    adminRevoke.mutate(connection.id);
  };

  return (
    <tr className="border-t border-[var(--border-1)] text-[var(--text-1)]">
      <td className="px-2 py-3">
        <div className="flex items-center gap-2">
          {connection.clientLogoUri ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={connection.clientLogoUri}
              alt=""
              className="h-5 w-5 rounded"
              width={20}
              height={20}
            />
          ) : (
            <div className="h-5 w-5 rounded bg-[var(--surface-2)]" />
          )}
          <div>
            <div className="font-medium">{connection.clientName}</div>
            {connection.label && connection.label !== connection.clientName ? (
              <div className="text-[11px] text-[var(--text-3)]">{connection.label}</div>
            ) : null}
          </div>
        </div>
      </td>
      {variant === "admin" ? (
        <td className="px-2 py-3">
          <div className="font-medium">{connection.user.name ?? connection.user.email}</div>
          <div className="text-[11px] text-[var(--text-3)]">{connection.user.email}</div>
        </td>
      ) : null}
      <td className="px-2 py-3 text-[var(--text-3)]">{formatDate(connection.connectedAt)}</td>
      <td className="px-2 py-3 text-[var(--text-3)]">
        {connection.lastUsedAt ? formatRelative(connection.lastUsedAt) : "—"}
      </td>
      <td className="px-2 py-3 text-right">
        <Button
          variant={confirming ? "danger" : "tertiary"}
          size="sm"
          loading={adminRevoke.isPending}
          onClick={onRevoke}
        >
          {confirming ? "Click again to confirm" : "Revoke"}
        </Button>
      </td>
    </tr>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} day${day === 1 ? "" : "s"} ago`;
  return formatDate(iso);
}
