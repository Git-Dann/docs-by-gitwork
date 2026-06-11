// Settings → Profile → Connected apps (per-user, any role with mcp.connect).
//
// Three sections:
//   01 // CONNECT      — copy-paste snippet block (only when MCP is enabled)
//   02 // CONNECTIONS  — the user's own active connections + per-row revoke
//   03 // ABOUT        — short rationale + link to Foundry docs
//
// No token is generated here — the OAuth flow runs in claude.ai (or the
// Claude Desktop / Code client), which calls our /api/oauth/* endpoints.
// All this panel does is hand the user the URL to paste.

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SettingsCard } from "@/components/settings/settings-card";
import {
  useMyMcp,
  useRevokeOwnConnection,
  type McpConnection,
} from "@/hooks/use-mcp";
import { McpToolsCatalog } from "@/components/settings/mcp-tools-catalog";

export function ConnectedAppsPanel() {
  const { data, isLoading, error } = useMyMcp();

  if (isLoading) {
    return <div className="text-sm text-[var(--text-3)]">Loading…</div>;
  }
  if (error || !data) {
    return (
      <div className="app-card p-6 text-sm text-[var(--text-3)]">
        Couldn&apos;t load connected apps. {error instanceof Error ? error.message : ""}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SettingsCard number="01" title="Connect Claude">
        {!data.setup.enabled ? (
          <div className="rounded-md border border-[var(--border-1)] bg-[var(--surface-2)] p-4 text-sm text-[var(--text-2)]">
            <p>
              MCP is currently disabled for this workspace. A Super Admin can turn it on under
              Settings → MCP.
            </p>
          </div>
        ) : (
          <ConnectInstructions setup={data.setup} />
        )}
      </SettingsCard>

      <SettingsCard number="02" title="What you can ask Claude">
        <McpToolsCatalog variant="user" />
      </SettingsCard>

      <SettingsCard
        number="03"
        title="Your connections"
        right={
          <span className="text-[11px] uppercase tracking-wide text-[var(--text-3)]">
            {data.connections.length}
          </span>
        }
      >
        {data.connections.length === 0 ? (
          <p className="text-sm text-[var(--text-3)]">
            You haven&apos;t connected any apps yet. Once Claude is connected it&apos;ll appear
            here with a Revoke button.
          </p>
        ) : (
          <SelfConnectionList connections={data.connections} />
        )}
      </SettingsCard>

      <SettingsCard number="04" title="About">
        <div className="space-y-2 text-sm text-[var(--text-2)]">
          <p>
            <strong>What this is:</strong> connecting Claude lets it use Foundry tools (list
            clients, create tasks, etc.) on your behalf, scoped by your existing permissions.
            Anything Claude does shows up as your activity.
          </p>
          <p>
            <strong>Revoking:</strong> hitting Revoke kills the access and refresh token
            immediately — Claude will need to be reconnected before it can call again.
          </p>
        </div>
      </SettingsCard>
    </div>
  );
}

function ConnectInstructions({ setup }: { setup: { mcpUrl: string; claudeCodeSnippet: string; claudeDesktopSnippet: string } }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-2)]">
        In <strong>claude.ai</strong> (or the desktop app), open{" "}
        <em>Settings → Connectors → Add custom connector</em> and paste:
      </p>
      <CopyBlock label="MCP URL" value={setup.mcpUrl} />
      <details className="rounded-md border border-[var(--border-1)] p-3">
        <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-[var(--text-3)]">
          Claude Desktop / Claude Code (advanced)
        </summary>
        <div className="mt-3 space-y-3">
          <div>
            <p className="text-xs text-[var(--text-3)]">Claude Code CLI:</p>
            <CopyBlock label="" value={setup.claudeCodeSnippet} />
          </div>
          <div>
            <p className="text-xs text-[var(--text-3)]">Claude Desktop config:</p>
            <CopyBlock label="" value={setup.claudeDesktopSnippet} mono />
          </div>
        </div>
      </details>
    </div>
  );
}

function CopyBlock({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard not available (older browsers / insecure context) — no-op.
    }
  };
  return (
    <div>
      {label ? (
        <p className="mb-1 text-[11px] uppercase tracking-wide text-[var(--text-3)]">{label}</p>
      ) : null}
      <div className="flex items-stretch gap-2">
        <pre
          className={`flex-1 overflow-x-auto rounded-md border border-[var(--border-1)] bg-[var(--surface-2)] px-3 py-2 text-xs ${mono ? "font-mono" : ""}`}
        >
          {value}
        </pre>
        <Button variant="secondary" size="sm" onClick={onCopy}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

function SelfConnectionList({ connections }: { connections: McpConnection[] }) {
  return (
    <div className="-mx-2 overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--text-3)]">
            <th className="px-2 py-2 font-medium">Client</th>
            <th className="px-2 py-2 font-medium">Connected</th>
            <th className="px-2 py-2 font-medium">Last used</th>
            <th className="px-2 py-2" />
          </tr>
        </thead>
        <tbody>
          {connections.map((c) => (
            <SelfConnectionRow key={c.id} connection={c} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SelfConnectionRow({ connection }: { connection: McpConnection }) {
  const revoke = useRevokeOwnConnection();
  const [confirming, setConfirming] = useState(false);

  const onClick = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    revoke.mutate(connection.id);
  };

  return (
    <tr className="border-t border-[var(--border-1)]">
      <td className="px-2 py-3 font-medium text-[var(--text-1)]">{connection.clientName}</td>
      <td className="px-2 py-3 text-[var(--text-3)]">{formatDate(connection.connectedAt)}</td>
      <td className="px-2 py-3 text-[var(--text-3)]">
        {connection.lastUsedAt ? formatRelative(connection.lastUsedAt) : "—"}
      </td>
      <td className="px-2 py-3 text-right">
        <Button
          variant={confirming ? "danger" : "tertiary"}
          size="sm"
          loading={revoke.isPending}
          onClick={onClick}
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
