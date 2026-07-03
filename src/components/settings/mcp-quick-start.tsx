// The MCP "quick start" — the guided connect flow (deep link to Claude's
// connectors, one-click copy of the connector URL, three steps, advanced
// snippets). Shared by both MCP settings surfaces:
//   • Settings → MCP (admin panel) — so an admin can connect right there.
//   • Settings → Profile → Connected apps (per-user panel).

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

const CLAUDE_CONNECTORS_URL = "https://claude.ai/settings/connectors";

export type McpQuickStartSetup = {
  mcpUrl: string;
  claudeCodeSnippet: string;
  claudeDesktopSnippet: string;
};

export function McpQuickStart({ setup }: { setup: McpQuickStartSetup }) {
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
          <a
            href={CLAUDE_CONNECTORS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block"
          >
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
            ask Claude to do something (see the tools below).
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

export function CopyBlock({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
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
