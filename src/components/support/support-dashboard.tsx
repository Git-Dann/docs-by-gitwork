"use client";

import {
  BoltIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ClipboardDocumentListIcon,
  Cog8ToothIcon,
  DocumentTextIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
  InboxIcon,
  KeyIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  SparklesIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useState, useDeferredValue, useEffect, useRef } from "react";
import { cn } from "@/lib/format";
import type {
  Connection,
  Conversation,
  SupportClient,
  SupportSource,
  Ticket,
  TicketPriority,
  TicketStatus,
} from "@/types/support";
import {
  useSupportClients,
  useSupportConversations,
  useSupportMessages,
  useUpdateConversation,
  useSendMessage,
  useSupportTickets,
  useUpdateTicket,
  useSupportConnections,
  useSupportWorkflowRules,
  useSupportMembers,
  useSupportAuditLogs,
} from "@/hooks/use-support";

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatShort(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SourceIcon({ source, className }: { source: SupportSource; className?: string }) {
  const cls = cn("h-4 w-4", className);
  switch (source) {
    case "gmail":
      return <EnvelopeIcon className={cls} />;
    case "reddit":
    case "instagram":
    case "discord":
      return <ChatBubbleLeftRightIcon className={cls} />;
    case "youtube":
      return <BoltIcon className={cls} />;
    case "stripe":
      return <KeyIcon className={cls} />;
    case "clickup":
      return <ClipboardDocumentListIcon className={cls} />;
    default:
      return <BoltIcon className={cls} />;
  }
}

const SOURCE_LABEL: Record<SupportSource, string> = {
  gmail: "Gmail",
  reddit: "Reddit",
  instagram: "Instagram",
  youtube: "YouTube",
  discord: "Discord",
  clickup: "ClickUp",
  stripe: "Stripe",
};

const STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  dev_review: "Dev review",
  awaiting_customer: "Awaiting customer",
  resolved: "Resolved",
};

const STATUS_TONE: Record<TicketStatus, string> = {
  open: "bg-[var(--surface-1)] text-[var(--text-3)]",
  in_progress: "bg-amber-50 text-amber-700 border border-amber-200",
  dev_review: "bg-[var(--mist)] text-[var(--brand-700)] border border-[var(--mist-border)]",
  awaiting_customer: "bg-purple-50 text-purple-700 border border-purple-200",
  resolved: "bg-emerald-50 text-emerald-700 border border-emerald-200",
};

const PRIORITY_TONE: Record<TicketPriority, string> = {
  urgent: "bg-red-50 text-red-700 border border-red-200",
  high: "bg-amber-50 text-amber-700 border border-amber-200",
  normal: "bg-[var(--surface-1)] text-[var(--text-3)]",
  low: "bg-[var(--surface-1)] text-[var(--text-4)]",
};

// ─── tab types ───────────────────────────────────────────────────────────────

type Tab = "inbox" | "tickets" | "reports" | "connectors" | "settings";

// ─── inbox view ──────────────────────────────────────────────────────────────

