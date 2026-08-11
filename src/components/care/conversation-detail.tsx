"use client";

import { useState } from "react";
import {
  ArrowLeftIcon,
  PaperAirplaneIcon,
  ClipboardDocumentIcon,
  SparklesIcon,
  CheckIcon,
  ClockIcon,
  ChatBubbleLeftEllipsisIcon,
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
  PRIORITY_LABEL,
  REPLY_STATE_LABEL,
  REPLY_STATE_DOT,
  formatAge,
  initialsOf,
  isLongWait,
} from "./care-constants";
import { OpenInChannelButton } from "./open-in-channel-button";

const STATUSES: ConversationStatus[] = ["new", "open", "snoozed", "closed", "ignored"];
const PRIORITIES: ConversationPriority[] = ["urgent", "high", "normal", "low"];

/**
 * The detail pane is the WORKSPACE, not a viewer.
 *
 * It used to give ~288px of the width to a permanent rail of three stacked `<select>`s, three
 * snooze buttons and a notes form — so the actual conversation was squeezed, and the two things
 * an operator does constantly (read it, answer it) competed with settings they change rarely.
 * Every modern support desk — Front, Missive, Intercom, Help Scout — puts the verbs in a toolbar
 * across the top and gives the thread the full width. That is what this is now:
 *
 *   ┌ identity + state ─────────────────────────── Open in channel ┐
 *   │ Close · Snooze · Assign · Priority · Status · Notes          │  ← toolbar: the verbs
 *   ├──────────────────────────────────────────────────────────────┤
 *   │ thread, full width, scrolling                                │
 *   ├──────────────────────────────────────────────────────────────┤
 *   │ composer, always visible                                     │  ← never behind a click
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Notes move behind a toggle in the toolbar: they matter, but not on every thread, and a
 * permanently-open notes form on a 226-item queue is 226 forms nobody filled in.
 */

function ToolbarButton({
  onClick,
  title,
  tone = "default",
  disabled,
  children,
}: {
  onClick: () => void;
  title?: string;
  tone?: "default" | "primary" | "active";
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-[6px] border px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-40",
        tone === "primary" && "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700",
        tone === "active" && "border-[var(--brand-300,var(--border-1))] bg-[var(--brand-50)] text-[var(--brand-700)]",
        tone === "default" &&
          "border-[var(--border-2)] bg-[var(--surface-0)] text-[var(--text-2)] hover:bg-[var(--surface-1)]",
      )}
    >
      {children}
    </button>
  );
}

