"use client";

import { useState } from "react";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import type { Conversation, Connection, ConversationStatus, ConversationPriority } from "@/types/support";
import {
  useSupportMessages,
  useSupportMembers,
  useTriageConversation,
  useSnoozeConversation,
  useCloseConversation,
  useConversationNotes,
  useAddConversationNote,
} from "@/hooks/use-support";
import {
  SourceIcon,
  SOURCE_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  PRIORITY_LABEL,
  PRIORITY_TONE,
  SENTIMENT_DOT,
  formatAge,
} from "./care-constants";
import { OpenInChannelButton } from "./open-in-channel-button";

const STATUSES: ConversationStatus[] = ["new", "open", "snoozed", "closed", "ignored"];
const PRIORITIES: ConversationPriority[] = ["urgent", "high", "normal", "low"];

function PaneHeader({ n, label, right }: { n: string; label: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--border-2)] px-4 py-2.5">
      <span className="font-mono text-[10px] font-medium uppercase tracking-[1.2px] text-[var(--text-4)]">
        {`${n} // ${label}`}
      </span>
      {right}
    </div>
  );
}

export function ConversationDetail({
  clientId,
  conversation,
  connections,
  onBack,
}: {
  clientId: string;
  conversation: Conversation;
  connections: Connection[];
  /** Mobile-only "back to list" handler (the list pane is hidden < lg when a conv is open). */
  onBack?: () => void;
}) {
  const messagesQ = useSupportMessages(clientId, conversation.id);
  const membersQ = useSupportMembers(clientId);
  const notesQ = useConversationNotes(clientId, conversation.id);
  const triage = useTriageConversation(clientId);
  const snooze = useSnoozeConversation(clientId);
  const close = useCloseConversation(clientId);
  const addNote = useAddConversationNote(clientId, conversation.id);

  const [noteDraft, setNoteDraft] = useState("");

  const members = membersQ.data?.members ?? [];
  const connection = connections.find((c) => c.source === conversation.source);
  const isClosed = conversation.status === "closed" || conversation.status === "ignored";

  function snoozeFor(hours: number) {
    snooze.mutate({ convId: conversation.id, until: new Date(Date.now() + hours * 3600_000).toISOString() });
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {/* Header */}
      <div className="border-b border-[var(--border-2)] px-5 py-4">
        <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] uppercase tracking-[0.6px] text-[var(--text-4)]">
          {onBack && (
            <button onClick={onBack} className="-ml-1 rounded-[6px] p-1 hover:bg-[var(--surface-1)] lg:hidden" title="Back to list">
              <ArrowLeftIcon className="h-3.5 w-3.5 text-[var(--text-3)]" />
            </button>
          )}
          <SourceIcon source={conversation.source} className="h-3.5 w-3.5 shrink-0" />
          <span className="shrink-0">{SOURCE_LABEL[conversation.source]}</span>
          <span className="shrink-0">·</span>
          <span className="min-w-0 max-w-full truncate">{conversation.customerLabel}</span>
          <span className="shrink-0">·</span>
          <span className="shrink-0">{formatAge(conversation.receivedAt)} ago</span>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="min-w-0 flex-1 text-lg font-semibold leading-snug text-[var(--text-1)]">{conversation.subject}</h2>
          <OpenInChannelButton conversation={conversation} connection={connection} />
        </div>
      </div>

      {/* Thread + triage: stacked single-column (scrolls as one) until xl, side-by-side above. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto xl:flex-row xl:overflow-hidden">
        {/* Thread (read-only) */}
        <div className="flex min-h-0 flex-col xl:flex-1 xl:overflow-hidden">
          <PaneHeader n="03" label="Thread" />
          <div className="space-y-3 px-5 py-4 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
            {messagesQ.isLoading && <p className="text-sm text-[var(--text-4)]">Loading messages…</p>}
            {messagesQ.data?.messages.length === 0 && (
              <p className="text-sm text-[var(--text-4)]">No messages captured yet.</p>
            )}
            {messagesQ.data?.messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "rounded-[10px] border border-[var(--border-2)] p-3",
                  m.direction === "outbound" ? "bg-[var(--brand-50)]" : "bg-[var(--surface-1)]",
                )}
              >
                <div className="mb-1 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.6px] text-[var(--text-4)]">
                  <span>{m.authorLabel}</span>
                  <span>{formatAge(m.createdAt)} ago</span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-[var(--text-2)]">{m.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Triage + notes rail — below the thread when stacked, a fixed rail at xl. */}
        <div className="flex w-full min-h-0 flex-col border-t border-[var(--border-2)] xl:w-72 xl:overflow-y-auto xl:border-t-0 xl:border-l">
          <PaneHeader n="04" label="Triage" />
          <div className="space-y-4 px-4 py-4">
            {/* Status */}
            <label className="block">
              <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.6px] text-[var(--text-4)]">Status</span>
              <select
                value={conversation.status}
                onChange={(e) => triage.mutate({ convId: conversation.id, data: { status: e.target.value as ConversationStatus } })}
                className={cn("app-select-compact w-full text-sm font-medium", STATUS_TONE[conversation.status])}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
            </label>

            {/* Priority */}
            <label className="block">
              <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.6px] text-[var(--text-4)]">Priority</span>
              <select
                value={conversation.priority}
                onChange={(e) => triage.mutate({ convId: conversation.id, data: { priority: e.target.value as ConversationPriority } })}
                className={cn("app-select-compact w-full text-sm font-medium", PRIORITY_TONE[conversation.priority])}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
                ))}
              </select>
            </label>

            {/* Assignee */}
            <label className="block">
              <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.6px] text-[var(--text-4)]">Assignee</span>
              <select
                value={conversation.assigneeId ?? ""}
                onChange={(e) => triage.mutate({ convId: conversation.id, data: { assigneeId: e.target.value || null } })}
                className="app-select-compact w-full text-sm"
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </label>

            {/* Current chips */}
            <div className="flex flex-wrap gap-1.5">
              <span className={cn("rounded-[4px] px-2 py-0.5 text-[11px] font-medium", STATUS_TONE[conversation.status])}>
                {STATUS_LABEL[conversation.status]}
              </span>
              <span className={cn("rounded-[4px] px-2 py-0.5 text-[11px] font-medium", PRIORITY_TONE[conversation.priority])}>
                {PRIORITY_LABEL[conversation.priority]}
              </span>
              {conversation.issueType && (
                <span className="rounded-[4px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2 py-0.5 text-[11px] text-[var(--text-3)]">
                  {conversation.issueType}
                </span>
              )}
              <span className="flex items-center gap-1 rounded-[4px] bg-[var(--surface-1)] px-2 py-0.5 text-[11px] text-[var(--text-3)]">
                <span className={cn("inline-block h-1.5 w-1.5 rounded-full", SENTIMENT_DOT[conversation.sentiment])} />
                {conversation.sentiment}
              </span>
            </div>

            {/* Quick actions */}
            <div className="space-y-2 border-t border-[var(--border-2)] pt-3">
              <div className="flex gap-1.5">
                <button onClick={() => snoozeFor(24)} className="flex-1 whitespace-nowrap rounded-[6px] border border-[var(--border-2)] px-2 py-1.5 text-xs hover:bg-[var(--surface-1)]">Snooze 1d</button>
                <button onClick={() => snoozeFor(72)} className="flex-1 whitespace-nowrap rounded-[6px] border border-[var(--border-2)] px-2 py-1.5 text-xs hover:bg-[var(--surface-1)]">3d</button>
                <button onClick={() => snoozeFor(168)} className="flex-1 whitespace-nowrap rounded-[6px] border border-[var(--border-2)] px-2 py-1.5 text-xs hover:bg-[var(--surface-1)]">1w</button>
              </div>
              {isClosed ? (
                <button
                  onClick={() => close.mutate({ convId: conversation.id, reopen: true })}
                  className="w-full rounded-[6px] border border-[var(--border-2)] px-2 py-1.5 text-xs hover:bg-[var(--surface-1)]"
                >
                  Reopen
                </button>
              ) : (
                <div className="flex gap-1.5">
                  <button
                    onClick={() => close.mutate({ convId: conversation.id })}
                    className="flex-1 rounded-[6px] bg-emerald-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => close.mutate({ convId: conversation.id, ignored: true })}
                    className="flex-1 rounded-[6px] border border-[var(--border-2)] px-2 py-1.5 text-xs hover:bg-[var(--surface-1)]"
                  >
                    Ignore
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Internal notes */}
          <PaneHeader n="05" label="Internal notes" />
          <div className="space-y-3 px-4 py-4">
            {notesQ.data?.notes.length === 0 && (
              <p className="text-xs text-[var(--text-4)]">No notes yet. Notes are staff-only.</p>
            )}
            {notesQ.data?.notes.map((note) => (
              <div key={note.id} className="rounded-[8px] bg-[var(--surface-1)] p-2.5">
                <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.6px] text-[var(--text-4)]">
                  {note.authorId ?? "system"} · {formatAge(note.createdAt)} ago
                </div>
                <p className="whitespace-pre-wrap text-sm text-[var(--text-2)]">{note.body}</p>
              </div>
            ))}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!noteDraft.trim()) return;
                addNote.mutate(noteDraft.trim(), { onSuccess: () => setNoteDraft("") });
              }}
              className="space-y-2"
            >
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Add an internal note…"
                rows={2}
                className="app-select-compact w-full text-sm"
              />
              <button
                type="submit"
                disabled={!noteDraft.trim() || addNote.isPending}
                className="w-full rounded-[6px] border border-[var(--border-2)] px-2 py-1.5 text-xs font-medium hover:bg-[var(--surface-1)] disabled:opacity-50"
              >
                Add note
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
