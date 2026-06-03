"use client";

import { useState } from "react";
import {
  CpuChipIcon,
  PencilIcon,
  ArrowPathIcon,
  ChevronRightIcon,
  CheckIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useAgents, useSaveAgent, useResetAgent, type AgentConfigRecord } from "@/hooks/use-agents";
import { SettingsCard } from "@/components/settings/settings-card";
import { cn } from "@/lib/format";

const PRODUCT_LABELS: Record<string, string> = {
  pulse: "Pulse",
  study: "Study",
};

export function AgentsPanel() {
  const { data: agents = [], isLoading } = useAgents();
  const [editing, setEditing] = useState<AgentConfigRecord | null>(null);

  const byProduct = agents.reduce<Record<string, AgentConfigRecord[]>>((acc, a) => {
    if (!acc[a.product]) acc[a.product] = [];
    acc[a.product].push(a);
    return acc;
  }, {});

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-[var(--text-3)]">
        <ArrowPathIcon className="size-4 animate-spin" />
        Loading agents…
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {Object.entries(byProduct).map(([product, productAgents], i) => (
        <SettingsCard
          key={product}
          number={String(i + 1).padStart(2, "0")}
          title={PRODUCT_LABELS[product] ?? product}
          bodyClassName="p-0"
        >
          <div className="divide-y divide-[var(--border-2)]">
            {productAgents.map((agent) => (
              <AgentRow
                key={agent.agentKey}
                agent={agent}
                onEdit={() => setEditing(agent)}
              />
            ))}
          </div>
        </SettingsCard>
      ))}

      {editing && (
        <AgentDrawer
          agent={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function AgentRow({
  agent,
  onEdit,
}: {
  agent: AgentConfigRecord;
  onEdit: () => void;
}) {
  const saveAgent = useSaveAgent();

  const hasOverride = agent.systemPromptOverride !== null || agent.modelOverride !== null || !agent.enabled;

  return (
    <div className="flex items-center gap-4 px-4 py-3.5">
      <div className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg",
        agent.enabled ? "bg-[var(--brand-50)] text-[var(--brand-600)]" : "bg-[var(--surface-2)] text-[var(--text-3)]",
      )}>
        <CpuChipIcon className="size-4" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[var(--text-1)]">{agent.name}</span>
          {hasOverride && (
            <span className="rounded-[4px] bg-[var(--brand-50)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--brand-600)]">
              customised
            </span>
          )}
          {!agent.enabled && (
            <span className="rounded-[4px] bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">
              disabled
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-[var(--text-3)]">{agent.description}</p>
      </div>

      <div className="flex items-center gap-2">
        {/* Enable / disable toggle */}
        <button
          type="button"
          onClick={() => saveAgent.mutate({ agentKey: agent.agentKey, enabled: !agent.enabled })}
          className={cn(
            "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none",
            agent.enabled ? "bg-[var(--brand-600)]" : "bg-[var(--border-2)]",
          )}
          title={agent.enabled ? "Disable agent" : "Enable agent"}
        >
          <span
            className={cn(
              "inline-block size-4 transform rounded-full bg-white shadow transition",
              agent.enabled ? "translate-x-4" : "translate-x-0",
            )}
          />
        </button>

        {/* Edit button — only for agents with a customisable prompt */}
        {agent.hasPrompt && (
          <button
            type="button"
            onClick={onEdit}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border-2)] bg-[var(--surface-0)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-2)] transition hover:border-[var(--brand-300)] hover:text-[var(--brand-600)]"
          >
            <PencilIcon className="size-3.5" />
            Edit
          </button>
        )}

        <ChevronRightIcon className="size-4 text-[var(--text-3)]" />
      </div>
    </div>
  );
}

function AgentDrawer({
  agent,
  onClose,
}: {
  agent: AgentConfigRecord;
  onClose: () => void;
}) {
  const saveAgent = useSaveAgent();
  const resetAgent = useResetAgent();
  const [prompt, setPrompt] = useState(agent.systemPromptOverride ?? "");
  const [modelOverride, setModelOverride] = useState(agent.modelOverride ?? "");
  const [saving, setSaving] = useState(false);

  const isDirty =
    prompt !== (agent.systemPromptOverride ?? "") ||
    modelOverride !== (agent.modelOverride ?? "");

  async function handleSave() {
    setSaving(true);
    await saveAgent.mutateAsync({
      agentKey: agent.agentKey,
      systemPromptOverride: prompt.trim() || null,
      modelOverride: modelOverride.trim() || null,
    });
    setSaving(false);
    onClose();
  }

  async function handleReset() {
    await resetAgent.mutateAsync(agent.agentKey);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/30" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-xl flex-col bg-[var(--surface-0)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-2)] px-6 py-4">
          <div>
            <p className="app-eyebrow mb-0.5">{PRODUCT_LABELS[agent.product] ?? agent.product}</p>
            <h3 className="text-base font-semibold text-[var(--text-1)]">{agent.name}</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-[var(--surface-2)]">
            <XMarkIcon className="size-5 text-[var(--text-3)]" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          <p className="text-sm text-[var(--text-3)]">{agent.description}</p>

          {/* System prompt override */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-[var(--text-2)]">
              System prompt override
            </label>
            <p className="mb-2 text-xs text-[var(--text-3)]">
              Leave blank to use the built-in default prompt. When set, this replaces the default entirely.
            </p>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Paste a custom system prompt here…"
              className="w-full rounded-xl border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2.5 font-mono text-xs text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:border-[var(--brand-400)] focus:outline-none"
              rows={14}
            />
            {prompt && (
              <p className="mt-1 text-xs text-[var(--text-3)]">
                {prompt.length.toLocaleString()} characters · {prompt.split(/\s+/).filter(Boolean).length.toLocaleString()} words
              </p>
            )}
          </div>

          {/* Model override */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-[var(--text-2)]">
              Model override
            </label>
            <p className="mb-2 text-xs text-[var(--text-3)]">
              Leave blank to use the workspace default model. Example: <code className="font-mono">claude-opus-4-5</code>
            </p>
            <input
              type="text"
              value={modelOverride}
              onChange={(e) => setModelOverride(e.target.value)}
              placeholder="e.g. claude-opus-4-5"
              className="w-full rounded-xl border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2 font-mono text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:border-[var(--brand-400)] focus:outline-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--border-2)] px-6 py-4">
          <button
            type="button"
            onClick={handleReset}
            disabled={resetAgent.isPending}
            className="flex items-center gap-1.5 text-sm text-[var(--text-3)] hover:text-red-600 disabled:opacity-50"
          >
            <ArrowPathIcon className="size-4" />
            Reset to default
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[var(--border-2)] px-4 py-2 text-sm font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !isDirty}
              className="flex items-center gap-1.5 rounded-xl bg-[var(--brand-600)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-700)] disabled:opacity-50"
            >
              {saving ? <ArrowPathIcon className="size-4 animate-spin" /> : <CheckIcon className="size-4" />}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