function InboxView({ clientId }: { clientId: string }) {
  const { data: convoData, isLoading: convosLoading } = useSupportConversations(clientId);
  const convos = convoData?.conversations ?? [];

  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const deferred = useDeferredValue(search);
  const [replyText, setReplyText] = useState("");

  // Set first conversation when data loads
  useEffect(() => {
    if (convos.length > 0 && selectedConvId === null) {
      setSelectedConvId(convos[0].id);
    }
  }, [convos, selectedConvId]);

  const { data: msgData, isLoading: msgsLoading } = useSupportMessages(clientId, selectedConvId);
  const messages = msgData?.messages ?? [];

  const updateConversation = useUpdateConversation(clientId);
  const sendMessage = useSendMessage(clientId, selectedConvId);

  // Mark conversation as read when opened
  const markedReadRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!selectedConvId) return;
    const convo = convos.find((c) => c.id === selectedConvId);
    if (convo?.unread && !markedReadRef.current.has(selectedConvId)) {
      markedReadRef.current.add(selectedConvId);
      updateConversation.mutate({ convId: selectedConvId, data: { unread: false } });
    }
  }, [selectedConvId, convos, updateConversation]);

  const filtered = convos.filter(
    (c) =>
      !deferred ||
      c.subject.toLowerCase().includes(deferred.toLowerCase()) ||
      c.tags.some((t) => t.includes(deferred.toLowerCase())),
  );

  const activeConvo = convos.find((c) => c.id === selectedConvId) ?? null;

  function handleSend() {
    const body = replyText.trim();
    if (!body || !selectedConvId) return;
    sendMessage.mutate(
      { direction: "outbound", authorLabel: "Support", body },
      { onSuccess: () => setReplyText("") },
    );
  }

  return (
    <div className="grid min-h-0 gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
      {/* conversation list */}
      <div className="space-y-3">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-4)]" />
          <input
            className="h-9 w-full rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] pl-9 pr-3 text-sm text-[var(--text-1)] outline-none transition placeholder:text-[var(--text-4)] focus:border-[var(--brand-700)] focus:bg-white"
            placeholder="Search inbox…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="max-h-[calc(100vh-16rem)] space-y-2 overflow-y-auto pr-0.5">
          {convosLoading && (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-[12px] bg-[var(--surface-1)]" />
              ))}
            </div>
          )}
          {!convosLoading && filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-[var(--text-4)]">No conversations found.</p>
          )}
          {filtered.map((c) => (
            <ConversationCard
              key={c.id}
              convo={c}
              active={c.id === selectedConvId}
              onClick={() => setSelectedConvId(c.id)}
            />
          ))}
        </div>
      </div>

      {/* detail pane */}
      <div className="app-card min-w-0 overflow-hidden">
        {!activeConvo ? (
          <div className="flex h-40 items-center justify-center text-sm text-[var(--text-4)]">
            Select a conversation
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border-2)] px-5 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-3)]">
                  <SourceIcon source={activeConvo.source} />
                  <span>{SOURCE_LABEL[activeConvo.source]}</span>
                </div>
                <h2 className="mt-1 truncate text-base font-semibold text-[var(--text-1)]">
                  {activeConvo.subject}
                </h2>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-[11px] text-[var(--text-4)]">
                  {formatShort(activeConvo.receivedAt)}
                </span>
                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded-[8px] border border-[var(--border-2)] bg-white px-2.5 py-1.5 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
                >
                  <SparklesIcon className="h-3.5 w-3.5 text-[var(--brand-700)]" />
                  Draft AI reply
                </button>
              </div>
            </div>

            <div className="space-y-3 p-5">
              {msgsLoading && (
                <div className="space-y-2">
                  {[...Array(2)].map((_, i) => (
                    <div key={i} className="h-16 animate-pulse rounded-[10px] bg-[var(--surface-1)]" />
                  ))}
                </div>
              )}
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "rounded-[10px] border p-3.5 text-sm leading-6",
                    msg.direction === "inbound"
                      ? "border-[var(--border-2)] bg-[var(--surface-1)] text-[var(--text-2)]"
                      : "border-[var(--mist-border)] bg-[var(--mist)] text-[var(--text-1)]",
                  )}
                >
                  <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-[var(--text-3)]">
                    <span>{msg.authorLabel}</span>
                    <span>{formatShort(msg.createdAt)}</span>
                  </div>
                  {msg.body}
                </div>
              ))}
            </div>

            {/* reply box */}
            <div className="border-t border-[var(--border-2)] p-4">
              <textarea
                rows={3}
                className="w-full rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3 text-sm text-[var(--text-1)] outline-none transition placeholder:text-[var(--text-4)] focus:border-[var(--brand-700)] focus:bg-white resize-none"
                placeholder="Write a reply…"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
              />
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={sendMessage.isPending || !replyText.trim()}
                  className="rounded-[8px] bg-[var(--brand-700)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {sendMessage.isPending ? "Sending…" : "Send reply"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ConversationCard({
  convo,
  active,
  onClick,
}: {
  convo: Conversation;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-[12px] border p-3.5 text-left transition",
        active
          ? "border-[var(--mist-border)] bg-[var(--mist)] shadow-sm"
          : "border-[var(--border-2)] bg-white hover:border-[var(--mist-border)] hover:bg-[var(--surface-1)]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-3)]">
            <SourceIcon source={convo.source} />
            <span>{SOURCE_LABEL[convo.source]}</span>
            {convo.sentiment === "negative" && (
              <span className="h-2 w-2 rounded-full bg-red-400" title="Negative sentiment" />
            )}
            {convo.unread && (
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-700)]" title="Unread" />
            )}
          </div>
          <h3 className="mt-1.5 truncate text-sm font-semibold text-[var(--text-1)]">
            {convo.subject}
          </h3>
        </div>
        <span className="shrink-0 whitespace-nowrap text-[11px] text-[var(--text-4)]">
          {formatShort(convo.receivedAt)}
        </span>
      </div>
      <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-[var(--text-3)]">{convo.preview}</p>
      {convo.tags.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {convo.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-3)]"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

