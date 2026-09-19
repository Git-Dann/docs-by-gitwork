"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { PaperAirplaneIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/format";
import { useTeamMembers } from "@/hooks/use-proposals";
import { usePermissions } from "@/hooks/use-permissions";
import {
  useMarkMessageRead,
  useMyMessages,
  useSendMessage,
  useSentMessages,
} from "@/hooks/use-messages";
import type { TeamMessage } from "@/lib/api";

type Tab = "inbox" | "sent";

export function MessagesWorkspace() {
  const { isAdminOrAbove } = usePermissions();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>("inbox");
  const [openId, setOpenId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  const inbox = useMyMessages();
  const sent = useSentMessages(isAdminOrAbove && tab === "sent");
  const markRead = useMarkMessageRead();

  const messages = tab === "inbox" ? (inbox.data?.messages ?? []) : (sent.data?.messages ?? []);
  const loading = tab === "inbox" ? inbox.isLoading : sent.isLoading;
  const open = messages.find((m) => m.id === openId) ?? null;
  const unread = inbox.data?.messages.filter((m) => !m.readAt).length ?? 0;

  // A notification links to /app/messages/<id>, which redirects here with ?open=<id>.
  // Opening it here rather than on its own page keeps one implementation of reading a
  // message — mark-as-read and read receipts included.
  const requestedId = searchParams.get("open");
  useEffect(() => {
    if (!requestedId) return;
    const target = inbox.data?.messages.find((m) => m.id === requestedId);
    if (!target) return;
    setOpenId(requestedId);
    if (!target.readAt) markRead.mutate(requestedId);
    // Intentionally keyed on the id and the loaded set only: adding the mutation to the
    // deps would re-run this on every mutation state change and re-open a message the
    // reader had just closed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedId, inbox.data]);

  function openMessage(message: TeamMessage) {
    setOpenId(message.id);
    // Only an addressee has something to mark — the author reading their own sent
    // message must not stamp a read receipt on it.
    if (tab === "inbox" && !message.readAt) markRead.mutate(message.id);
  }

  return (
    <>
      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label">
            <span className="widget-header__label--number">01</span>
            {" // MESSAGES"}
          </span>
          <span className="widget-header__status">
            {unread > 0 ? `${unread} UNREAD` : `${messages.length} TOTAL`}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border-2)] px-4 py-3">
          <div className="flex items-center gap-1 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] p-1">
            <TabButton active={tab === "inbox"} onClick={() => setTab("inbox")}>
              Received
            </TabButton>
            {isAdminOrAbove && (
              <TabButton active={tab === "sent"} onClick={() => setTab("sent")}>
                Sent
              </TabButton>
            )}
          </div>
          <div className="flex-1" />
          {isAdminOrAbove && (
            <Button type="button" size="sm" onClick={() => setComposing(true)}>
              <PaperAirplaneIcon className="mr-1.5 h-4 w-4" />
              New message
            </Button>
          )}
        </div>

        {loading ? (
          <p className="px-4 py-10 text-center text-sm text-[var(--text-4)]">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-[var(--text-4)]">
            {tab === "inbox"
              ? "Nothing here yet. Messages someone sends you will appear here."
              : "You haven't sent a message yet."}
          </p>
        ) : (
          <ul>
            {messages.map((message) => (
              <li key={message.id}>
                <button
                  type="button"
                  onClick={() => openMessage(message)}
                  className="flex w-full flex-col gap-1 border-b border-[var(--border-2)] px-4 py-3 text-left transition-colors hover:bg-[var(--surface-1)]"
                >
                  <div className="flex items-baseline gap-3">
                    {tab === "inbox" && !message.readAt && (
                      <span
                        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand-500)]"
                        aria-label="Unread"
                      />
                    )}
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-sm",
                        tab === "inbox" && !message.readAt
                          ? "font-semibold text-[var(--text-1)]"
                          : "text-[var(--text-2)]",
                      )}
                      title={message.subject}
                    >
                      {message.subject}
                    </span>
                    <span className="widget-data-label shrink-0 text-[var(--text-4)]">
                      {formatWhen(message.createdAt)}
                    </span>
                  </div>
                  <p className="truncate pl-0 text-xs text-[var(--text-4)]" title={message.body}>
                    {tab === "inbox"
                      ? `${message.author.name ?? message.author.email} · `
                      : `${describeReadState(message)} · `}
                    {preview(message.body)}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {open && <ReadModal message={open} showReceipts={tab === "sent"} onClose={() => setOpenId(null)} />}
      {composing && <ComposeModal onClose={() => setComposing(false)} />}
    </>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-[6px] px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-[var(--surface-0)] text-[var(--brand-600)] shadow-sm"
          : "text-[var(--text-3)] hover:text-[var(--text-2)]",
      )}
    >
      {children}
    </button>
  );
}

