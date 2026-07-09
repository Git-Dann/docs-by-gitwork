// Settings → MCP — one page for everyone with mcp.connect, self-gating its
// Super-Admin-only sections internally (merged with the former standalone
// "Connected apps" page, which now redirects here).
//
// Sections, numbered sequentially and adjusted by role:
//   Super Admin only — Status (workspace toggle + connection count)
//   Everyone         — Quick start (copy-paste connector snippets)
//   Everyone         — What you can ask Claude (tools catalog, with examples)
//   Everyone         — Your connections (own connections + revoke)
//   Super Admin only — All connections (workspace-wide, with revoke)
//   Everyone         — About

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SettingsCard } from "@/components/settings/settings-card";
import { usePermissions } from "@/hooks/use-permissions";
import {
  useMcpAdmin,
  useToggleMcp,
  useRevokeAdminConnection,
  useMyMcp,
  useRevokeOwnConnection,
  type McpConnection,
} from "@/hooks/use-mcp";
import { McpToolsCatalog } from "@/components/settings/mcp-tools-catalog";

export function McpAdminPanel() {
  const { isSuperAdmin, isPending: permissionsPending } = usePermissions();
  const my = useMyMcp();
  // Skip the admin fetch entirely for non-Super-Admins — no doomed request, no 403 noise.
  const admin = useMcpAdmin(isSuperAdmin);
  const toggle = useToggleMcp();

  if (my.isLoading || permissionsPending) {
    return <div className="text-sm text-[var(--text-3)]">Loading…</div>;
  }
  if (my.error || !my.data) {
    return (
      <div className="app-card p-6 text-sm text-[var(--text-3)]">
        Couldn&apos;t load MCP settings.{" "}
        {my.error instanceof Error ? my.error.message : ""}
      </div>
    );
  }

  const isConnected = my.data.connections.length > 0;
  let n = 0;
  const next = () => String(++n).padStart(2, "0");

  return (
    <div className="space-y-4">
      {isSuperAdmin ? (
        <SettingsCard
          number={next()}
          title="Status"
          right={
            admin.data ? (
              <span className="text-[11px] uppercase tracking-wide text-[var(--text-3)]">
                {admin.data.state.enabled ? "Enabled" : "Disabled"}
              </span>
            ) : null
          }
        >
          {admin.isLoading ? (
            <div className="text-sm text-[var(--text-3)]">Loading…</div>
          ) : admin.error || !admin.data ? (
            <div className="text-sm text-[var(--text-3)]">
              Couldn&apos;t load the workspace toggle.{" "}
              {admin.error instanceof Error ? admin.error.message : ""}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-[var(--text-2)]">
                MCP is Foundry&apos;s in-app endpoint that lets Claude (and other MCP-compatible
                clients) act on a member&apos;s behalf. Each user authorizes their own connection;
                this toggle is the workspace-wide kill switch.
              </p>
              <div className="flex items-center gap-3">
                <Button
                  variant={admin.data.state.enabled ? "secondary" : "primary"}
                  loading={toggle.isPending}
                  onClick={() => toggle.mutate(!admin.data!.state.enabled)}
                >
                  {admin.data.state.enabled ? "Disable MCP" : "Enable MCP"}
                </Button>
                <span className="text-xs text-[var(--text-3)]">
                  {admin.data.state.connectionCount} active connection
                  {admin.data.state.connectionCount === 1 ? "" : "s"} across the workspace.
                </span>
              </div>
              {toggle.error ? (
                <p className="text-xs text-[var(--accent-danger)]">
                  {toggle.error instanceof Error ? toggle.error.message : "Couldn't update."}
                </p>
              ) : null}
            </div>
          )}
        </SettingsCard>
      ) : null}

      <SettingsCard
        number={next()}
        title="Quick start"
        right={
          my.data.setup.enabled ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-[var(--text-3)]">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isConnected ? "bg-[var(--success-500)]" : "bg-[var(--border-3)]"
                }`}
              />
              {isConnected ? "Connected" : "Not connected"}
            </span>
          ) : (
            <span className="text-[11px] uppercase tracking-wide text-[var(--text-3)]">Disabled</span>
          )
        }
      >
        {!my.data.setup.enabled ? (
          <div className="rounded-md border border-[var(--border-1)] bg-[var(--surface-2)] p-4 text-sm text-[var(--text-2)]">
            <p>
              MCP is currently disabled for this workspace.
              {isSuperAdmin ? " Use the Status section above to turn it on." : " Ask a Super Admin to turn it on."}
            </p>
          </div>
        ) : (
          <QuickStart setup={my.data.setup} />
        )}
      </SettingsCard>

      <SettingsCard number={next()} title="What you can ask Claude">
        <McpToolsCatalog variant="user" />
      </SettingsCard>

      <SettingsCard
        number={next()}
        title="Your connections"
        right={
          <span className="text-[11px] uppercase tracking-wide text-[var(--text-3)]">
            {my.data.connections.length}
          </span>
        }
      >
        {my.data.connections.length === 0 ? (
          <p className="text-sm text-[var(--text-3)]">
            You haven&apos;t connected any apps yet. Once Claude is connected it&apos;ll appear
            here with a Revoke button.
          </p>
        ) : (
          <SelfConnectionList connections={my.data.connections} />
        )}
      </SettingsCard>

      {isSuperAdmin ? (
        <SettingsCard
          number={next()}
          title="All connections"
          right={
            <span className="text-[11px] uppercase tracking-wide text-[var(--text-3)]">
              {admin.data?.connections.length ?? 0}
            </span>
          }
        >
          {admin.isLoading ? (
            <div className="text-sm text-[var(--text-3)]">Loading…</div>
          ) : !admin.data || admin.data.connections.length === 0 ? (
            <p className="text-sm text-[var(--text-3)]">
              No active connections yet across the workspace.
            </p>
          ) : (
            <ConnectionTable connections={admin.data.connections} variant="admin" />
          )}
        </SettingsCard>
      ) : null}

      <SettingsCard number={next()} title="About">
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

const CLAUDE_CONNECTORS_URL = "https://claude.ai/settings/connectors";

function QuickStart({
  setup,
}: {
  setup: { mcpUrl: string; claudeCodeSnippet: string; claudeDesktopSnippet: string };
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-2)]">
        Connect once and Claude can drive Foundry for you — everything it does runs as you and
        respects your permissions. Takes about a minute.
      </p>

      <ol className="space-y-3">
        <Step n="1" title="Open Claude connectors">
          <p className="text-sm text-[var(--text-2)]">
            In claude.ai, go to Settings → Connectors and choose{" "}
            <strong>Add custom connector</strong>.
          </p>
          <a href={CLAUDE_CONNECTORS_URL} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block">
            <Button variant="primary" size="sm">
              Open Claude connectors ↗
            </Button>
          </a>
        </Step>

        <Step n="2" title="Paste this connector URL">
          <CopyBlock label="" value={setup.mcpUrl} />
        </Step>

        <Step n="3" title="Authorize with Foundry">
          <p className="text-sm text-[var(--text-2)]">
            Claude opens a Foundry sign-in — approve it and the connection appears below. Then just
            ask Claude to do something (see the examples in the next section).
          </p>
        </Step>
      </ol>

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

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--brand-50)] font-mono text-[11px] font-medium text-[var(--brand-700)]">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--text-1)]">{title}</p>
        <div className="mt-1">{children}</div>
      </div>
    </li>
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
