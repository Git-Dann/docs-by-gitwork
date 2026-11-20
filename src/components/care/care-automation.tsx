"use client";

import { ClipboardDocumentListIcon, DocumentTextIcon, PencilSquareIcon, PlusIcon, SparklesIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import { cn } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/motion/spinner";
import type { AuditLog, WorkflowRule } from "@/types/support";
import { useCreateWorkflowRule, useDeleteWorkflowRule, useSeedDefaultRules, useSupportAuditLogs, useSupportClients, useSupportConnections, useSupportWorkflowRules, useSyncConnection, useUpdateSupportClient, useUpdateWorkflowRule } from "@/hooks/use-support";
import { useClientList } from "@/hooks/use-proposals";
import { usePermissions } from "@/hooks/use-permissions";
import Link from "next/link";
import { CareModal, formatShort } from "./care-shared";
import { SourceIcon } from "./care-constants";

// ─── add / edit rule modal ────────────────────────────────────────────────────

function RuleModal({
  clientId,
  rule,
  onClose,
}: {
  clientId: string;
  rule?: WorkflowRule | null;
  onClose: () => void;
}) {
  const isEdit = Boolean(rule);
  const [name, setName] = useState(rule?.name ?? "");
  const [when, setWhen] = useState(rule?.when ?? "");
  const [then, setThen] = useState(rule?.then ?? "");
  const [requiresApproval, setRequiresApproval] = useState(rule?.requiresApproval ?? false);
  const [error, setError] = useState<string | null>(null);
  const createRule = useCreateWorkflowRule(clientId);
  const updateRule = useUpdateWorkflowRule(clientId);
  const isPending = createRule.isPending || updateRule.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const data = { name: name.trim(), when: when.trim(), then: then.trim(), requiresApproval };
    if (isEdit && rule) {
      updateRule.mutate(
        { ruleId: rule.id, data },
        {
          onSuccess: () => onClose(),
          onError: (err) => setError(err instanceof Error ? err.message : "Failed to update rule"),
        },
      );
    } else {
      createRule.mutate(data, {
        onSuccess: () => onClose(),
        onError: (err) => setError(err instanceof Error ? err.message : "Failed to create rule"),
      });
    }
  }

  return (
    <CareModal title={isEdit ? "Edit workflow rule" : "Add workflow rule"} onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-[var(--text-3)]">
          Rules are read by the AI when processing inbound messages. Write conditions and actions in plain language.
        </p>

        <label className="block space-y-1.5">
          <span className="app-field-label">Rule name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="app-input w-full"
            placeholder="e.g. Escalate billing issues"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="app-field-label">When…</span>
          <textarea
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            required
            rows={2}
            className="app-input w-full resize-none"
            placeholder="e.g. A message mentions a refund, payment failure, or billing dispute"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="app-field-label">Then…</span>
          <textarea
            value={then}
            onChange={(e) => setThen(e.target.value)}
            required
            rows={2}
            className="app-input w-full resize-none"
            placeholder="e.g. Set ticket priority to Urgent and assign to the billing team"
          />
        </label>

        <label className="flex cursor-pointer items-start gap-3 rounded-[10px] border border-[var(--border-2)] p-3.5">
          <input
            type="checkbox"
            checked={requiresApproval}
            onChange={(e) => setRequiresApproval(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0"
          />
          <div>
            <p className="text-sm font-medium text-[var(--text-1)]">Require approval before executing</p>
            <p className="text-xs text-[var(--text-4)]">
              The AI will draft the action but wait for a team member to approve it before it runs.
            </p>
          </div>
        </label>

        {error && (
          <p className="rounded-[10px] bg-[var(--danger-50)] px-3 py-2.5 text-sm text-[var(--danger-500)]">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={isPending || !name.trim() || !when.trim() || !then.trim()}
            loading={isPending}
          >
            {isPending ? "Saving…" : isEdit ? "Update rule" : "Save rule"}
          </Button>
        </div>
      </form>
    </CareModal>
  );
}



// ─── agent edit modal ─────────────────────────────────────────────────────────

function EditAgentModal({
  clientId,
  agentKey,
  agentLabel,
  defaultDescription,
  onClose,
}: {
  clientId: string;
  agentKey: string;
  agentLabel: string;
  defaultDescription: string;
  onClose: () => void;
}) {
  const storageKey = `care.agent.instructions.${clientId}.${agentKey}`;
  const [value, setValue] = useState(() => {
    try { return localStorage.getItem(storageKey) ?? defaultDescription; } catch { return defaultDescription; }
  });

  function handleSave() {
    try { localStorage.setItem(storageKey, value); } catch { /* ignore */ }
    onClose();
  }

  return (
    <CareModal title={`Edit — ${agentLabel}`} onClose={onClose} wide>
      <div className="space-y-4">
        <p className="text-sm text-[var(--text-3)]">
          Describe what this agent should do. The orchestrator passes these instructions when running the pipeline.
        </p>
        <label className="block space-y-1.5">
          <span className="app-field-label">Instructions</span>
          <textarea
            rows={6}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full resize-none rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3 text-sm text-[var(--text-1)] outline-none transition focus:border-[var(--brand-700)] focus:bg-white"
          />
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="button" variant="primary" size="sm" onClick={handleSave}>Save</Button>
        </div>
      </div>
    </CareModal>
  );
}

// ─── agents view ─────────────────────────────────────────────────────────────

type AgentToggles = { ingest: boolean; triage: boolean; draft: boolean };

interface AgentCardDef {
  key: keyof AgentToggles;
  label: string;
  description: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
}

const AGENT_CARDS: AgentCardDef[] = [
  {
    key: "ingest",
    label: "Ingest Filter",
    description: "AI reviews raw items from all sources and filters noise — only genuine support signals create conversations.",
    icon: SparklesIcon,
    iconBg: "bg-[var(--mist)]",
    iconColor: "text-[var(--brand-700)]",
  },
  {
    key: "triage",
    label: "Triage",
    description: "Classifies each conversation, sets priority and sentiment, and creates tickets for trackable issues.",
    icon: ClipboardDocumentListIcon,
    iconBg: "bg-amber-50",
    iconColor: "text-amber-700",
  },
  {
    key: "draft",
    label: "Draft",
    description: "Generates pending-approval reply drafts for ticketed conversations, ready for your review.",
    icon: DocumentTextIcon,
    iconBg: "bg-purple-50",
    iconColor: "text-purple-700",
  },
];

function AgentsView({ clientId, firstNumber = 1 }: { clientId: string; firstNumber?: number }) {
  const [toggles, setToggles] = useState<AgentToggles>({ ingest: true, triage: true, draft: true });
  const [editingAgent, setEditingAgent] = useState<AgentCardDef | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`care.agents.${clientId}`);
      if (stored) {
        setToggles(JSON.parse(stored) as AgentToggles);
      }
    } catch {
      // ignore parse errors
    }
  }, [clientId]);

  function toggle(key: keyof AgentToggles) {
    setToggles((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(`care.agents.${clientId}`, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }

  const { data: connectionsData } = useSupportConnections(clientId);
  const connections = connectionsData?.connections ?? [];
  const syncConn = useSyncConnection(clientId);
  const [syncResults, setSyncResults] = useState<
    Record<string, { ingested?: number; filtered?: number; errors: string[] } | null>
  >({});

  async function handleSync(connId: string) {
    setSyncResults((prev) => ({ ...prev, [connId]: null }));
    const result = await syncConn.mutateAsync({ connId, resync: false });
    setSyncResults((prev) => ({ ...prev, [connId]: result }));
  }

  const { data: logsData } = useSupportAuditLogs(clientId);
  const agentLogs = (logsData?.logs ?? []).filter((l: AuditLog) => l.actor.startsWith("agent:"));

  const AGENT_BADGE: Record<string, string> = {
    ingest: "bg-[var(--mist)] text-[var(--brand-700)]",
    triage: "bg-amber-50 text-amber-700",
    draft: "bg-purple-50 text-purple-700",
    orchestrator: "bg-[var(--mist)] text-[var(--brand-700)]",
  };

  // Numbers run on from whatever precedes this view, and skip the sections that aren't shown,
  // so the NN // sequence never has a hole.
  const pad = (n: number) => String(n).padStart(2, "0");
  const syncNo = firstNumber + 1;
  const activityNo = firstNumber + (connections.length > 0 ? 2 : 1);

  return (
    <div className="space-y-6">
      {/* agent cards */}
      <section>
        <div className="app-card mb-4 overflow-hidden p-0">
          <div className="flex h-9 items-center justify-between border-b border-black/[0.06] px-4">
            <span className="font-mono text-[10px] font-medium uppercase tracking-[1.2px] text-[var(--text-4)]">
              {pad(firstNumber)} {"//"} AGENT PIPELINE
            </span>
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.8px] text-emerald-600">
              LIVE
            </span>
          </div>
          <div className="grid gap-4 p-4 sm:grid-cols-3">
          {AGENT_CARDS.map((agent) => {
            const enabled = toggles[agent.key];
            return (
              <div key={agent.key} className="rounded-lg border border-[var(--border-2)] bg-[var(--surface-1)] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]",
                      agent.iconBg,
                      agent.iconColor,
                    )}
                  >
                    <agent.icon className="h-5 w-5" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditingAgent(agent)}
                      title="Edit instructions"
                      className="flex h-6 w-6 items-center justify-center rounded-[6px] text-[var(--text-4)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-2)]"
                    >
                      <PencilSquareIcon className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggle(agent.key)}
                      className={cn(
                        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                        enabled ? "bg-[var(--brand-700)]" : "bg-[var(--border-2)]",
                      )}
                      aria-checked={enabled}
                      role="switch"
                    >
                      <span
                        className={cn(
                          "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform",
                          enabled ? "translate-x-4" : "translate-x-0",
                        )}
                      />
                    </button>
                  </div>
                </div>
                <p className="mt-3 text-sm font-semibold text-[var(--text-1)]">{agent.label}</p>
                <p className="mt-1 text-xs text-[var(--text-3)]">
                  {(() => {
                    try {
                      return localStorage.getItem(`care.agent.instructions.${clientId}.${agent.key}`) ?? agent.description;
                    } catch {
                      return agent.description;
                    }
                  })()}
                </p>
              </div>
            );
          })}
          </div>
        </div>
      </section>

      {/* manual sync */}
      {connections.length > 0 && (
        <section>
          <div className="app-card overflow-hidden p-0">
            {/* widget header */}
            <div className="flex h-9 items-center justify-between border-b border-black/[0.06] px-4">
              <span className="font-mono text-[10px] font-medium uppercase tracking-[1.2px] text-[var(--text-4)]">
                {pad(syncNo)} {"//"} MANUAL SYNC
              </span>
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.8px] text-[var(--text-4)]">
                {connections.length}
              </span>
            </div>
            {connections.map((conn, idx) => {
              const pending = syncConn.isPending && syncConn.variables === conn.id;
              const sr = syncResults[conn.id];
              return (
                <div
                  key={conn.id}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-4 px-5 py-4",
                    idx > 0 && "border-t border-[var(--border-2)]",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px]",
                        conn.health === "connected"
                          ? "bg-emerald-50 text-emerald-600"
                          : conn.health === "error"
                            ? "bg-red-50 text-red-500"
                            : "bg-[var(--surface-1)] text-[var(--text-3)]",
                      )}
                    >
                      <SourceIcon source={conn.source} className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[var(--text-1)]">{conn.label}</span>
                        <span
                          className={cn(
                            "rounded-md px-2 py-0.5 text-[10px] font-semibold",
                            conn.health === "connected"
                              ? "bg-emerald-50 text-emerald-700"
                              : conn.health === "error"
                                ? "bg-red-50 text-red-600"
                                : "bg-amber-50 text-amber-700",
                          )}
                        >
                          {conn.health === "connected" ? "Connected" : conn.health === "error" ? "Error" : "Needs setup"}
                        </span>
                      </div>
                      {sr !== undefined && sr !== null && (
                        <p className={cn("mt-0.5 text-[11px]", sr.errors.length > 0 ? "text-red-500" : "text-emerald-600")}>
                          {sr.errors.length > 0
                            ? `Error: ${sr.errors[0]}`
                            : `${sr.ingested ?? 0} ingested, ${sr.filtered ?? 0} filtered`}
                        </p>
                      )}
                      {pending && (
                        <p className="mt-0.5 text-[11px] text-[var(--text-4)]">Running agents…</p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSync(conn.id)}
                    disabled={syncConn.isPending}
                    className="flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-50"
                  >
                    {pending ? (
                      <>
                        <Spinner tone="brand" />
                        Running…
                      </>
                    ) : (
                      <>
                        <SparklesIcon className="h-3.5 w-3.5 text-[var(--brand-700)]" />
                        Run agents now
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* agent activity feed */}
      <section>
        {agentLogs.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--text-4)]">
            No agent activity yet — run a sync to get started.
          </p>
        ) : (
          <div className="app-card overflow-hidden p-0">
            {/* widget header */}
            <div className="flex h-9 items-center justify-between border-b border-black/[0.06] px-4">
              <span className="font-mono text-[10px] font-medium uppercase tracking-[1.2px] text-[var(--text-4)]">
                {pad(activityNo)} {"//"} AGENT ACTIVITY
              </span>
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.8px] text-emerald-600">
                LIVE
              </span>
            </div>
            {agentLogs.map((log: AuditLog, idx: number) => {
              const agentName = log.actor.replace("agent:", "");
              const badgeCls = AGENT_BADGE[agentName] ?? "bg-[var(--surface-1)] text-[var(--text-3)]";
              const actionLabel = log.action
                .replace(/_/g, " ")
                .replace(/\b\w/g, (c: string) => c.toUpperCase());
              return (
                <div
                  key={log.id}
                  className={cn(
                    "flex items-start justify-between gap-3 px-5 py-3.5",
                    idx > 0 && "border-t border-[var(--border-2)]",
                  )}
                >
                  <div className="flex min-w-0 items-start gap-2">
                    <span
                      className={cn(
                        "mt-0.5 shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold",
                        badgeCls,
                      )}
                    >
                      {agentName}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-[var(--text-2)]">{actionLabel}</p>
                      {log.target && (
                        <p className="mt-0.5 truncate text-xs text-[var(--text-3)]">{log.target}</p>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 text-[11px] text-[var(--text-4)]">
                    {formatShort(log.createdAt)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {editingAgent && (
        <EditAgentModal
          clientId={clientId}
          agentKey={editingAgent.key}
          agentLabel={editingAgent.label}
          defaultDescription={editingAgent.description}
          onClose={() => setEditingAgent(null)}
        />
      )}
    </div>
  );
}

// ─── portal link ─────────────────────────────────────────────────────────────

/**
 * Link this Care account to its Portal client record. Lived in the legacy dashboard's Settings
 * panel; it now sits with the client's channels in Care's settings, where the other per-client
 * setup is.
 */
export function PortalLinkCard({ clientId, number }: { clientId: string; number: number }) {
  const { canManageSupport } = usePermissions();
  const { data: clientData } = useSupportClients();
  const updateClient = useUpdateSupportClient(clientId);
  const { data: portalClientsData } = useClientList();

  const thisClient = (clientData?.clients ?? []).find((c) => c.id === clientId);
  const [linkedPortalId, setLinkedPortalId] = useState(thisClient?.workspaceClientId ?? "");

  // Keep the picker in sync if the client loads after mount.
  useEffect(() => {
    setLinkedPortalId(thisClient?.workspaceClientId ?? "");
  }, [thisClient?.workspaceClientId]);

  const portalClients = portalClientsData?.clients ?? [];

  return (
    <section className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">{String(number).padStart(2, "0")}</span>{" // PORTAL LINK"}
        </span>
        {thisClient?.workspaceClientId && <span className="widget-header__status">LINKED</span>}
      </div>
      <div className="widget-body">
        <p className="mb-3 text-sm text-[var(--text-3)]">
          Link this Care account to a client record in Portal. This surfaces a Care badge on the Portal client card and lets both views stay in sync.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={linkedPortalId}
            onChange={(e) => setLinkedPortalId(e.target.value)}
            className="app-select min-w-[200px] flex-1"
            disabled={!canManageSupport}
            aria-label="Portal client"
          >
            <option value="">— Not linked —</option>
            {portalClients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {canManageSupport ? (
            <Button
              type="button"
              variant="primary"
              size="sm"
              loading={updateClient.isPending}
              disabled={linkedPortalId === (thisClient?.workspaceClientId ?? "")}
              onClick={() => updateClient.mutate({ workspaceClientId: (linkedPortalId || null) as string | undefined })}
            >
              Save
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

// ─── automation: workflow rules + AI agents ──────────────────────────────────

/**
 * The client's automation: workflow rules first (what happens to a message), then the AI agent
 * pipeline that runs them. Both lived in the legacy dashboard's Settings panel.
 */
export function CareAutomationView({ clientId }: { clientId: string }) {
  const { canManageSupport } = usePermissions();
  const { data: rulesData, isLoading: rulesLoading } = useSupportWorkflowRules(clientId);
  const deleteRule = useDeleteWorkflowRule(clientId);
  const seedRules = useSeedDefaultRules(clientId);

  const [showAddRule, setShowAddRule] = useState(false);
  const [editingRule, setEditingRule] = useState<WorkflowRule | null>(null);

  const rules = rulesData?.rules ?? [];

  return (
    <div className="space-y-6">
      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label">
            <span className="widget-header__label--number">01</span>{" // WORKFLOW RULES"}
          </span>
          {canManageSupport ? (
            <button
              type="button"
              onClick={() => setShowAddRule(true)}
              className="flex items-center gap-1 rounded-[4px] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--brand-700)] transition hover:bg-[var(--surface-brand)]"
            >
              <PlusIcon className="h-3 w-3" />
              Add rule
            </button>
          ) : (
            <span className="widget-header__status">{rules.length} RULES</span>
          )}
        </div>
        {rulesLoading && <div className="h-20 animate-pulse bg-[var(--surface-1)]" />}
        {!rulesLoading && rules.length === 0 && (
          <div className="flex items-center justify-between gap-3 px-5 py-4">
            <p className="text-sm text-[var(--text-4)]">No rules configured yet.</p>
            {canManageSupport ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                loading={seedRules.isPending}
                onClick={() => seedRules.mutate()}
              >
                Restore defaults
              </Button>
            ) : null}
          </div>
        )}
        {rules.map((rule, idx) => (
          <div key={rule.id} className={cn("px-5 py-4", idx > 0 && "border-t border-[var(--border-2)]")}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[var(--text-1)]">{rule.name}</p>
                <p className="mt-1 text-xs text-[var(--text-3)]">
                  <span className="font-medium">When:</span> {rule.when}
                </p>
                <p className="mt-0.5 text-xs text-[var(--text-3)]">
                  <span className="font-medium">Then:</span> {rule.then}
                </p>
                {rule.requiresApproval && (
                  <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-[var(--warning-500)]">
                    Requires approval
                  </p>
                )}
              </div>
              {canManageSupport ? (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEditingRule(rule)}
                    className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[var(--text-4)] transition hover:bg-[var(--surface-brand)] hover:text-[var(--brand-700)]"
                    title="Edit rule"
                    aria-label={`Edit rule ${rule.name}`}
                  >
                    <PencilSquareIcon className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteRule.mutate(rule.id)}
                    disabled={deleteRule.isPending}
                    className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[var(--text-4)] transition hover:bg-[var(--danger-50)] hover:text-[var(--danger-500)]"
                    title="Delete rule"
                    aria-label={`Delete rule ${rule.name}`}
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </section>

      <AgentsView clientId={clientId} firstNumber={2} />

      {showAddRule && <RuleModal clientId={clientId} onClose={() => setShowAddRule(false)} />}
      {editingRule && <RuleModal clientId={clientId} rule={editingRule} onClose={() => setEditingRule(null)} />}
    </div>
  );
}
