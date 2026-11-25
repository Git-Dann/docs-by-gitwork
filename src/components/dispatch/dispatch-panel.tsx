"use client";

/**
 * Dispatch, in the app: a right-hand panel that opens already knowing where you are (a client,
 * or a task). Mounted once in the app shell; opened with `openDispatch(...)` from the header,
 * ⌘K, a client page, My Clients or a task.
 *
 * Answers stream in as server-sent events from /api/dispatch/chat. Anything Dispatch wants to
 * change arrives as a card with Confirm / Cancel; nothing changes until the person confirms.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ChatBubbleLeftRightIcon,
  CheckIcon,
  ClipboardDocumentIcon,
  PaperAirplaneIcon,
  PaperClipIcon,
  PlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Markdown } from "@/lib/markdown";
import { cn } from "@/lib/format";
import { viewAsHeaders, apiFetch } from "@/lib/api";
import { useClientList } from "@/hooks/use-proposals";
import { useDispatchAvailable } from "@/hooks/use-dispatch";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/motion/spinner";
import { skillsFor, type DispatchSkill } from "@/lib/dispatch/skills";
import { DISPATCH_OPEN_EVENT, openDispatch, type OpenDispatchDetail } from "@/lib/dispatch/open";
import { shrinkPicture } from "@/lib/dispatch/shrink-picture";
import { MAX_ATTACHMENTS } from "@/lib/dispatch/limits";

type Item =
  | { type: "question"; text: string; key: string; pictures?: number }
  | { type: "answer"; text: string; key: string }
  | { type: "action"; key: string; id: string; title: string; lines: string[]; status: string; message: string | null }
  | { type: "notice"; text: string; key: string };

interface Source {
  kind: string;
  id: string;
  label: string;
  href?: string;
}

interface Availability {
  available: boolean;
  conversations: { id: string; clientId: string; title: string; updatedAt: string }[];
}

const MONO = { fontFamily: "var(--font-mono)" } as const;

let keySeq = 0;
const nextKey = () => `k${++keySeq}`;

export function DispatchPanel() {
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [clientSlug, setClientSlug] = useState<string>("");
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  /** Screenshots attached to the next question, already shrunk (data: URLs). */
  const [pictures, setPictures] = useState<{ key: string; url: string }[]>([]);
  const [pictureError, setPictureError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [history, setHistory] = useState<Availability["conversations"]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const clients = useClientList(undefined, { enabled: open });
  const clientOptions = useMemo(
    () => [...(clients.data?.clients ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [clients.data],
  );
  const clientName = clientOptions.find((c) => c.slug === clientSlug)?.name;

  const reset = useCallback(() => {
    setConversationId(null);
    setItems([]);
    setSources([]);
    setStatus(null);
  }, []);

  // Opened from anywhere in the app.
  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent<OpenDispatchDetail>).detail ?? {};
      setOpen(true);
      if (detail.clientSlug && detail.clientSlug !== clientSlug) {
        setClientSlug(detail.clientSlug);
        reset();
      }
      setFocusTaskId(detail.taskId ?? null);
      if (detail.prompt) setDraft(detail.prompt);
      window.setTimeout(() => inputRef.current?.focus(), 50);
    }
    window.addEventListener(DISPATCH_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(DISPATCH_OPEN_EVENT, onOpen);
  }, [clientSlug, reset]);

  // Whether this person can use Dispatch, and their recent chats for this client.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const qs = clientSlug ? `?clientSlug=${encodeURIComponent(clientSlug)}` : "";
    apiFetch<Availability>(`/api/dispatch/conversations${qs}`)
      .then((r) => {
        if (cancelled) return;
        setAvailable(r.available);
        setHistory(r.conversations);
      })
      .catch(() => !cancelled && setAvailable(false));
    return () => {
      cancelled = true;
    };
  }, [open, clientSlug, conversationId]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items, status]);

  async function loadConversation(id: string) {
    const res = await apiFetch<{
      id: string;
      client: { slug: string } | null;
      timeline: (
        | { type: "question" | "answer"; text: string; pictures?: number }
        | { type: "action"; id: string; title: string; lines: string[]; status: string; message: string | null }
      )[];
    }>(`/api/dispatch/conversations/${id}`);
    setConversationId(res.id);
    if (res.client) setClientSlug(res.client.slug);
    setSources([]);
    setItems(res.timeline.map((t) => (t.type === "action" ? { ...t, key: nextKey() } : { ...t, key: nextKey() })));
  }

  async function attach(files: Iterable<File>) {
    setPictureError(null);
    const list = [...files].filter((f) => f.type.startsWith("image/"));
    const room = MAX_ATTACHMENTS - pictures.length;
    if (list.length > room) setPictureError(`Up to ${MAX_ATTACHMENTS} pictures per question.`);
    for (const f of list.slice(0, Math.max(0, room))) {
      try {
        const url = await shrinkPicture(f);
        setPictures((prev) => (prev.length >= MAX_ATTACHMENTS ? prev : [...prev, { key: nextKey(), url }]));
      } catch {
        setPictureError("That picture couldn't be read.");
      }
    }
  }

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy || !clientSlug) return;
    const sending = pictures;
    setDraft("");
    setPictures([]);
    setPictureError(null);
    setBusy(true);
    setStatus("Thinking");
    const answerKey = nextKey();
    setItems((prev) => [
      ...prev,
      { type: "question", text: q, key: nextKey(), ...(sending.length ? { pictures: sending.length } : {}) },
      { type: "answer", text: "", key: answerKey },
    ]);
    try {
      const res = await fetch("/api/dispatch/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...viewAsHeaders() },
        body: JSON.stringify({
          question: q,
          ...(conversationId ? { conversationId } : { clientSlug }),
          ...(focusTaskId && !conversationId ? { focusTaskId } : {}),
          ...(sending.length ? { images: sending.map((p) => p.url) } : {}),
        }),
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Dispatch couldn't answer just now.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let cut: number;
        while ((cut = buffer.indexOf("\n\n")) !== -1) {
          const chunk = buffer.slice(0, cut);
          buffer = buffer.slice(cut + 2);
          const event = /^event: (.+)$/m.exec(chunk)?.[1];
          const dataLine = /^data: (.*)$/m.exec(chunk)?.[1];
          if (!event || dataLine === undefined) continue;
          const data = JSON.parse(dataLine) as Record<string, unknown>;
          if (event === "conversation") setConversationId(String(data.id));
          else if (event === "text") {
            setStatus(null);
            setItems((prev) =>
              prev.map((it) => (it.key === answerKey && it.type === "answer" ? { ...it, text: it.text + String(data.delta) } : it)),
            );
          } else if (event === "status") setStatus(String(data.text));
          else if (event === "action")
            setItems((prev) => [
              ...prev,
              {
                type: "action",
                key: nextKey(),
                id: String(data.id),
                title: String(data.title),
                lines: (data.lines as string[]) ?? [],
                status: "pending",
                message: null,
              },
            ]);
          else if (event === "sources")
            setSources((prev) => {
              const seen = new Set(prev.map((s) => `${s.kind}:${s.id}`));
              return [...prev, ...(data as unknown as Source[]).filter((s) => !seen.has(`${s.kind}:${s.id}`))].slice(-12);
            });
          else if (event === "notice") setItems((prev) => [...prev, { type: "notice", text: String(data.text), key: nextKey() }]);
        }
      }
    } catch (err) {
      setItems((prev) => [...prev, { type: "notice", text: err instanceof Error ? err.message : "Something went wrong.", key: nextKey() }]);
    } finally {
      // An answer that never got any text (only a card, or an error) is dropped, not left blank.
      setItems((prev) => prev.filter((it) => !(it.key === answerKey && it.type === "answer" && !it.text.trim())));
      setStatus(null);
      setBusy(false);
    }
  }

  async function decide(actionId: string, decision: "confirm" | "cancel") {
    setItems((prev) => prev.map((it) => (it.type === "action" && it.id === actionId ? { ...it, status: "working" } : it)));
    try {
      const res = await apiFetch<{ status: string; message: string }>(`/api/dispatch/actions/${actionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      setItems((prev) =>
        prev.map((it) => (it.type === "action" && it.id === actionId ? { ...it, status: res.status, message: res.message } : it)),
      );
    } catch (err) {
      setItems((prev) =>
        prev.map((it) =>
          it.type === "action" && it.id === actionId
            ? { ...it, status: "failed", message: err instanceof Error ? err.message : "That didn't work." }
            : it,
        ),
      );
    }
  }

  function pickSkill(skill: DispatchSkill) {
    if (skill.needsInput) {
      setDraft(skill.prompt);
      window.setTimeout(() => {
        const el = inputRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        }
      }, 20);
    } else void ask(skill.prompt);
  }

  if (!open) return null;

  const skills = skillsFor(focusTaskId ? "task" : "client");

  return (
    <div className="fixed inset-0 z-[65] flex justify-end" role="dialog" aria-modal="true" aria-label="Dispatch">
      <button type="button" aria-label="Close Dispatch" className="app-dialog-backdrop absolute inset-0 lg:bg-transparent" onClick={() => setOpen(false)} />
      <div className="motion-sheet-right relative z-10 flex h-full w-full flex-col border-l border-[var(--border-2)] bg-[var(--surface-0)] shadow-[0_12px_32px_-4px_rgba(0,0,0,0.18)] sm:max-w-[460px]">
        {/* Header */}
        <div className="widget-header shrink-0">
          <span className="widget-header__label" style={MONO}>
            <ChatBubbleLeftRightIcon className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" />
            DISPATCH
          </span>
          <span className="widget-header__right flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                reset();
                setFocusTaskId(null);
              }}
              title="New chat"
              aria-label="New chat"
              className="rounded-[6px] p-1 text-[var(--text-3)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
            >
              <PlusIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              title="Close"
              aria-label="Close"
              className="rounded-[6px] p-1 text-[var(--text-3)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </span>
        </div>

        {/* Which client this chat is about */}
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border-2)] px-4 py-2.5">
          <label htmlFor="dispatch-client" className="text-[11px] font-medium uppercase tracking-[0.8px] text-[var(--text-4)]" style={MONO}>
            Client
          </label>
          <select
            id="dispatch-client"
            className="app-select-compact min-w-0 flex-1 text-[16px] sm:text-sm"
            value={clientSlug}
            disabled={busy}
            onChange={(e) => {
              setClientSlug(e.target.value);
              setFocusTaskId(null);
              reset();
            }}
          >
            <option value="">Pick a client…</option>
            {clientOptions.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
          {history.length > 0 ? (
            <select
              aria-label="Earlier chats"
              className="app-select-compact w-[130px] text-[16px] sm:text-sm"
              value=""
              onChange={(e) => e.target.value && void loadConversation(e.target.value)}
            >
              <option value="">Earlier chats</option>
              {history.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.title}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        {/* Conversation */}
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {available === false ? (
            <p className="text-sm text-[var(--text-3)]">Dispatch isn&apos;t switched on for your account yet.</p>
          ) : !clientSlug ? (
            <div className="space-y-2 text-sm text-[var(--text-2)]">
              <p className="font-medium text-[var(--text-1)]">Ask about a client you work on.</p>
              <p className="text-[var(--text-3)]">
                Dispatch reads the client&apos;s tasks, meeting notes, wiki, documents, Drive folder and the team&apos;s Slack
                channel, only as far as you can see them. It answers in plain English, and anything it would change waits for
                you to confirm.
              </p>
            </div>
          ) : items.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-[var(--text-2)]">
                Ask anything about <span className="font-medium text-[var(--text-1)]">{clientName ?? clientSlug}</span>
                {focusTaskId ? ", or about the task you came from" : ""}.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {skills.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => pickSkill(s)}
                    className="rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] px-2.5 py-1.5 text-left text-xs font-medium text-[var(--text-2)] transition hover:border-[var(--brand-300)] hover:bg-[var(--surface-1)]"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            items.map((it) => <ChatItem key={it.key} item={it} onDecide={decide} />)
          )}
          {status ? (
            <p role="status" className="inline-flex items-center gap-2 text-xs text-[var(--text-3)]">
              <Spinner size="sm" tone="brand" />
              {status}…
            </p>
          ) : null}
          {sources.length > 0 && !busy ? (
            <div className="flex flex-wrap gap-1.5 border-t border-[var(--border-2)] pt-3">
              <span className="w-full text-[10px] font-medium uppercase tracking-[0.8px] text-[var(--text-4)]" style={MONO}>
                Sources
              </span>
              {sources.map((s) =>
                s.href ? (
                  <Link
                    key={`${s.kind}:${s.id}`}
                    href={s.href}
                    target={s.href.startsWith("http") ? "_blank" : undefined}
                    className="max-w-[200px] truncate rounded-[4px] border border-[var(--border-2)] px-1.5 py-0.5 text-[11px] text-[var(--text-3)] hover:text-[var(--brand-700)]"
                    title={s.label}
                  >
                    {s.label}
                  </Link>
                ) : (
                  <span key={`${s.kind}:${s.id}`} className="max-w-[200px] truncate rounded-[4px] border border-[var(--border-2)] px-1.5 py-0.5 text-[11px] text-[var(--text-3)]" title={s.label}>
                    {s.label}
                  </span>
                ),
              )}
            </div>
          ) : null}
        </div>

        {/* Composer */}
        {available !== false ? (
          <form
            className="shrink-0 border-t border-[var(--border-2)] p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(draft);
            }}
          >
            {pictures.length ? (
              <div className="mb-2 flex flex-wrap gap-2" aria-label="Attached pictures">
                {pictures.map((p, i) => (
                  <span key={p.key} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element -- a local data: URL the person just attached */}
                    <img src={p.url} alt={`Attached picture ${i + 1}`} className="h-14 w-14 rounded-[6px] border border-[var(--border-2)] object-cover" />
                    <button
                      type="button"
                      aria-label={`Remove picture ${i + 1}`}
                      onClick={() => setPictures((prev) => prev.filter((x) => x.key !== p.key))}
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border-2)] bg-[var(--surface-0)] text-[var(--text-3)] hover:text-[var(--text-1)]"
                    >
                      <XMarkIcon className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            {pictureError ? <p className="mb-2 text-xs text-amber-700">{pictureError}</p> : null}
            <div className="flex items-end gap-2 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] p-2 focus-within:border-[var(--brand-400)]">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) void attach(e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                aria-label="Attach screenshots"
                title="Attach screenshots (or paste them)"
                disabled={!clientSlug || busy || pictures.length >= MAX_ATTACHMENTS}
                onClick={() => fileRef.current?.click()}
                className="mb-1 shrink-0 rounded-[6px] p-1.5 text-[var(--text-3)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)] disabled:opacity-40"
              >
                <PaperClipIcon className="h-4 w-4" />
              </button>
              <textarea
                ref={inputRef}
                value={draft}
                rows={2}
                disabled={!clientSlug}
                onChange={(e) => setDraft(e.target.value)}
                onPaste={(e) => {
                  const files = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
                  if (files.length) {
                    e.preventDefault();
                    void attach(files);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void ask(draft);
                  }
                }}
                placeholder={clientSlug ? "Ask Dispatch…" : "Pick a client first"}
                aria-label="Your question for Dispatch"
                className="max-h-40 min-h-[44px] w-full resize-none bg-transparent px-1 py-1 text-[16px] leading-6 text-[var(--text-1)] placeholder:text-[var(--text-4)] sm:text-sm"
                style={{ outline: "none" }}
              />
              <Button type="submit" variant="primary" size="sm" loading={busy} disabled={!draft.trim() || !clientSlug} aria-label="Send">
                {busy ? null : <PaperAirplaneIcon className="h-4 w-4" />}
              </Button>
            </div>
            <p className="mt-1.5 text-[10.5px] text-[var(--text-4)]">
              Only sees what you can. Changes wait for your click. Paste or attach screenshots to compare with the design.
            </p>
          </form>
        ) : null}
      </div>
    </div>
  );
}

function ChatItem({ item, onDecide }: { item: Item; onDecide: (id: string, d: "confirm" | "cancel") => void }) {
  const [copied, setCopied] = useState(false);
  if (item.type === "question") {
    return (
      <div className="ml-8 rounded-[10px] bg-[var(--surface-1)] px-3 py-2 text-sm whitespace-pre-wrap text-[var(--text-1)]">
        {item.text}
        {item.pictures ? (
          <span className="mt-1 flex items-center gap-1 text-xs text-[var(--text-3)]">
            <PaperClipIcon className="h-3 w-3" />
            {item.pictures} picture{item.pictures === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>
    );
  }
  if (item.type === "notice") {
    return <p className="rounded-[8px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{item.text}</p>;
  }
  if (item.type === "answer") {
    return (
      <div className="group relative text-sm text-[var(--text-1)]">
        <Markdown compact className="space-y-2">
          {item.text}
        </Markdown>
        {item.text.length > 40 ? (
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(item.text).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              });
            }}
            className="mt-1 inline-flex items-center gap-1 text-[11px] text-[var(--text-4)] opacity-70 transition hover:text-[var(--text-2)] group-hover:opacity-100"
          >
            {copied ? <CheckIcon className="h-3 w-3" /> : <ClipboardDocumentIcon className="h-3 w-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
        ) : null}
      </div>
    );
  }
  const pending = item.status === "pending";
  const working = item.status === "working";
  return (
    <div className="rounded-[10px] border border-[var(--brand-300)] bg-[var(--surface-brand)] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.8px] text-[var(--brand-700)]" style={MONO}>
        {pending || working ? "Waiting for you" : item.status === "done" ? "Done" : item.status === "cancelled" ? "Cancelled" : "Didn't happen"}
      </p>
      <p className="mt-1 text-sm font-medium text-[var(--text-1)]">{item.title}</p>
      {item.lines.length > 0 ? (
        <ul className="mt-1.5 space-y-0.5">
          {item.lines.map((l, i) => (
            <li key={i} className="text-xs text-[var(--text-2)]">
              • {l}
            </li>
          ))}
        </ul>
      ) : null}
      {item.message && !pending ? <p className="mt-1.5 text-xs text-[var(--text-3)]">{item.message}</p> : null}
      {pending || working ? (
        <div className="mt-2.5 flex gap-2">
          <Button type="button" variant="primary" size="sm" loading={working} onClick={() => onDecide(item.id, "confirm")}>
            Confirm
          </Button>
          <Button type="button" variant="tertiary" size="sm" disabled={working} onClick={() => onDecide(item.id, "cancel")}>
            Cancel
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Icon-only header button that opens Dispatch. Hidden until the person can use it. */
export function DispatchButton({ className }: { className?: string }) {
  const available = useDispatchAvailable();
  if (!available) return null;
  return (
    <button
      type="button"
      onClick={() => {
        const m = /^\/app\/portal\/([^/?#]+)/.exec(window.location.pathname);
        openDispatch({ clientSlug: m?.[1] });
      }}
      title="Ask Dispatch"
      aria-label="Ask Dispatch"
      className={cn(
        "flex items-center gap-1.5 rounded-[6px] border border-[var(--border-1)] bg-[var(--surface-0)] px-2.5 py-1.5 text-[13px] text-[var(--text-3)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]",
        className,
      )}
    >
      <ChatBubbleLeftRightIcon aria-hidden className="h-4 w-4" />
      <span className="hidden xl:inline">Dispatch</span>
    </button>
  );
}
