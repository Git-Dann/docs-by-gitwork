"use client";

import { useState } from "react";
import {
  PaperAirplaneIcon,
  ClipboardDocumentIcon,
  SparklesIcon,
  CheckIcon,
  ClockIcon,
  Squares2X2Icon,
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
 * The record: a thread with a properties sidebar.
 *
 * Every property used to live in the header — three `<select>`s and two buttons on one strip above
 * the conversation, so the top of the screen was a control panel and the thread started a third of
 * the way down. Properties belong beside the record, not on top of it: it is the shape HubSpot,
 * Linear and Zendesk all use, and it means the two things you do constantly (read, answer) own the
 * middle of the screen while the things you set occasionally sit in a column you can ignore.
 *
 *   ┌ customer · subject · state ······· Open in channel · Close · Snooze ┐
 *   ├───────────────────────────────────────────┬─────────────────────────┤
 *   │ the thread              (scrolls)         │ 01 // PROPERTIES        │
 *   │                                           │  assignee/priority/…    │
 *   │ composer (pinned — answering is the job)  │ 02 // NOTES             │
 *   └───────────────────────────────────────────┴─────────────────────────┘
 *
 * The thread carries no `NN //` band of its own: it is the record, not a widget on it, and a 36px
 * strip above it would cost a message of height to restate the header directly above.
 *
 * Below `lg` there is no room for two columns, so the sidebar becomes a toggle ("Details") that
 * swaps in place of the thread — one boolean, one copy of the panel, no duplicated markup.
 */

function ToolbarButton({
  onClick,
  title,
  tone = "default",
  disabled,
  className,
  children,
}: {
  onClick: () => void;
  title?: string;
  /** `affirm` is the resolving action (Close); `active` is a toggle that is on. */
  tone?: "default" | "affirm" | "active";
  disabled?: boolean;
  className?: string;
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
        // A tint + hairline + toned text rather than a solid green slab: the semantic 500s are
        // tuned for text on a surface, and white-on-`--success-500` fails contrast in dark mode
        // (#3DD68C), which is exactly how the old hardcoded `bg-emerald-600` went unnoticed.
        tone === "affirm" &&
          "border-[var(--success-500)] bg-[var(--success-50)] text-[var(--success-500)] hover:brightness-95",
        tone === "active" && "border-[var(--brand-200)] bg-[var(--surface-brand)] text-[var(--brand-700)]",
        tone === "default" &&
          "border-[var(--border-2)] bg-[var(--surface-0)] text-[var(--text-2)] hover:bg-[var(--surface-1)]",
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * A property row: mono caps label above its control, stacked.
 *
 * Stacked rather than inline per DESIGN.md's rail rule — fields are never crammed horizontally, and
 * a label beside a `<select>` in a 280px column leaves the value under the chevron.
 */
function Prop({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="widget-data-label">{label}</span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

/** A read-only property — a fact about the thread, in the same grammar as the editable ones. */
function ReadOnlyProp({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="widget-data-label">{label}</span>
      <div className="mt-0.5 text-[13px] text-[var(--text-2)]">{children}</div>
    </div>
  );
}

/** Whose turn it is. The single most important fact on the board, so it leads the header. */
function StateLine({ conversation }: { conversation: Conversation }) {
  const { replyState, lastInboundAt, lastOutboundAt } = conversation;
  const awaiting = replyState === "awaiting_reply";
  const longWait = awaiting && lastInboundAt ? isLongWait(lastInboundAt) : false;

  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("inline-block h-1.5 w-1.5 shrink-0 rounded-full", REPLY_STATE_DOT[replyState])} />
      <span
        className={cn(
          // A long wait is weight, not a second amber — there is one warning token and inventing a
          // darker one by hand is how a colour stops flipping in dark mode.
          awaiting ? cn("text-[var(--warning-500)]", longWait ? "font-semibold" : "font-medium") : "font-medium",
          replyState === "replied" && "text-[var(--success-500)]",
          replyState === "no_inbound" && "text-[var(--text-4)]",
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
}: {
  clientId: string;
  conversation: Conversation;
  connections: Connection[];
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
  // Narrow-viewport only: swaps the properties column in place of the thread.
  const [showProps, setShowProps] = useState(false);

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
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
      {/* ── Identity + the two verbs used on every thread. Everything else moved to the sidebar,
             which is what gives the thread the top of the screen. ── */}
      {/*
        Stacks below `sm` and the action group WRAPS. Both matter: the group used to be one
        `shrink-0` nowrap row, so at 390px "Snooze" was cut off at the frame edge and the Details
        toggle — the only route to properties and notes on a phone — was off-screen entirely. It did
        not register as page overflow, because a flex container clips rather than scrolls, which is
        the exact "present but unreachable" failure `audit-clipping` exists for.
      */}
      <div className="flex shrink-0 flex-col gap-2 border-b border-[var(--border-2)] px-4 py-2.5 sm:flex-row sm:items-center sm:gap-3 sm:px-5">
        <div className="min-w-0 flex-1">
          <h3
            className="truncate text-[15px] font-semibold leading-tight text-[var(--text-1)]"
            title={conversation.customerLabel}
          >
            {conversation.customerLabel}
          </h3>
          <p className="truncate text-[13px] text-[var(--text-2)]" title={conversation.subject}>
            {conversation.subject}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px]">
            <span className="flex items-center gap-1 text-[var(--text-4)]">
              <SourceIcon source={conversation.source} className="h-3.5 w-3.5" />
              {SOURCE_LABEL[conversation.source]}
            </span>
            <span className="text-[var(--border-1)]">·</span>
            <StateLine conversation={conversation} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0">
          <OpenInChannelButton conversation={conversation} connection={connection} />
          {isClosed ? (
            <ToolbarButton onClick={() => close.mutate({ convId: conversation.id, reopen: true })}>Reopen</ToolbarButton>
          ) : (
            <>
              <ToolbarButton tone="affirm" onClick={() => close.mutate({ convId: conversation.id })} title="Close (E)">
                <CheckIcon className="h-3.5 w-3.5" />
                Close
              </ToolbarButton>
              {/* One snooze control, not two. A "Snooze" button beside a "Snooze for…" select is
                  the same verb twice — the button acts on the common case (a day, matching the
                  `s` shortcut) and the caret is only for choosing a different one. */}
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
          {/* The sidebar has nowhere to sit below lg, so there it is a view you switch to. At lg+
              the panel is always on screen, so the toggle would be a control that does nothing —
              it is hidden there rather than shown inert. */}
          <ToolbarButton
            tone={showProps ? "active" : "default"}
            onClick={() => setShowProps((v) => !v)}
            title="Properties and internal notes"
            className="lg:hidden"
          >
            <Squares2X2Icon className="h-3.5 w-3.5" />
            {showProps ? "Thread" : `Details${noteCount > 0 ? ` ${noteCount}` : ""}`}
          </ToolbarButton>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* ── Thread + composer ── */}
        <div className={cn("min-h-0 min-w-0 flex-1 flex-col", showProps ? "hidden lg:flex" : "flex")}>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
            {messagesQ.isLoading && <p className="text-sm text-[var(--text-4)]">Loading messages…</p>}
            {messagesQ.data?.messages.length === 0 && (
              <p className="text-sm text-[var(--text-4)]">No messages captured on this thread.</p>
            )}
            <div className="mx-auto flex max-w-3xl flex-col gap-3">
              {messagesQ.data?.messages.map((m) => {
                const outbound = m.direction === "outbound";
                return (
                  <div key={m.id} className={cn("flex flex-col", outbound ? "items-end" : "items-start")}>
                    <div className="mb-1 flex items-center gap-1.5 px-1 widget-data-label">
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
                          ? "border-[var(--brand-200)] bg-[var(--surface-brand)]"
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
          </div>

          {/* ── Composer: always present. Answering is the job; it is never behind a click. ── */}
          <div className="shrink-0 border-t border-[var(--border-2)] bg-[var(--surface-0)] px-4 py-3 sm:px-5">
            <div className="mx-auto max-w-3xl">
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
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {!canSend && (
                  <span className="rounded-[4px] border border-[var(--border-2)] bg-[var(--warning-50)] px-2 py-0.5 text-[11px] font-semibold text-[var(--warning-500)]">
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
                    <SparklesIcon className={cn("h-3.5 w-3.5 text-[var(--brand-600)]", generateDraft.isPending && "animate-spin")} />
                    {generateDraft.isPending ? "Drafting…" : "AI draft"}
                  </button>
                )}
                {replyError && <p className="min-w-0 flex-1 text-[12px] text-[var(--danger-500)]">{replyError}</p>}
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  {replyLimit !== null && (
                    <span className={cn("font-mono text-[11px]", overLimit ? "text-[var(--danger-500)]" : "text-[var(--text-4)]")}>
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

        {/* ── Properties + notes. A column at lg+, a swapped-in view below it. ── */}
        <aside
          className={cn(
            "min-h-0 w-full shrink-0 overflow-y-auto border-[var(--border-2)] bg-[var(--surface-canvas)] p-3 lg:block lg:w-[286px] lg:border-l",
            showProps ? "block" : "hidden",
          )}
        >
          <div className="space-y-3">
            <section className="widget-card">
              <div className="widget-header">
                <span className="widget-header__label">
                  <span className="widget-header__label--number">01</span>{" // PROPERTIES"}
                </span>
              </div>
              <div className="widget-body space-y-3">
                <Prop label="Assignee">
                  <select
                    aria-label="Assignee"
                    value={conversation.assigneeId ?? ""}
                    onChange={(e) => triage.mutate({ convId: conversation.id, data: { assigneeId: e.target.value || null } })}
                    className="app-select-compact w-full text-xs"
                  >
                    <option value="">Unassigned</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </Prop>

                <Prop label="Priority">
                  <select
                    aria-label="Priority"
                    value={conversation.priority}
                    onChange={(e) => triage.mutate({ convId: conversation.id, data: { priority: e.target.value as ConversationPriority } })}
                    className={cn(
                      "app-select-compact w-full text-xs",
                      // Only urgent earns colour — four equally-weighted levels is three of them
                      // asking for attention they do not need.
                      conversation.priority === "urgent" && "font-semibold text-[var(--danger-500)]",
                    )}
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
                    ))}
                  </select>
                </Prop>

                <Prop label="Status">
                  <select
                    aria-label="Status"
                    value={conversation.status}
                    onChange={(e) => triage.mutate({ convId: conversation.id, data: { status: e.target.value as ConversationStatus } })}
                    className="app-select-compact w-full text-xs"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                    ))}
                  </select>
                </Prop>

                <div className="grid grid-cols-2 gap-3 border-t border-[var(--border-3)] pt-3">
                  <ReadOnlyProp label="Channel">{SOURCE_LABEL[conversation.source]}</ReadOnlyProp>
                  <ReadOnlyProp label="First seen">
                    <span className="font-mono text-[12px]">{formatAge(conversation.receivedAt)} ago</span>
                  </ReadOnlyProp>
                  {conversation.lastInboundAt && (
                    <ReadOnlyProp label="Last in">
                      <span className="font-mono text-[12px]">{formatAge(conversation.lastInboundAt)} ago</span>
                    </ReadOnlyProp>
                  )}
                  {conversation.lastOutboundAt && (
                    <ReadOnlyProp label="Last out">
                      <span className="font-mono text-[12px]">{formatAge(conversation.lastOutboundAt)} ago</span>
                    </ReadOnlyProp>
                  )}
                </div>

                {tags.length > 0 && (
                  <div className="border-t border-[var(--border-3)] pt-3">
                    <span className="widget-data-label">Tags</span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {tags.map((t) => (
                        <span
                          key={t}
                          className="rounded-[4px] border border-[var(--border-2)] bg-[var(--surface-1)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-3)]"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="widget-card">
              <div className="widget-header">
                <span className="widget-header__label">
                  <span className="widget-header__label--number">02</span>{" // NOTES"}
                </span>
                <span className="widget-header__status">STAFF ONLY</span>
              </div>
              <div className="widget-body space-y-2">
                {notesQ.data?.notes.length === 0 && (
                  <p className="text-xs text-[var(--text-4)]">No notes yet. The customer never sees these.</p>
                )}
                {notesQ.data?.notes.map((note) => (
                  <div key={note.id} className="rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] p-2">
                    <div className="widget-data-label mb-1">
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
                >
                  <textarea
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder="Add an internal note…"
                    rows={2}
                    className="app-textarea w-full text-[13px]"
                  />
                  <button
                    type="submit"
                    disabled={!noteDraft.trim() || addNote.isPending}
                    className="mt-1.5 w-full rounded-[6px] border border-[var(--border-2)] px-3 py-1.5 text-xs font-medium transition hover:bg-[var(--surface-1)] disabled:opacity-50"
                  >
                    {addNote.isPending ? "Adding…" : "Add note"}
                  </button>
                </form>
              </div>
            </section>
          </div>
        </aside>
      </div>
    </div>
  );
}