// ─── tickets view ────────────────────────────────────────────────────────────

function TicketsView({ clientId }: { clientId: string }) {
  const { data, isLoading } = useSupportTickets(clientId);
  const tickets = data?.tickets ?? [];

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-[12px] bg-[var(--surface-1)]" />
        ))}
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <div className="app-card flex h-40 items-center justify-center text-sm text-[var(--text-4)]">
        No tickets for this client yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {tickets.map((ticket) => (
        <TicketCard key={ticket.id} ticket={ticket} clientId={clientId} />
      ))}
    </div>
  );
}

function TicketCard({ ticket, clientId }: { ticket: Ticket; clientId: string }) {
  const updateTicket = useUpdateTicket(clientId);

  return (
    <div className="app-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold",
                STATUS_TONE[ticket.status],
              )}
            >
              {STATUS_LABEL[ticket.status]}
            </span>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold",
                PRIORITY_TONE[ticket.priority],
              )}
            >
              {ticket.priority}
            </span>
            <span className="text-[11px] text-[var(--text-4)]">{ticket.issueType}</span>
          </div>
          <h3 className="mt-2 text-[15px] font-semibold text-[var(--text-1)]">{ticket.title}</h3>
          <p className="mt-0.5 text-sm text-[var(--text-3)]">{ticket.customerLabel}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-[11px] text-[var(--text-4)]">
          <SourceIcon source={ticket.source} className="h-3.5 w-3.5" />
          <span>{SOURCE_LABEL[ticket.source]}</span>
          <span>·</span>
          <span>{formatShort(ticket.updatedAt)}</span>
        </div>
      </div>

      <div className="mt-3 border-t border-[var(--border-2)] pt-3">
        <p className="text-xs text-[var(--text-3)]">
          <span className="font-medium text-[var(--text-2)]">Next action:</span> {ticket.nextAction}
        </p>
        <p className="mt-1 text-xs text-[var(--text-4)]">Assigned to {ticket.assignedTo}</p>
        {ticket.status !== "resolved" && (
          <button
            type="button"
            onClick={() => updateTicket.mutate({ ticketId: ticket.id, data: { status: "resolved" } })}
            disabled={updateTicket.isPending}
            className="mt-2 rounded-[8px] border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
          >
            Mark resolved
          </button>
        )}
      </div>
    </div>
  );
}

// ─── reports view ────────────────────────────────────────────────────────────

