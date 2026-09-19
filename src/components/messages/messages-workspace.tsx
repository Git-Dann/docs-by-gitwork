"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import {
  CheckIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
  PaperAirplaneIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/format";
import { matchesPerson, summariseRecipients } from "@/lib/message-recipients";
import { menuItem, menuPanel } from "@/components/ui/menu-styles";
import { useTeamMembers } from "@/hooks/use-proposals";
import { usePermissions } from "@/hooks/use-permissions";
import {
  useDeleteMessage,
  useDismissMessage,
  useMarkAllMessagesRead,
  useMarkMessageRead,
  useMarkMessageUnread,
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
  const markUnread = useMarkMessageUnread();
  const dismiss = useDismissMessage();
  const remove = useDeleteMessage();
  const markAllRead = useMarkAllMessagesRead();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Infinite lists: pages are flattened for rendering, and the query itself owns
  // whether another page exists.
  const active = tab === "inbox" ? inbox : sent;
  const messages: TeamMessage[] = (active.data?.pages ?? []).flatMap((p) => p.messages);
  const inboxMessages: TeamMessage[] = (inbox.data?.pages ?? []).flatMap((p) => p.messages);
  const loading = active.isLoading;
  const open = messages.find((m) => m.id === openId) ?? null;
  // Counts only what has been LOADED, which is why the readout says so — claiming a
  // total we have not fetched would be a number that quietly understates itself.
  const unread = inboxMessages.filter((m) => !m.readAt).length;

  // A notification links to /app/messages/<id>, which redirects here with ?open=<id>.
  // Opening it here rather than on its own page keeps one implementation of reading a
  // message — mark-as-read and read receipts included.
  const requestedId = searchParams.get("open");
  useEffect(() => {
    if (!requestedId) return;
    const target = inboxMessages.find((m) => m.id === requestedId);
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
            {unread > 0 ? `${unread} UNREAD` : `${messages.length} SHOWN`}
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
          {tab === "inbox" && unread > 0 && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={markAllRead.isPending}
              onClick={() => markAllRead.mutate(undefined as never)}
            >
              Mark all read
            </Button>
          )}
          {isAdminOrAbove && (
            <Button type="button" size="sm" onClick={() => setComposing(true)}>
              <PaperAirplaneIcon className="mr-1.5 h-4 w-4" />
              New message
            </Button>
          )}
        </div>

        {loading ? (
          <p className="px-4 py-10 text-center text-sm text-[var(--text-4)]">
            Loading…
          </p>
        ) : messages.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-[var(--text-4)]">
            {tab === "inbox"
              ? "Nothing here yet. Messages someone sends you will appear here."
              : "You haven't sent a message yet."}
          </p>
        ) : (
          <ul>
            {messages.map((message) => (
              <li
                key={message.id}
                className="group/row border-b border-[var(--border-2)] transition-colors hover:bg-[var(--surface-1)]"
              >
                <button
                  type="button"
                  onClick={() => openMessage(message)}
                  className="flex w-full flex-col gap-1 px-4 pb-1.5 pt-3 text-left"
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
                  <p
                    className="truncate pl-0 text-xs text-[var(--text-4)]"
                    title={message.body}
                  >
                    {tab === "inbox"
                      ? `${message.author.name ?? message.author.email} · `
                      : `${describeReadState(message)} · `}
                    {preview(message.body)}
                  </p>
                </button>
                {/* Actions sit outside the row button — nesting a button inside a
                    button is invalid HTML and the inner click would not fire. They are
                    revealed on hover/focus rather than drawn on every resting row: a
                    list whose every row carries controls reads as chrome, not content.
                    `focus-within` keeps them reachable by keyboard, so revealing them
                    is a visual default and never a gate. */}
                <div className="flex flex-wrap gap-3 px-4 pb-3 opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100">
                  {tab === "inbox" ? (
                    <>
                      <RowAction
                        onClick={() =>
                          message.readAt
                            ? markUnread.mutate(message.id)
                            : markRead.mutate(message.id)
                        }
                      >
                        {message.readAt ? "Mark unread" : "Mark read"}
                      </RowAction>
                      <RowAction onClick={() => dismiss.mutate(message.id)}>
                        Remove from my list
                      </RowAction>
                    </>
                  ) : (
                    <RowAction
                      danger
                      onClick={() =>
                        confirmDelete === message.id
                          ? remove.mutate(message.id, {
                              onSettled: () => setConfirmDelete(null),
                            })
                          : setConfirmDelete(message.id)
                      }
                    >
                      {/* Two-click rather than a dialog: it is reversible for nobody,
                          but it is also not dangerous enough to warrant a modal, and
                          the label states plainly that it does not unsend. */}
                      {confirmDelete === message.id
                        ? "Delete for everyone — click to confirm"
                        : "Delete"}
                    </RowAction>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Say which of the two it is. A list that simply stops is indistinguishable
            from one that has been truncated, and the truncated case is the one that
            loses information without telling anyone. */}
        {!loading && messages.length > 0 && (
          <div className="border-t border-[var(--border-2)] px-4 py-3 text-center">
            {active.hasNextPage ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={active.isFetchingNextPage}
                onClick={() => void active.fetchNextPage()}
              >
                {active.isFetchingNextPage ? "Loading…" : "Load older"}
              </Button>
            ) : (
              <span className="widget-data-label text-[var(--text-4)]">
                END OF LIST · {messages.length} SHOWN
              </span>
            )}
          </div>
        )}
      </section>

      {open && (
        <ReadModal
          message={open}
          showReceipts={tab === "sent"}
          onClose={() => setOpenId(null)}
        />
      )}
      {composing && <ComposeModal onClose={() => setComposing(false)} />}
    </>
  );
}

function RowAction({
  onClick,
  danger,
  children,
}: {
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-[11px] underline-offset-2 hover:underline",
        danger
          ? "text-[var(--danger-500)]"
          : "text-[var(--text-4)] hover:text-[var(--text-2)]",
      )}
    >
      {children}
    </button>
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
      <div className="app-dialog-fixed">
        <p className="shrink-0 border-b border-[var(--border-2)] px-1 pb-3 text-xs text-[var(--text-4)]">
          {message.author.name ?? message.author.email} ·{" "}
          {formatWhen(message.createdAt)}
        </p>
        {/* The body is the point, so it gets the room and the scroll. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-1 py-4">
          <p className="whitespace-pre-wrap text-sm leading-7 text-[var(--text-2)]">
            {message.body}
          </p>
        </div>
        {showReceipts && (
          <div className="shrink-0 border-t border-[var(--border-2)] px-1 pt-3">
            <p className="widget-data-label mb-2 text-[var(--text-4)]">
              READ BY
            </p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {message.recipients.map((r) => (
                <li key={r.userId} className="text-xs text-[var(--text-3)]">
                  {r.name ?? r.email}
                  <span
                    className={cn(
                      "ml-1.5",
                      r.readAt
                        ? "text-[var(--success-500)]"
                        : "text-[var(--text-4)]",
                    )}
                  >
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

type Person = { userId: string; name?: string | null; email: string };

/**
 * One field that opens a checklist, instead of a chip per teammate.
 *
 * The roster is 29 people and grows. Laid out as chips it ran to 13 rows — measured at
 * 390px, ~700px of a 760px viewport — so the MESSAGE box, which is the entire point of
 * the dialog, started below the fold and you scrolled past everyone's name to reach it.
 *
 * ⚠️ The panel is a Headless UI `Popover` with `anchor`, which PORTALS to the document
 * body. That is not a preference: this sits inside the dialog's `overflow-y-auto` body,
 * and an absolutely-positioned panel (the shape `task-filter-bar.tsx` uses on a page)
 * would be CLIPPED by that scroller — `overflow-y: auto` forces `overflow-x` to `auto`
 * too, so the element becomes a clipping box on both axes. Same trap as the row popover
 * in `course-requests-section.tsx`, which is anchored for the same reason.
 */
function RecipientPicker({
  people,
  picked,
  myUserId,
  onToggle,
  onSetAll,
}: {
  people: Person[];
  picked: string[];
  myUserId?: string;
  onToggle: (userId: string) => void;
  onSetAll: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const label = (m: Person) =>
    `${m.name ?? m.email}${m.userId === myUserId ? " (you)" : ""}`;

  const shown = people.filter((m) =>
    matchesPerson(query, m.name ?? "", m.email),
  );
  const pickedNames = people
    .filter((m) => picked.includes(m.userId))
    .map(label);
  const summary = summariseRecipients(pickedNames, people.length);
  const allPicked = people.length > 0 && picked.length === people.length;

  return (
    <Popover className="relative">
      <PopoverButton
        aria-labelledby="msg-to-label"
        className="app-input flex w-full items-center justify-between gap-2 text-left"
      >
        {/* Muted only while it is a prompt; a real choice is body text. */}
        <span
          className={cn(
            "min-w-0 truncate text-sm",
            picked.length > 0 ? "text-[var(--text-1)]" : "text-[var(--text-4)]",
          )}
          title={pickedNames.join(", ")}
        >
          {summary}
        </span>
        <ChevronDownIcon className="h-4 w-4 shrink-0 text-[var(--text-4)]" />
      </PopoverButton>

      <PopoverPanel
        anchor={{ to: "bottom start", gap: 6 }}
        /* The house popover (menu-styles), plus the two things a field-width picker
           adds. The floor matters: `--button-width` comes from Headless UI measuring
           the trigger, so anything leaving it unset collapses the panel to nothing. It
           never binds at a real field width. `p-0` because this panel has its own
           bordered header rather than the standard padded row list. */
        className={cn(
          menuPanel,
          "w-[var(--button-width)] min-w-[260px] max-w-[calc(100vw-2rem)] p-0",
        )}
      >
        <div className="flex items-center gap-2 border-b border-[var(--border-2)] px-2.5 py-2">
          <MagnifyingGlassIcon className="h-3.5 w-3.5 shrink-0 text-[var(--text-4)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find someone…"
            aria-label="Filter people"
            /* 16px: anything smaller makes iOS Safari zoom the viewport on focus. */
            className="min-w-0 flex-1 bg-transparent text-[16px] text-[var(--text-1)] placeholder:text-[var(--text-4)] focus:outline-none"
          />
          <button
            type="button"
            onClick={() =>
              onSetAll(allPicked ? [] : people.map((m) => m.userId))
            }
            className="shrink-0 text-[11px] font-medium text-[var(--text-3)] underline-offset-2 hover:text-[var(--text-1)] hover:underline"
          >
            {allPicked ? "Clear" : "Select all"}
          </button>
        </div>

        {/* Bounded so the panel cannot outgrow the viewport; the list scrolls inside. */}
        <div className="max-h-[min(300px,45vh)] overflow-y-auto p-1.5">
          {shown.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-[var(--text-4)]">
              Nobody matches “{query.trim()}”.
            </p>
          ) : (
            shown.map((m) => {
              const on = picked.includes(m.userId);
              return (
                <button
                  key={m.userId}
                  type="button"
                  onClick={() => onToggle(m.userId)}
                  aria-pressed={on}
                  className={cn(menuItem, "gap-2.5")}
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border",
                      on
                        ? "border-[var(--brand-700)] bg-[var(--brand-700)] text-white"
                        : "border-[var(--border-3)] bg-[var(--surface-0)]",
                    )}
                  >
                    {on ? <CheckIcon className="h-3 w-3" /> : null}
                  </span>
                  {/* Sending to yourself is supported and worth signposting — it is how
                      you check your own wording, and the phone it lands on, first. */}
                  <span className="min-w-0 truncate text-[var(--text-2)]">
                    {label(m)}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </PopoverPanel>
    </Popover>
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
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId],
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

  const canSend =
    subject.trim() && body.trim() && picked.length > 0 && !send.isPending;

  return (
    <Modal open onClose={onClose} title="New message">
      <div className="app-dialog-fixed">
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1 py-1">
          <div>
            <label
              htmlFor="msg-subject"
              className="widget-data-label mb-1.5 block text-[var(--text-4)]"
            >
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
            {/* The count lives on the field itself, so saying it here too would print
                the same fact twice. */}
            <p
              id="msg-to-label"
              className="widget-data-label mb-1.5 text-[var(--text-4)]"
            >
              TO
            </p>
            <RecipientPicker
              people={people}
              picked={picked}
              myUserId={myUserId}
              onToggle={toggle}
              onSetAll={setPicked}
            />
          </div>

          {/* The message takes the room the chip wall used to: it is what the dialog is
              for, and the box is a known height now. min-h keeps it usable on a short
              viewport, where the body scroller takes over. */}
          <div className="flex min-h-0 flex-1 flex-col">
            <label
              htmlFor="msg-body"
              className="widget-data-label mb-1.5 block text-[var(--text-4)]"
            >
              MESSAGE
            </label>
            <textarea
              id="msg-body"
              className="app-textarea min-h-[180px] w-full flex-1"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write the summary…"
            />
          </div>
        </div>

        <div className="shrink-0 border-t border-[var(--border-2)] pt-3">
          {error && (
            <p className="mb-2 text-xs text-[var(--danger-500)]">{error}</p>
          )}
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-[var(--text-4)]">
              Sends a notification to each person, including their phone.
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!canSend}
                onClick={() => void submit()}
              >
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
  if (days === 0)
    return d.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