/** A labelled property. The mono caps label is DESIGN.md's data-label voice. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.6px] text-[var(--text-4)]">{label}</span>
      {children}
    </label>
  );
}

/** Whose turn it is, stated in the header rather than as a separate banner block. */
function StateLine({ conversation }: { conversation: Conversation }) {
  const { replyState, lastInboundAt, lastOutboundAt } = conversation;
  const awaiting = replyState === "awaiting_reply";
  const longWait = awaiting && lastInboundAt ? isLongWait(lastInboundAt) : false;

  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("inline-block h-1.5 w-1.5 shrink-0 rounded-full", REPLY_STATE_DOT[replyState])} />
      <span
        className={cn(
          "font-medium",
          awaiting ? (longWait ? "text-amber-700" : "text-amber-600") : replyState === "replied" ? "text-emerald-600" : "text-[var(--text-4)]",
        )}
      >
        {REPLY_STATE_LABEL[replyState]}
      </span>
      {awaiting && lastInboundAt && <span className="text-[var(--text-4)]">· waiting {formatAge(lastInboundAt)}</span>}
      {replyState === "replied" && lastOutboundAt && (
        <span className="text-[var(--text-4)]">· answered {formatAge(lastOutboundAt)} ago</span>
      )}
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
  /** Mobile-only "back to list" handler (the list pane is hidden < xl when a conv is open). */
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
  const [showNotes, setShowNotes] = useState(false);

  const members = membersQ.data?.members ?? [];
  const connection = connections.find((c) => c.source === conversation.source);
  const isClosed = conversation.status === "closed" || conversation.status === "ignored";
  const noteCount = notesQ.data?.notes.length ?? conversation.noteCount ?? 0;

  // ── Reply gating — mirror of SENDABLE_SOURCES in src/server/support-reply.ts. ──
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
      // The messages route sends + verifies before persisting, so a failed SMTP/API send throws
      // here (502) instead of silently logging a phantom "sent" message.
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
      /* ignore — if AI drafting fails the composer just stays as-is */
    }
  }

  /**
   * Manual-channel path: copy the text out AND record it, which is what flips the thread to
   * Replied. The logging half was already built server-side but nothing ever called it, so on
   * those channels a reply left no trace in Care at all. Copy happens first and independently:
   * a failed log leaves the draft intact rather than losing it.
   */
  async function handleCopyAndLog() {
    const text = replyText.trim();
    if (!text) return;
    void navigator.clipboard.writeText(replyText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);

    setReplyError(null);
    try {
      await sendMessage.mutateAsync({ direction: "outbound", authorLabel: "Gitwork Support", body: text });
      setReplyText("");
    } catch (e) {
      setReplyError(
        `Copied, but logging it on the thread failed — it will still show as awaiting a reply. ${
          e instanceof Error ? e.message : ""
        }`.trim(),
      );
    }
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {/* ── Identity ── */}
      <div className="shrink-0 border-b border-[var(--border-2)] px-5 pt-4">
        <div className="flex items-start gap-2">
          {onBack && (
            <button onClick={onBack} className="-ml-1 mt-0.5 rounded-[6px] p-1 hover:bg-[var(--surface-1)] xl:hidden" title="Back to list">
              <ArrowLeftIcon className="h-4 w-4 text-[var(--text-3)]" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-semibold leading-snug text-[var(--text-1)]" title={conversation.customerLabel}>
              {conversation.customerLabel}
            </h2>
            <p className="mt-0.5 truncate text-[13px] text-[var(--text-2)]" title={conversation.subject}>
              {conversation.subject}
            </p>
          </div>
          <OpenInChannelButton conversation={conversation} connection={connection} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
          <span className="flex items-center gap-1 text-[var(--text-4)]">
            <SourceIcon source={conversation.source} className="h-3.5 w-3.5" />
            {SOURCE_LABEL[conversation.source]}
          </span>
          <span className="text-[var(--border-1)]">·</span>
          <StateLine conversation={conversation} />
        </div>

        {/* ── Row 1: ACTIONS — the two verbs used on every single thread ──
               Split from the properties below because six controls at equal weight in one row
               is what made this read as busy. Nothing is removed; the things you press on every
               thread simply look like buttons, and the things you set occasionally look like
               fields. */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {isClosed ? (
            <ToolbarButton onClick={() => close.mutate({ convId: conversation.id, reopen: true })}>Reopen</ToolbarButton>
          ) : (
            <>
              <ToolbarButton tone="primary" onClick={() => close.mutate({ convId: conversation.id })} title="Close (E)">
                <CheckIcon className="h-3.5 w-3.5" />
                Close
              </ToolbarButton>
              {/* One snooze control, not two. A "Snooze" button beside a "Snooze for…" select is
                  the same verb twice — the button acts on the common case (a day, matching the
                  `s` shortcut) and the select is only for choosing a different one. Split into a
                  button + caret so the default stays one click. */}
              <div className="flex shrink-0 items-stretch">
                <button
                  type="button"
                  onClick={() => snoozeFor(24)}
                  title="Snooze one day (S)"
                  className="flex items-center gap-1.5 rounded-l-[6px] border border-r-0 border-[var(--border-2)] bg-[var(--surface-0)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
                >
                  <ClockIcon className="h-3.5 w-3.5" />
                  Snooze
                </button>
                <select
                  aria-label="Snooze for longer"
                  value=""
                  onChange={(e) => e.target.value && snoozeFor(Number(e.target.value))}
                  className="app-select-compact h-auto w-[46px] rounded-l-none border-l border-[var(--border-2)] py-1.5 text-xs"
                >
                  <option value="" disabled>…</option>
                  <option value="72">3 days</option>
                  <option value="168">1 week</option>
                </select>
              </div>
            </>
          )}

          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <ToolbarButton
              tone={showNotes ? "active" : "default"}
              onClick={() => setShowNotes((v) => !v)}
              title="Internal notes (staff only)"
            >
              <ChatBubbleLeftEllipsisIcon className="h-3.5 w-3.5" />
              Notes{noteCount > 0 ? ` ${noteCount}` : ""}
            </ToolbarButton>
          </div>
        </div>

        {/* ── Row 2: PROPERTIES — every one still here, just no longer shouting ──
               Rendered as labelled fields in the house mono data-label voice, which reads as a
               property sheet rather than three more buttons competing with Close. */}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[var(--border-2)] pt-2.5 pb-3">
          <Field label="Assignee">
            <select
              aria-label="Assignee"
              value={conversation.assigneeId ?? ""}
              onChange={(e) => triage.mutate({ convId: conversation.id, data: { assigneeId: e.target.value || null } })}
              className="app-select-compact h-[26px] w-auto text-xs"
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </Field>

          <Field label="Priority">
            <select
              aria-label="Priority"
              value={conversation.priority}
              onChange={(e) => triage.mutate({ convId: conversation.id, data: { priority: e.target.value as ConversationPriority } })}
              className={cn(
                "app-select-compact h-[26px] w-auto text-xs",
                // Only urgent earns colour — four equally-weighted levels is three of them
                // asking for attention they do not need.
                conversation.priority === "urgent" && "font-semibold text-red-600",
              )}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
              ))}
            </select>
          </Field>

          <Field label="Status">
            <select
              aria-label="Status"
              value={conversation.status}
              onChange={(e) => triage.mutate({ convId: conversation.id, data: { status: e.target.value as ConversationStatus } })}
              className="app-select-compact h-[26px] w-auto text-xs"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      {/* ── Thread: the full width, which is the point of moving the verbs up ── */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {messagesQ.isLoading && <p className="text-sm text-[var(--text-4)]">Loading messages…</p>}
        {messagesQ.data?.messages.length === 0 && (
          <p className="text-sm text-[var(--text-4)]">No messages captured on this thread.</p>
        )}
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          {messagesQ.data?.messages.map((m) => {
            const outbound = m.direction === "outbound";
            return (
              <div key={m.id} className={cn("flex flex-col", outbound ? "items-end" : "items-start")}>
                <div className="mb-1 flex items-center gap-1.5 px-1 font-mono text-[10px] uppercase tracking-[0.6px] text-[var(--text-4)]">
                  {!outbound && (
                    <span className="rounded-[3px] bg-[var(--surface-1)] px-1 text-[var(--text-3)]">
                      {initialsOf(m.authorLabel || conversation.customerLabel)}
                    </span>
                  )}
                  <span className="max-w-[16rem] truncate">{m.authorLabel}</span>
                  <span>· {formatAge(m.createdAt)} ago</span>
                </div>
                <div
                  className={cn(
                    "max-w-[85%] rounded-[10px] border px-3 py-2",
                    outbound
                      ? "border-[var(--brand-200,var(--border-2))] bg-[var(--brand-50)]"
                      : "border-[var(--border-2)] bg-[var(--surface-0)]",
                  )}
                >
                  <p className="overflow-hidden whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-[13px] leading-relaxed text-[var(--text-2)]">
                    {m.body}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Internal notes, on demand ── */}
        {showNotes && (
          <div className="mx-auto mt-6 max-w-3xl border-t border-[var(--border-2)] pt-4">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[1.2px] text-[var(--text-4)]">
              Internal notes · staff only
            </div>
            <div className="space-y-2">
              {notesQ.data?.notes.length === 0 && (
                <p className="text-xs text-[var(--text-4)]">No notes yet. The customer never sees these.</p>
              )}
              {notesQ.data?.notes.map((note) => (
                <div key={note.id} className="rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] p-2.5">
                  <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.6px] text-[var(--text-4)]">
                    {note.authorId ?? "system"} · {formatAge(note.createdAt)} ago
                  </div>
                  <p className="whitespace-pre-wrap text-[13px] text-[var(--text-2)]">{note.body}</p>
                </div>
              ))}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!noteDraft.trim()) return;
                  addNote.mutate(noteDraft.trim(), { onSuccess: () => setNoteDraft("") });
                }}
                className="flex items-start gap-2"
              >
                <textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="Add an internal note…"
                  rows={2}
                  className="app-textarea min-w-0 flex-1 text-[13px]"
                />
                <button
                  type="submit"
                  disabled={!noteDraft.trim() || addNote.isPending}
                  className="shrink-0 rounded-[6px] border border-[var(--border-2)] px-3 py-2 text-xs font-medium transition hover:bg-[var(--surface-1)] disabled:opacity-50"
                >
                  {addNote.isPending ? "Adding…" : "Add"}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* ── Composer: always present. Answering is the job; it should never be behind a click. ── */}
      <div className="shrink-0 border-t border-[var(--border-2)] bg-[var(--surface-0)] px-5 py-3">
        <div className="mx-auto max-w-3xl">
          <div className="relative">
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !overLimit) {
                  e.preventDefault();
                  void (canSend ? handleSend() : handleCopyAndLog());
                }
              }}
              maxLength={replyLimit ?? undefined}
              placeholder={
                canSend
                  ? `Reply to ${conversation.customerLabel}…  (⌘↵ to send)`
                  : "Draft your reply, then copy it to send manually…"
              }
              rows={3}
              className="app-textarea w-full text-[13px]"
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {!canSend && (
              <span className="rounded-[4px] border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                {isAppStoreReview ? "App Store Connect" : "Manual reply"}
              </span>
            )}
            {canGenerateAi && (
              <button
                type="button"
                onClick={() => void handleAiDraft()}
                disabled={generateDraft.isPending}
                className="flex items-center gap-1 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] px-2 py-1.5 text-[11px] font-medium text-[var(--text-3)] transition hover:bg-[var(--surface-1)] disabled:opacity-40"
                title="Generate an AI draft reply"
              >
                <SparklesIcon className={cn("h-3.5 w-3.5 text-violet-500", generateDraft.isPending && "animate-spin")} />
                {generateDraft.isPending ? "Drafting…" : "AI draft"}
              </button>
            )}
            {replyError && <p className="min-w-0 flex-1 text-[12px] text-red-600">{replyError}</p>}
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {replyLimit !== null && (
                <span className={cn("font-mono text-[11px]", overLimit ? "text-red-600" : "text-[var(--text-4)]")}>
                  {replyText.length}/{replyLimit}
                </span>
              )}
              {canSend ? (
                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={!replyText.trim() || sendMessage.isPending || overLimit}
                  className="flex items-center gap-1.5 rounded-[6px] bg-[var(--brand-700)] px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--brand-800)] disabled:opacity-40"
                >
                  <PaperAirplaneIcon className="h-3.5 w-3.5" />
                  {sendMessage.isPending ? "Sending…" : "Send reply"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleCopyAndLog()}
                  disabled={!replyText.trim() || sendMessage.isPending}
                  title={`${manualHint}. Copying also records the reply here, so the thread stops showing as awaiting one.`}
                  className="flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-40"
                >
                  <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                  {copied ? "Copied & logged" : sendMessage.isPending ? "Logging…" : "Copy & mark replied"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