function ReportsView({ client }: { client: SupportClient }) {
  const hasAllocation = client.supportDaysPerMonth != null;
  const used = client.supportDaysUsed ?? 0;
  const total = client.supportDaysPerMonth ?? 0;
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;

  return (
    <div className="space-y-4">
      {hasAllocation && (
        <div className="app-card p-5">
          <p className="text-sm font-medium text-[var(--text-3)]">Support days — {new Date().toLocaleString("en-GB", { month: "long", year: "numeric" })}</p>
          <div className="mt-4 flex items-end gap-4">
            <p className="text-[32px] font-semibold leading-none tracking-[-0.03em] text-[var(--text-1)]">
              {used}
              <span className="text-[18px] text-[var(--text-3)]">/{total}</span>
            </p>
            <p className="mb-1 text-sm text-[var(--text-4)]">{pct}% used</p>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--surface-1)]">
            <div
              className={cn("h-full rounded-full transition-all", pct > 90 ? "bg-red-400" : pct > 60 ? "bg-amber-400" : "bg-[var(--brand-700)]")}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-[var(--text-4)]">
            {total - used} days remaining · Report due {client.reportDueDay ? `day ${client.reportDueDay}` : "monthly"} → {client.reportingRecipient}
          </p>
        </div>
      )}

      <div className="app-card p-5">
        <p className="mb-3 text-sm font-medium text-[var(--text-3)]">Monthly report draft</p>
        <textarea
          rows={8}
          className="w-full rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3 text-sm text-[var(--text-1)] outline-none transition placeholder:text-[var(--text-4)] focus:border-[var(--brand-700)] focus:bg-white resize-none"
          placeholder={`Write the ${client.reportingRecipient ? `report for ${client.reportingRecipient}` : "monthly support report"} here…`}
        />
        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-[var(--text-4)]">Markdown supported</p>
          <button
            type="button"
            className="rounded-[8px] bg-[var(--brand-700)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            Save draft
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── connectors view ─────────────────────────────────────────────────────────

const AUTH_MODE_LABEL: Record<Connection["authMode"], string> = {
  oauth: "OAuth",
  bot_token: "Bot token",
  manual: "Manual / scraper",
  api_key: "API key",
};

