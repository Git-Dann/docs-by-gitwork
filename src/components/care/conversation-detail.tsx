"use client";

import { useState } from "react";
import {
  ArrowLeftIcon,
  PaperAirplaneIcon,
  ClipboardDocumentIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
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
  useSendMessage,
  useGenerateAiDraft,
} from "@/hooks/use-support";
import { usePermissions } from "@/hooks/use-permissions";
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

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.6px] text-[var(--text-4)]">
      {children}
    </span>
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
  const sendMessage = useSendMessage(clientId, conversation.id);
  const generateDraft = useGenerateAiDraft(clientId);
  const { canGenerateAi } = usePermissions();

  const [noteDraft, setNoteDraft] = useState("");
  const [replyText, setReplyText] = useState("");
  const [replyError, setReplyError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const members = membersQ.data?.members ?? [];
  const connection = connections.find((c) => c.source === conversation.source);
  const isClosed = conversation.status === "closed" || conversation.status === "ignored";

  // ── Reply gating — mirror of SENDABLE_SOURCES in src/server/support-reply.ts.
  // app_reviews can only send for Play (App Store needs the Connect API), everything
  // else that has an automated send path gets a real Send button; the rest fall back
  // to copy-to-clipboard.
  const tags = conversation.tags ?? [];
  const isPlayReview = conversation.source === "app_reviews" && tags.includes("store:play_store");
  const isAppStoreReview = conversation.source === "app_reviews" && tags.includes("store:app_store");
  const canSend = ["discord", "gmail", "imap"].includes(conversation.source) || isPlayReview;
  const replyLimit = isPlayReview ? 350 : null; // Google Play caps developer replies at 350 chars.
  const overLimit = replyLimit !== null && replyText.length > replyLimit;
  const manualHint = isAppStoreReview
    ? "Reply in App Store Connect"
    : `Send not wired for ${SOURCE_LABEL[conversation.source]} — copy & reply manually`;

  function snoozeFor(hours: number) {
    snooze.mutate({ convId: conversation.id, until: new Date(Date.now() + hours * 3600_000).toISOString() });
  }

  async function handleSend() {
    if (!replyText.trim() || overLimit) return;
    setReplyError(null);
    try {
      // The messages route sends + verifies before persisting, so a failed SMTP/API
      // send throws here (502) instead of silently logging a phantom "sent" message.
      await sendMessage.mutateAsync({ direction: "outbound", authorLabel: "Gitwork Support", body: replyText.trim() });
      setReplyText("");
    } catch (e) {
      setReplyError(e instanceof Error ? e.message : "Send failed");
    }
  }

  async function handleAiDraft() {
    try {
      const { draft } = await generateDraft.mutateAsync(conversation.id);
      setReplyText(draft);
      setReplyError(null);
    } catch {
      /* ignore — if AI drafting fails, the composer just stays as-is */
    }
  }

  function handleCopy() {
    if (!replyText.trim()) return;
    void navigator.clipboard.writeText(replyText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-[var(--border-2)] px-5 py-4">
        <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] uppercase tracking-[0.6px] text-[var(--text-4)]">
          {onBack && (
            <button onClick={onBack} className="-ml-1 rounded-[6px] p-1 hover:bg-[var(--surface-1)] xl:hidden" title="Back to list">
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
          <h2 className="min-w-0 flex-1 break-words text-lg font-semibold leading-snug text-[var(--text-1)]">{conversation.subject}</h2>
          <OpenInChannelButton conversation={conversation} connection={connection} />
        </div>
      </div>

      {/* Thread + composer (center) beside the triage/notes rail. Stacks into one
          scrolling column until xl, splits side-by-side above. */}
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-y-auto xl:flex-row xl:overflow-hidden">
        {/* ── Center: thread (scrolls) + reply composer (pinned) ── */}
        <div className="flex min-h-0 min-w-0 flex-col xl:flex-1 xl:overflow-hidden">
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
                  "max-w-[42rem] rounded-[10px] border p-3",
                  m.direction === "outbound"
                    ? "ml-auto border-[var(--brand-200,var(--border-2))] bg-[var(--brand-50)]"
                    : "border-[var(--border-2)] bg-[var(--surface-1)]",
                )}
              >
                <div className="mb-1 flex items-center justify-between gap-3 font-mono text-[11px] uppercase tracking-[0.6px] text-[var(--text-4)]">
                  <span className="truncate">{m.authorLabel}</span>
                  <span className="shrink-0">{formatAge(m.createdAt)} ago</span>
                </div>
                <p className="overflow-hidden whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-relaxed text-[var(--text-2)]">{m.body}</p>
              </div>
            ))}
          </div>

          {/* ── 06 // Reply composer ── */}
          <div className="shrink-0 border-t border-[var(--border-2)] bg-[var(--surface-0)]">
            <div className="flex items-center justify-between gap-2 px-5 py-2.5">
              <span className="font-mono text-[10px] font-medium uppercase tracking-[1.2px] text-[var(--text-4)]">
                06 // Reply
              </span>
              <div className="flex items-center gap-2">
                {!canSend && (
                  <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                    {isAppStoreReview ? "App Store Connect" : "Manual reply"}
                  </span>
                )}
                {canGenerateAi && canSend && (
                  <button
                    type="button"
                    onClick={() => void handleAiDraft()}
                    disabled={generateDraft.isPending}
                    className="flex items-center gap-1 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] px-2 py-1 text-[11px] font-medium text-[var(--text-3)] transition hover:bg-[var(--surface-1)] disabled:opacity-40"
                    title="Generate an AI draft reply"
                  >
                    <SparklesIcon className={cn("h-3.5 w-3.5 text-violet-500", generateDraft.isPending && "animate-spin")} />
                    {generateDraft.isPending ? "Drafting…" : "AI draft"}
                  </button>
                )}
              </div>
            </div>
            <div className="px-5 pb-4">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !overLimit) {
                    e.preventDefault();
                    if (canSend) void handleSend();
                  }
                }}
                maxLength={replyLimit ?? undefined}
                placeholder={
                  canSend
                    ? `Reply to ${conversation.customerLabel} …  (⌘↵ to send)`
                    : "Draft your reply, then copy it to send manually…"
                }
                rows={3}
                className="app-textarea w-full text-sm"
              />
              <div className="mt-1.5 flex items-center justify-between gap-3">
                <p className="min-w-0 flex-1 text-[12px] text-red-600">{replyError}</p>
                <div className="flex shrink-0 items-center gap-2">
                  {replyLimit !== null && (
                    <span className={cn("font-mono text-[11px]", overLimit ? "text-red-600" : "text-[var(--text-4)]")}>
                      {replyText.length}/{replyLimit}
                    </span>
                  )}
                  {!canSend ? (
                    <button
                      type="button"
                      onClick={handleCopy}
                      disabled={!replyText.trim()}
                      title={manualHint}
                      className="flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-40"
                    >
                      <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                      {copied ? "Copied" : "Copy reply"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleSend()}
                      disabled={!replyText.trim() || sendMessage.isPending || overLimit}
                      className="flex items-center gap-1.5 rounded-[6px] bg-[var(--brand-700)] px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--brand-800)] disabled:opacity-40"
                    >
                      <PaperAirplaneIcon className="h-3.5 w-3.5" />
                      {sendMessage.isPending ? "Sending…" : "Send reply"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right rail: triage + internal notes ── */}
        <aside className="flex w-full min-h-0 flex-col border-t border-[var(--border-2)] bg-[var(--surface-0)] xl:w-72 xl:shrink-0 xl:overflow-y-auto xl:border-l xl:border-t-0">
          <PaneHeader n="04" label="Triage" />
          <div className="space-y-4 px-4 py-4">
            <label className="block">
              <FieldLabel>Status</FieldLabel>
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

            <label className="block">
              <FieldLabel>Priority</FieldLabel>
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

            <label className="block">
              <FieldLabel>Assignee</FieldLabel>
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

            {/* At-a-glance summary chips */}
            <div className="flex flex-wrap gap-1.5">
              {conversation.issueType && (
                <span className="rounded-[4px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2 py-0.5 text-[11px] text-[var(--text-3)]">
                  {conversation.issueType}
                </span>
              )}
              <span className="flex items-center gap-1 rounded-[4px] bg-[var(--surface-1)] px-2 py-0.5 text-[11px] capitalize text-[var(--text-3)]">
                <span className={cn("inline-block h-1.5 w-1.5 rounded-full", SENTIMENT_DOT[conversation.sentiment])} />
                {conversation.sentiment}
              </span>
            </div>

            {/* Quick actions */}
            <div className="space-y-2 border-t border-[var(--border-2)] pt-3">
              <FieldLabel>Snooze</FieldLabel>
              <div className="flex gap-1.5">
                <button onClick={() => snoozeFor(24)} className="flex-1 whitespace-nowrap rounded-[6px] border border-[var(--border-2)] px-2 py-1.5 text-xs transition hover:bg-[var(--surface-1)]">1 day</button>
                <button onClick={() => snoozeFor(72)} className="flex-1 whitespace-nowrap rounded-[6px] border border-[var(--border-2)] px-2 py-1.5 text-xs transition hover:bg-[var(--surface-1)]">3 days</button>
                <button onClick={() => snoozeFor(168)} className="flex-1 whitespace-nowrap rounded-[6px] border border-[var(--border-2)] px-2 py-1.5 text-xs transition hover:bg-[var(--surface-1)]">1 week</button>
              </div>
              {isClosed ? (
                <button
                  onClick={() => close.mutate({ convId: conversation.id, reopen: true })}
                  className="w-full rounded-[6px] border border-[var(--border-2)] px-2 py-2 text-xs font-medium transition hover:bg-[var(--surface-1)]"
                >
                  Reopen conversation
                </button>
              ) : (
                <div className="flex gap-1.5">
                  <button
                    onClick={() => close.mutate({ convId: conversation.id })}
                    className="flex-1 rounded-[6px] bg-emerald-600 px-2 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => close.mutate({ convId: conversation.id, ignored: true })}
                    className="flex-1 rounded-[6px] border border-[var(--border-2)] px-2 py-2 text-xs font-medium transition hover:bg-[var(--surface-1)]"
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
              <div key={note.id} className="rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] p-2.5">
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
                rows={3}
                className="app-textarea w-full text-sm"
              />
              <button
                type="submit"
                disabled={!noteDraft.trim() || addNote.isPending}
                className="w-full rounded-[6px] border border-[var(--border-2)] px-2 py-1.5 text-xs font-medium transition hover:bg-[var(--surface-1)] disabled:opacity-50"
              >
                {addNote.isPending ? "Adding…" : "Add note"}
              </button>
            </form>
          </div>
        </aside>
      </div>
    </div>
  );
}