function ReadModal({
  message,
  showReceipts,
  onClose,
}: {
  message: TeamMessage;
  showReceipts: boolean;
  onClose: () => void;
}) {
  return (
    <Modal open onClose={onClose} title={message.subject}>
      <div className="flex h-[70vh] max-h-[620px] min-h-[min(420px,70vh)] flex-col">
        <p className="shrink-0 border-b border-[var(--border-2)] px-1 pb-3 text-xs text-[var(--text-4)]">
          {message.author.name ?? message.author.email} · {formatWhen(message.createdAt)}
        </p>
        {/* The body is the point, so it gets the room and the scroll. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-1 py-4">
          <p className="whitespace-pre-wrap text-sm leading-7 text-[var(--text-2)]">
            {message.body}
          </p>
        </div>
        {showReceipts && (
          <div className="shrink-0 border-t border-[var(--border-2)] px-1 pt-3">
            <p className="widget-data-label mb-2 text-[var(--text-4)]">READ BY</p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {message.recipients.map((r) => (
                <li key={r.userId} className="text-xs text-[var(--text-3)]">
                  {r.name ?? r.email}
                  <span className={cn("ml-1.5", r.readAt ? "text-[var(--success-500)]" : "text-[var(--text-4)]")}>
                    {r.readAt ? formatWhen(r.readAt) : "not yet"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}

function ComposeModal({ onClose }: { onClose: () => void }) {
  const members = useTeamMembers();
  const { data: session } = useSession();
  const myUserId = session?.user?.id;
  const send = useSendMessage();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const people = useMemo(
    () =>
      (members.data?.members ?? [])
        .slice()
        .sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email)),
    [members.data],
  );

  function toggle(userId: string) {
    setPicked((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  }

  async function submit() {
    setError(null);
    try {
      await send.mutateAsync({ subject, body, recipientIds: picked });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send that.");
    }
  }

  const canSend = subject.trim() && body.trim() && picked.length > 0 && !send.isPending;

  return (
    <Modal open onClose={onClose} title="New message">
      <div className="flex h-[76vh] max-h-[680px] min-h-[min(460px,76vh)] flex-col">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-1 py-1">
          <div>
            <label htmlFor="msg-subject" className="widget-data-label mb-1.5 block text-[var(--text-4)]">
              SUBJECT
            </label>
            <input
              id="msg-subject"
              className="app-input w-full"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Week of 22 September"
              maxLength={200}
            />
          </div>

          <div>
            <p className="widget-data-label mb-1.5 text-[var(--text-4)]">
              TO {picked.length > 0 && `· ${picked.length} SELECTED`}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {people.map((m) => {
                const on = picked.includes(m.userId);
                const isMe = m.userId === myUserId;
                return (
                  <button
                    key={m.userId}
                    type="button"
                    onClick={() => toggle(m.userId)}
                    className={cn(
                      "rounded-[6px] border px-2.5 py-1 text-xs transition-colors",
                      on
                        ? "border-[var(--brand-500)] bg-[var(--brand-50)] text-[var(--brand-600)]"
                        : "border-[var(--border-2)] text-[var(--text-3)] hover:text-[var(--text-2)]",
                    )}
                  >
                    {/* Picking yourself is supported and worth signposting — it is how
                        you check your own wording, and the phone it lands on, before
                        sending it to anyone else. */}
                    {isMe ? "Me (test)" : (m.name ?? m.email)}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label htmlFor="msg-body" className="widget-data-label mb-1.5 block text-[var(--text-4)]">
              MESSAGE
            </label>
            <textarea
              id="msg-body"
              className="app-textarea min-h-[220px] w-full"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write the summary…"
            />
          </div>
        </div>

        <div className="shrink-0 border-t border-[var(--border-2)] pt-3">
          {error && <p className="mb-2 text-xs text-[var(--danger-500)]">{error}</p>}
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-[var(--text-4)]">
              Sends a notification to each person, including their phone.
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button type="button" size="sm" disabled={!canSend} onClick={() => void submit()}>
                {send.isPending ? "Sending…" : "Send"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function describeReadState(message: TeamMessage): string {
  const read = message.recipients.filter((r) => r.readAt).length;
  return `read by ${read} of ${message.recipients.length}`;
}

function preview(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > 120 ? `${flat.slice(0, 119)}…` : flat;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days === 0) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