function ConnectorsView({ clientId }: { clientId: string }) {
  const { data, isLoading } = useSupportConnections(clientId);
  const connections = data?.connections ?? [];

  if (isLoading) {
    return (
      <div className="app-card overflow-hidden p-0">
        {[...Array(3)].map((_, i) => (
          <div key={i} className={cn("h-20 animate-pulse bg-[var(--surface-1)]", i > 0 && "border-t border-[var(--border-2)]")} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="app-card overflow-hidden p-0">
        {connections.map((conn, idx) => (
          <div
            key={conn.id}
            className={cn(
              "flex flex-wrap items-start justify-between gap-4 px-5 py-4",
              idx > 0 && "border-t border-[var(--border-2)]",
            )}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px]",
                  conn.health === "connected"
                    ? "bg-emerald-50 text-emerald-600"
                    : "bg-[var(--surface-1)] text-[var(--text-3)]",
                )}
              >
                <SourceIcon source={conn.source} className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[var(--text-1)]">{conn.label}</span>
                  <span className="text-xs text-[var(--text-4)]">{SOURCE_LABEL[conn.source]}</span>
                </div>
                <p className="mt-0.5 text-xs text-[var(--text-3)]">{AUTH_MODE_LABEL[conn.authMode]}</p>
                {conn.nextStep && (
                  <p className="mt-1.5 text-xs leading-5 text-[var(--text-4)]">{conn.nextStep}</p>
                )}
                {conn.secretRef && (
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-[var(--text-4)]">
                    <KeyIcon className="h-3 w-3" />
                    {conn.secretRef}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {conn.health === "connected" ? (
                <span className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                  <CheckCircleIcon className="h-3.5 w-3.5" />
                  Connected
                </span>
              ) : (
                <span className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                  <ExclamationTriangleIcon className="h-3.5 w-3.5" />
                  Needs setup
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="flex w-full items-center justify-center gap-2 rounded-[12px] border border-dashed border-[var(--border-2)] py-3 text-sm font-medium text-[var(--text-3)] transition hover:border-[var(--brand-700)] hover:text-[var(--brand-700)]"
      >
        <PlusIcon className="h-4 w-4" />
        Add connector
      </button>
    </div>
  );
}

// ─── settings view ───────────────────────────────────────────────────────────

function SettingsView({ clientId }: { clientId: string }) {
  const { data: rulesData, isLoading: rulesLoading } = useSupportWorkflowRules(clientId);
  const { data: membersData, isLoading: membersLoading } = useSupportMembers(clientId);
  const { data: logsData, isLoading: logsLoading } = useSupportAuditLogs(clientId);

  const rules = rulesData?.rules ?? [];
  const members = membersData?.members ?? [];
  const logs = logsData?.logs ?? [];

  return (
    <div className="space-y-6">
      {/* workflow rules */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-[var(--text-2)]">Workflow rules</h3>
        <div className="app-card overflow-hidden p-0">
          {rulesLoading && (
            <div className="h-20 animate-pulse bg-[var(--surface-1)]" />
          )}
          {!rulesLoading && rules.length === 0 && (
            <p className="px-5 py-4 text-sm text-[var(--text-4)]">No rules configured.</p>
          )}
          {rules.map((rule, idx) => (
            <div
              key={rule.id}
              className={cn("px-5 py-4", idx > 0 && "border-t border-[var(--border-2)]")}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--text-1)]">{rule.name}</p>
                  <p className="mt-1 text-xs text-[var(--text-3)]">
                    <span className="font-medium">When:</span> {rule.when}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--text-3)]">
                    <span className="font-medium">Then:</span> {rule.then}
                  </p>
                </div>
                {rule.requiresApproval && (
                  <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                    Requires approval
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-[12px] border border-dashed border-[var(--border-2)] py-3 text-sm font-medium text-[var(--text-3)] transition hover:border-[var(--brand-700)] hover:text-[var(--brand-700)]"
        >
          <PlusIcon className="h-4 w-4" />
          Add rule
        </button>
      </section>

      {/* team */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-[var(--text-2)]">Team access</h3>
        <div className="app-card overflow-hidden p-0">
          {membersLoading && (
            <div className="h-16 animate-pulse bg-[var(--surface-1)]" />
          )}
          {members.map((user, idx) => (
            <div
              key={user.id}
              className={cn(
                "flex items-center justify-between px-5 py-3.5",
                idx > 0 && "border-t border-[var(--border-2)]",
              )}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--mist)] text-sm font-semibold text-[var(--brand-700)]">
                  {user.name[0]}
                </div>
                <div>
                  <p className="text-sm font-medium text-[var(--text-1)]">{user.name}</p>
                  <p className="text-xs text-[var(--text-4)]">{user.email}</p>
                </div>
              </div>
              <span className="rounded-full border border-[var(--border-2)] bg-[var(--surface-1)] px-2.5 py-1 text-[11px] font-semibold capitalize text-[var(--text-3)]">
                {user.role}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* audit log */}
      {(logsLoading || logs.length > 0) && (
        <section>
          <h3 className="mb-3 text-sm font-semibold text-[var(--text-2)]">Audit log</h3>
          <div className="app-card overflow-hidden p-0">
            {logsLoading && (
              <div className="h-16 animate-pulse bg-[var(--surface-1)]" />
            )}
            {logs.map((log, idx) => (
              <div
                key={log.id}
                className={cn("px-5 py-3.5", idx > 0 && "border-t border-[var(--border-2)]")}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-[var(--text-2)]">
                    <span className="font-medium">{log.actor}</span> {log.action}
                  </p>
                  <span className="shrink-0 text-[11px] text-[var(--text-4)]">
                    {formatShort(log.createdAt)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-[var(--text-4)]">{log.target}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── vault notice ─────────────────────────────────────────────────────────────

function VaultNotice() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className="app-card flex items-start gap-3 p-4">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-[var(--mist)] text-[var(--brand-700)]">
        <KeyIcon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[var(--text-1)]">Vault required</p>
        <p className="mt-0.5 text-xs leading-5 text-[var(--text-3)]">
          Store secrets in vault — never commit credentials.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="shrink-0 text-[var(--text-4)] transition hover:text-[var(--text-2)]"
        aria-label="Dismiss"
      >
        <XMarkIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── tab bar ─────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "inbox", label: "Inbox", icon: InboxIcon },
  { id: "tickets", label: "Tickets", icon: ClipboardDocumentListIcon },
  { id: "reports", label: "Reports", icon: DocumentTextIcon },
  { id: "connectors", label: "Connectors", icon: BoltIcon },
  { id: "settings", label: "Settings", icon: Cog8ToothIcon },
];

// ─── main dashboard ──────────────────────────────────────────────────────────

export function SupportDashboard() {
  const { data: clientsData, isLoading: clientsLoading } = useSupportClients();
  const clients = clientsData?.clients ?? [];

  const [activeClientId, setActiveClientId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<Tab>("inbox");

  // Set first client when data loads
  useEffect(() => {
    if (clients.length > 0 && !activeClientId) {
      setActiveClientId(clients[0].id);
    }
  }, [clients, activeClientId]);

  const client = clients.find((c) => c.id === activeClientId);

  // Inbox unread count for active client (from conversations query if cached)
  const { data: convoData } = useSupportConversations(activeClientId || null);
  const inboxUnread = (convoData?.conversations ?? []).filter((c) => c.unread).length;

  if (clientsLoading) {
    return (
      <div className="flex min-h-0 gap-0 -mx-6 sm:-mx-8">
        <aside className="hidden w-52 shrink-0 border-r border-[var(--border-2)] bg-[var(--surface-0)] lg:flex lg:flex-col">
          <div className="px-3 pb-2 pt-4 space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-9 animate-pulse rounded-[8px] bg-[var(--surface-1)]" />
            ))}
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 items-center justify-center">
          <p className="text-sm text-[var(--text-4)]">Loading…</p>
        </div>
      </div>
    );
  }

  if (!client) return null;

  return (
    <div className="flex min-h-0 gap-0 -mx-6 sm:-mx-8">
      {/* client sub-sidebar */}
      <aside className="hidden w-52 shrink-0 border-r border-[var(--border-2)] bg-[var(--surface-0)] lg:flex lg:flex-col">
        <div className="px-3 pb-2 pt-4">
          <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-4)]">
            Clients
          </p>
          <div className="space-y-0.5">
            {clients.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setActiveClientId(c.id);
                  setActiveTab("inbox");
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-[8px] px-3 py-2 text-left text-sm transition",
                  c.id === activeClientId
                    ? "bg-[var(--mist)] text-[var(--brand-700)]"
                    : "text-[var(--text-2)] hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]",
                )}
              >
                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    c.id === activeClientId ? "bg-[var(--brand-700)]" : "bg-[var(--text-4)]",
                  )}
                />
                <span className="flex-1 truncate font-medium">{c.name}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            className="mx-2 mt-2 flex w-[calc(100%-1rem)] items-center gap-2 rounded-[8px] border border-dashed border-[var(--border-2)] px-3 py-2 text-sm text-[var(--text-4)] transition hover:border-[var(--brand-700)] hover:text-[var(--brand-700)]"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Add client
          </button>
        </div>
      </aside>

      {/* main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* client name + tab bar */}
        <div className="border-b border-[var(--border-2)] px-6 sm:px-8">
          <div className="flex items-center justify-between pt-5 pb-0">
            <h2 className="text-[15px] font-semibold text-[var(--text-1)]">{client.name}</h2>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
              live
            </span>
          </div>

          <nav className="mt-3 flex gap-0 overflow-x-auto">
            {TABS.map((tab) => {
              const badge = tab.id === "inbox" ? inboxUnread : undefined;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition",
                    activeTab === tab.id
                      ? "border-[var(--brand-700)] text-[var(--brand-700)]"
                      : "border-transparent text-[var(--text-3)] hover:border-[var(--border-2)] hover:text-[var(--text-2)]",
                  )}
                >
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                  {badge != null && badge > 0 && (
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                        activeTab === tab.id
                          ? "bg-[var(--mist)] text-[var(--brand-700)]"
                          : "bg-[var(--surface-1)] text-[var(--text-4)]",
                      )}
                    >
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* tab content */}
        <div className="flex-1 overflow-auto px-6 pb-8 pt-5 sm:px-8">
          <VaultNotice />
          <div className="mt-4">
            {activeTab === "inbox" && <InboxView clientId={activeClientId} />}
            {activeTab === "tickets" && <TicketsView clientId={activeClientId} />}
            {activeTab === "reports" && <ReportsView client={client} />}
            {activeTab === "connectors" && <ConnectorsView clientId={activeClientId} />}
            {activeTab === "settings" && <SettingsView clientId={activeClientId} />}
          </div>
        </div>
      </div>
    </div>
  );
}
