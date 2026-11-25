"use client";

/**
 * Dispatch, in the app: a right-hand panel that opens already knowing where you are (a client,
 * or a task). Mounted once in the app shell; opened with `openDispatch(...)` from the header,
 * ⌘K, a client page, My Clients or a task.
 *
 * It opens on a **brief**, not an empty chat (Dan, 25 Nov 2026: "I didn't want a chat bot, I
 * wanted something smarter"): your tasks that need you and why, what's coming, and two or three
 * things Dispatch could do next because of what it found. The brief is worked out from Foundry's
 * data with no AI call (/api/dispatch/brief), so opening the panel costs nothing.
 *
 * Questions stream back as server-sent events from /api/dispatch/chat; the steps Dispatch takes
 * ("Reading the board") show as a trail above the answer. Anything Dispatch wants to change
 * arrives as a card with Confirm / Cancel; nothing changes until the person confirms.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  ArrowRightIcon,
  ArrowTopRightOnSquareIcon,
  ArrowUpIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpDownIcon,
  ClipboardDocumentIcon,
  ClockIcon,
  PaperClipIcon,
  PencilSquareIcon,
  SparklesIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { Markdown } from "@/lib/markdown";
import { menuItem, menuPanel } from "@/components/ui/menu-styles";
import { cn } from "@/lib/format";
import { viewAsHeaders, apiFetch } from "@/lib/api";
import { useClientList } from "@/hooks/use-proposals";
import { useDispatchAvailable, useDispatchBrief, type DispatchBrief } from "@/hooks/use-dispatch";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/motion/spinner";
import { Skeleton } from "@/components/ui/motion/skeleton";
import { SKILL_GROUP_LABELS, skillsFor, type DispatchSkill, type SkillGroup } from "@/lib/dispatch/skills";
import { shortDay, type BriefSuggestion, type Tone } from "@/lib/dispatch/brief";
import { DISPATCH_OPEN_EVENT, openDispatch, type OpenDispatchDetail } from "@/lib/dispatch/open";
import { shrinkPicture } from "@/lib/dispatch/shrink-picture";
import { MAX_ATTACHMENTS } from "@/lib/dispatch/limits";

type Item =
  | { type: "question"; text: string; key: string; pictures?: number }
  | { type: "answer"; text: string; key: string; steps: string[]; working: boolean }
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
/** The client last used, so the panel opens on it next time (a convenience; may be missing). */
const LAST_CLIENT_KEY = "foundry.dispatch.lastClient";

let keySeq = 0;
const nextKey = () => `k${++keySeq}`;

function readLastClient(): string {
  try {
    return window.localStorage.getItem(LAST_CLIENT_KEY) ?? "";
  } catch {
    return "";
  }
}

function rememberClient(slug: string) {
  try {
    window.localStorage.setItem(LAST_CLIENT_KEY, slug);
  } catch {
    /* private window: nothing to remember */
  }
}

const TONE_TEXT: Record<Tone, string> = {
  danger: "text-[var(--danger-700)]",
  warning: "text-[var(--warning-500)]",
  brand: "text-[var(--brand-700)]",
  neutral: "text-[var(--text-3)]",
};
const TONE_PILL: Record<Tone, string> = {
  danger: "bg-[var(--danger-50)] text-[var(--danger-700)]",
  warning: "bg-[var(--warning-50)] text-[var(--warning-500)]",
  brand: "bg-[var(--brand-50)] text-[var(--brand-700)]",
  neutral: "bg-[var(--surface-1)] text-[var(--text-3)]",
};
const TONE_BAR: Record<Tone, string> = {
  danger: "bg-[var(--danger-500)]",
  warning: "bg-[var(--warning-500)]",
  brand: "bg-[var(--brand-500)]",
  neutral: "bg-[var(--border-1)]",
};

function greeting(now: Date): string {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function DispatchPanel() {
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [clientSlug, setClientSlug] = useState<string>("");
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  /** Screenshots attached to the next question, already shrunk (data: URLs). */
  const [pictures, setPictures] = useState<{ key: string; url: string }[]>([]);
  const [pictureError, setPictureError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [history, setHistory] = useState<Availability["conversations"]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { data: session } = useSession();
  const firstName = session?.user?.name?.split(/\s+/)[0] ?? null;

  const clients = useClientList(undefined, { enabled: open });
  const clientOptions = useMemo(
    () => [...(clients.data?.clients ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [clients.data],
  );
  const clientName = clientOptions.find((c) => c.slug === clientSlug)?.name;
  const brief = useDispatchBrief(clientSlug, focusTaskId, open && available === true && items.length === 0);

  const reset = useCallback(() => {
    setConversationId(null);
    setItems([]);
    setSources([]);
  }, []);

  const chooseClient = useCallback(
    (slug: string) => {
      setClientSlug(slug);
      setFocusTaskId(null);
      rememberClient(slug);
      reset();
    },
    [reset],
  );

  // Opened from anywhere in the app.
  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent<OpenDispatchDetail>).detail ?? {};
      setOpen(true);
      if (detail.clientSlug && detail.clientSlug !== clientSlug) {
        setClientSlug(detail.clientSlug);
        rememberClient(detail.clientSlug);
        reset();
      } else if (!detail.clientSlug && !clientSlug) {
        const last = readLastClient();
        if (last) setClientSlug(last);
      }
      setFocusTaskId(detail.taskId ?? null);
      if (detail.prompt) setDraft(detail.prompt);
      window.setTimeout(() => inputRef.current?.focus(), 50);
    }
    window.addEventListener(DISPATCH_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(DISPATCH_OPEN_EVENT, onOpen);
  }, [clientSlug, reset]);

  // Someone on one client gets that client; a remembered client they've lost access to is dropped.
  useEffect(() => {
    if (!open || !clients.data) return;
    if (clientOptions.length === 1 && clientSlug !== clientOptions[0].slug) setClientSlug(clientOptions[0].slug);
    else if (clientSlug && !clientOptions.some((c) => c.slug === clientSlug)) setClientSlug("");
  }, [open, clients.data, clientOptions, clientSlug]);

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
    if (el && items.length) el.scrollTop = el.scrollHeight;
  }, [items]);

  // The box grows with what's typed, up to about seven lines.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [draft, open]);

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
    setItems(
      res.timeline.map((t): Item =>
        t.type === "action"
          ? { ...t, key: nextKey() }
          : t.type === "answer"
            ? { type: "answer", text: t.text, key: nextKey(), steps: [], working: false }
            : { type: "question", text: t.text, pictures: t.pictures, key: nextKey() },
      ),
    );
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

  async function ask(question: string, opts: { taskId?: string } = {}) {
    const q = question.trim();
    if (!q || busy || !clientSlug) return;
    const sending = pictures;
    const taskId = opts.taskId ?? focusTaskId;
    if (opts.taskId) setFocusTaskId(opts.taskId);
    setDraft("");
    setPictures([]);
    setPictureError(null);
    setBusy(true);
    const answerKey = nextKey();
    const patchAnswer = (fn: (a: Extract<Item, { type: "answer" }>) => Extract<Item, { type: "answer" }>) =>
      setItems((prev) => prev.map((it) => (it.key === answerKey && it.type === "answer" ? fn(it) : it)));
    setItems((prev) => [
      ...prev,
      { type: "question", text: q, key: nextKey(), ...(sending.length ? { pictures: sending.length } : {}) },
      { type: "answer", text: "", key: answerKey, steps: [], working: true },
    ]);
    try {
      const res = await fetch("/api/dispatch/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...viewAsHeaders() },
        body: JSON.stringify({
          question: q,
          ...(conversationId ? { conversationId } : { clientSlug }),
          ...(taskId && !conversationId ? { focusTaskId: taskId } : {}),
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
          else if (event === "text") patchAnswer((a) => ({ ...a, text: a.text + String(data.delta) }));
          else if (event === "status") {
            const step = String(data.text);
            patchAnswer((a) => (a.steps[a.steps.length - 1] === step ? a : { ...a, steps: [...a.steps, step] }));
          } else if (event === "action")
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
      setItems((prev) =>
        prev
          .filter((it) => !(it.key === answerKey && it.type === "answer" && !it.text.trim()))
          .map((it) => (it.key === answerKey && it.type === "answer" ? { ...it, working: false } : it)),
      );
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

  function putInBox(text: string) {
    setDraft(text);
    window.setTimeout(() => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    }, 20);
  }

  function pick(s: { prompt: string; needsInput?: boolean }) {
    if (s.needsInput) putInBox(s.prompt);
    else void ask(s.prompt);
  }

  if (!open) return null;

  const inChat = items.length > 0;
  const manyClients = clientOptions.length > 1;

  return (
    <div className="fixed inset-0 z-[65] flex justify-end" role="dialog" aria-modal="true" aria-label="Dispatch">
      <button type="button" aria-label="Close Dispatch" className="app-dialog-backdrop absolute inset-0 lg:bg-transparent" onClick={() => setOpen(false)} />
      <div className="motion-sheet-right relative z-10 flex h-full w-full flex-col border-l border-[var(--border-2)] bg-[var(--surface-0)] shadow-[0_12px_32px_-4px_rgba(0,0,0,0.18)] sm:max-w-[480px]">
        {/* Header: who this is, and the client it's about */}
        <header className="shrink-0 border-b border-[var(--border-2)] px-4 pb-3 pt-3.5">
          <div className="flex items-center gap-2">
            <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-[var(--brand-700)] text-white">
              <SparklesIcon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="text-[13px] font-semibold text-[var(--text-1)]">Dispatch</p>
              {!manyClients && clientName ? <p className="truncate text-[11.5px] text-[var(--text-3)]">{clientName}</p> : null}
            </div>
            {history.length > 0 ? (
              <Listbox value="" onChange={(id: string) => id && void loadConversation(id)}>
                <ListboxButton aria-label="Earlier chats" title="Earlier chats" className={iconButton}>
                  <ClockIcon className="h-[18px] w-[18px]" aria-hidden />
                </ListboxButton>
                <ListboxOptions anchor={{ to: "bottom end", gap: 4 }} className={cn(menuPanel, "z-[70] max-h-[min(60vh,360px)] w-72 overflow-y-auto")}>
                  <p className="px-3 pb-1 pt-2 text-[10.5px] font-medium uppercase tracking-[0.8px] text-[var(--text-4)]" style={MONO}>
                    Earlier chats
                  </p>
                  {history.map((h) => (
                    <ListboxOption key={h.id} value={h.id} className={cn(menuItem, "flex-col items-start gap-0")}>
                      <span className="w-full truncate">{h.title}</span>
                      <span className="text-[11px] text-[var(--text-4)]">{shortDay(h.updatedAt)}</span>
                    </ListboxOption>
                  ))}
                </ListboxOptions>
              </Listbox>
            ) : null}
            {inChat ? (
              <button type="button" onClick={reset} title="Back to the brief" aria-label="New chat" className={iconButton}>
                <PencilSquareIcon className="h-[18px] w-[18px]" />
              </button>
            ) : null}
            <button type="button" onClick={() => setOpen(false)} title="Close" aria-label="Close" className={iconButton}>
              <XMarkIcon className="h-[18px] w-[18px]" />
            </button>
          </div>

          {/* The client switcher, only when there's more than one client to switch between.
              Foundry's own dropdown, not a native <select>: macOS opens a native menu with the
              chosen row over the box, so a long list ran off the top of the window. */}
          {manyClients && clientSlug ? (
            <Listbox value={clientSlug} disabled={busy} onChange={chooseClient}>
              <ListboxButton
                aria-label={`Client: ${clientName ?? "none picked"}`}
                className="mt-3 flex w-full items-center gap-2.5 rounded-[8px] border border-[var(--border-1)] bg-[var(--surface-0)] py-1.5 pl-1.5 pr-2.5 text-left transition hover:bg-[var(--surface-1)] disabled:opacity-60"
              >
                <ClientMark name={clientName} />
                <span className={cn("min-w-0 flex-1 truncate text-[16px] font-medium sm:text-sm", clientName ? "text-[var(--text-1)]" : "text-[var(--text-4)]")}>
                  {clientName ?? "Pick a client"}
                </span>
                <ChevronUpDownIcon className="h-4 w-4 shrink-0 text-[var(--text-4)]" aria-hidden />
              </ListboxButton>
              <ListboxOptions
                anchor={{ to: "bottom start", gap: 4 }}
                className={cn(menuPanel, "z-[70] max-h-[min(60vh,360px)] w-[var(--button-width)] overflow-y-auto")}
              >
                {clientOptions.map((c) => (
                  <ListboxOption key={c.id} value={c.slug} className={cn(menuItem, "gap-2.5 data-[selected]:font-medium data-[selected]:text-[var(--text-1)]")}>
                    {({ selected }) => (
                      <>
                        <ClientMark name={c.name} small />
                        <span className="min-w-0 flex-1 truncate">{c.name}</span>
                        {selected ? <CheckIcon className="h-4 w-4 shrink-0 text-[var(--brand-700)]" aria-hidden /> : null}
                      </>
                    )}
                  </ListboxOption>
                ))}
              </ListboxOptions>
            </Listbox>
          ) : null}
        </header>

        {/* Body */}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          {available === false ? (
            <p className="px-5 py-6 text-sm text-[var(--text-3)]">Dispatch isn&apos;t switched on for your account yet.</p>
          ) : clients.data && clientOptions.length === 0 ? (
            <p className="px-5 py-6 text-sm text-[var(--text-3)]">You&apos;re not on any clients yet. Once you are, Dispatch can brief you on them.</p>
          ) : !clientSlug ? (
            <ClientChooser clients={clientOptions} onPick={chooseClient} firstName={firstName} />
          ) : !inChat ? (
            <BriefView
              brief={brief.data}
              loading={brief.isLoading}
              error={brief.error ? (brief.error as Error).message : null}
              firstName={firstName}
              focusTaskId={focusTaskId}
              clientSlug={clientSlug}
              onAsk={(prompt, taskId) => void ask(prompt, { taskId })}
              onPick={pick}
              onClearFocus={() => setFocusTaskId(null)}
            />
          ) : (
            <div className="space-y-5 px-4 py-4">
              {items.map((it) => (
                <ChatItem key={it.key} item={it} onDecide={decide} />
              ))}
              {sources.length > 0 && !busy ? <SourceChips sources={sources} /> : null}
            </div>
          )}
        </div>

        {/* Composer */}
        {available !== false && clientSlug ? (
          <form
            className="shrink-0 px-3 pb-3 pt-2"
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
                    <img src={p.url} alt={`Attached picture ${i + 1}`} className="h-14 w-14 rounded-[8px] border border-[var(--border-2)] object-cover" />
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
            {pictureError ? <p className="mb-2 text-xs text-[var(--warning-500)]">{pictureError}</p> : null}
            <div className="rounded-[12px] border border-[var(--border-1)] bg-[var(--surface-0)] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition focus-within:border-[var(--brand-400)] focus-within:shadow-[0_0_0_3px_var(--brand-100)]">
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
              <textarea
                ref={inputRef}
                value={draft}
                rows={1}
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
                placeholder={inChat ? "Ask a follow-up…" : `Ask anything about ${clientName ?? "this client"}…`}
                aria-label="Your question for Dispatch"
                className="block max-h-[168px] min-h-[48px] w-full resize-none bg-transparent px-3.5 pb-1 pt-3 text-[16px] leading-6 text-[var(--text-1)] placeholder:text-[var(--text-4)] sm:text-sm"
                style={{ outline: "none" }}
              />
              <div className="flex items-center gap-2 px-2 pb-2">
                <button
                  type="button"
                  title="Attach screenshots (or paste them)"
                  disabled={busy || pictures.length >= MAX_ATTACHMENTS}
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-[6px] px-2 py-1.5 text-xs text-[var(--text-3)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)] disabled:opacity-40"
                >
                  <PaperClipIcon className="h-4 w-4" aria-hidden />
                  Screenshot
                </button>
                <span className="ml-auto hidden text-[11px] text-[var(--text-4)] sm:inline" style={MONO}>
                  ↵ send · ⇧↵ new line
                </span>
                <button
                  type="submit"
                  aria-label="Send"
                  disabled={!draft.trim() || busy}
                  className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[var(--brand-700)] text-white transition hover:bg-[var(--brand-800)] disabled:bg-[var(--surface-2)] disabled:text-[var(--text-4)] sm:ml-0"
                >
                  {busy ? <Spinner size="sm" /> : <ArrowUpIcon className="h-4 w-4" strokeWidth={2.2} />}
                </button>
              </div>
            </div>
            <p className="mt-2 text-center text-[11px] text-[var(--text-4)]">Sees only what you can see. Nothing changes without your click.</p>
          </form>
        ) : null}
      </div>
    </div>
  );
}

const iconButton =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-[var(--text-3)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]";

function ClientMark({ name, small = false }: { name?: string; small?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-[6px] bg-[var(--brand-50)] font-semibold text-[var(--brand-700)]",
        small ? "h-5 w-5 text-[10px]" : "h-7 w-7 text-xs",
      )}
    >
      {(name ?? "?").trim().charAt(0).toUpperCase()}
    </span>
  );
}

function SectionLabel({ n, children, aside }: { n: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline gap-2">
      <h3 className="text-[10.5px] font-medium uppercase tracking-[0.8px] text-[var(--text-4)]" style={MONO}>
        {`${n} // `}{children}
      </h3>
      {aside ? <span className="ml-auto text-[11px] text-[var(--text-4)]">{aside}</span> : null}
    </div>
  );
}

function ClientChooser({
  clients,
  onPick,
  firstName,
}: {
  clients: { id: string; slug: string; name: string }[];
  onPick: (slug: string) => void;
  firstName: string | null;
}) {
  return (
    <div className="px-5 py-5">
      <p className="text-[19px] font-semibold tracking-[-0.2px] text-[var(--text-1)]">
        {greeting(new Date())}
        {firstName ? `, ${firstName}` : ""}.
      </p>
      <p className="mt-1 text-sm text-[var(--text-3)]">Which client are we looking at?</p>
      <ul className="mt-4 divide-y divide-[var(--border-2)] overflow-hidden rounded-[10px] border border-[var(--border-2)]">
        {clients.map((c) => (
          <li key={c.id}>
            <button type="button" onClick={() => onPick(c.slug)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition hover:bg-[var(--surface-1)]">
              <ClientMark name={c.name} />
              <span className="min-w-0 flex-1 truncate font-medium text-[var(--text-1)]">{c.name}</span>
              <ArrowRightIcon className="h-4 w-4 text-[var(--text-4)]" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BriefView({
  brief,
  loading,
  error,
  firstName,
  focusTaskId,
  clientSlug,
  onAsk,
  onPick,
  onClearFocus,
}: {
  brief: DispatchBrief | undefined;
  loading: boolean;
  error: string | null;
  firstName: string | null;
  focusTaskId: string | null;
  clientSlug: string;
  onAsk: (prompt: string, taskId?: string) => void;
  onPick: (s: { prompt: string; needsInput?: boolean }) => void;
  onClearFocus: () => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const now = new Date();
  const skills = skillsFor(focusTaskId ? "task" : "client");
  const suggested = new Set(brief?.suggestions.map((s) => s.id) ?? []);
  const groups = (["plan", "write", "check"] as SkillGroup[])
    .map((g) => ({ g, list: skills.filter((s) => s.group === g && !suggested.has(s.id)) }))
    .filter((x) => x.list.length);

  if (error) {
    return <p className="mx-4 my-5 rounded-[8px] border border-[var(--warning-50)] bg-[var(--warning-50)] px-3 py-2 text-xs text-[var(--warning-500)]">{error}</p>;
  }

  return (
    <div className="space-y-6 px-4 pb-6 pt-5">
      {/* Greeting */}
      <div className="px-1">
        <p className="text-[11px] uppercase tracking-[0.8px] text-[var(--text-4)]" style={MONO}>
          {shortDay(now)}
          {brief ? ` · ${brief.client.name}` : ""}
        </p>
        <p className="mt-1 text-[19px] font-semibold tracking-[-0.2px] text-[var(--text-1)]">
          {greeting(now)}
          {firstName ? `, ${firstName}` : ""}.
        </p>
        {brief ? <p className="mt-0.5 text-sm text-[var(--text-3)]">{brief.week}.</p> : <Skeleton className="mt-1.5 h-4 w-48" />}
      </div>

      {/* The task Dispatch was opened from */}
      {brief?.focus ? (
        <div className="relative overflow-hidden rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] py-3 pl-4 pr-3">
          <span aria-hidden className={cn("absolute inset-y-0 left-0 w-[3px]", TONE_BAR[brief.focus.tone])} />
          <div className="flex items-start gap-2">
            <p className="text-[10.5px] font-medium uppercase tracking-[0.8px] text-[var(--text-4)]" style={MONO}>
              This task
            </p>
            <button type="button" onClick={onClearFocus} aria-label="Not about this task" title="Brief me on the whole client" className="-mr-1 -mt-1 ml-auto rounded-[6px] p-1 text-[var(--text-4)] hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]">
              <XMarkIcon className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="mt-0.5 text-sm font-medium text-[var(--text-1)]">{brief.focus.title}</p>
          <p className="mt-1 text-xs text-[var(--text-3)]">{brief.focus.facts.join(" · ")}</p>
        </div>
      ) : null}

      {/* The numbers */}
      {loading || !brief ? (
        <Skeleton className="h-[72px] w-full rounded-[10px]" />
      ) : (
        <div className={cn("grid overflow-hidden rounded-[10px] border border-[var(--border-2)]", brief.stats.length === 4 ? "grid-cols-4" : "grid-cols-3")}>
          {brief.stats.map((s, i) => (
            <button
              key={s.key}
              type="button"
              onClick={() => onAsk(s.prompt)}
              title={s.prompt}
              className={cn("min-w-0 px-3 py-2.5 text-left transition hover:bg-[var(--surface-1)]", i > 0 && "border-l border-[var(--border-2)]")}
            >
              <span className={cn("block truncate text-[20px] font-semibold leading-7 tabular-nums", s.tone === "neutral" ? "text-[var(--text-1)]" : TONE_TEXT[s.tone])} style={MONO}>
                {s.value}
              </span>
              <span className="block truncate text-[11px] text-[var(--text-3)]">{s.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* 01 Needs you */}
      <section>
        <SectionLabel n="01" aside={brief && brief.needsYou.length ? `${brief.needsYou.length} of yours` : undefined}>
          Needs you
        </SectionLabel>
        {loading || !brief ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : brief.needsYou.length ? (
          <ul className="divide-y divide-[var(--border-2)] overflow-hidden rounded-[10px] border border-[var(--border-2)]">
            {brief.needsYou.map((t) => (
              <li key={t.id} className="group flex items-center">
                <button
                  type="button"
                  onClick={() => onAsk(`Tell me about “${t.title}”: where it's up to, what's left, and the next step.`, t.id)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 text-left transition hover:bg-[var(--surface-1)]"
                  title="Ask Dispatch about this task"
                >
                  <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", TONE_BAR[t.tone])} />
                  <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-1)]">{t.title}</span>
                  <span className={cn("shrink-0 rounded-[4px] px-1.5 py-0.5 text-[11px] font-medium", TONE_PILL[t.tone])}>{t.reason}</span>
                </button>
                <Link
                  href={`/app/portal/${clientSlug}/tasks?task=${t.id}`}
                  aria-label={`Open “${t.title}” on the board`}
                  title="Open on the board"
                  className="flex h-10 w-9 shrink-0 items-center justify-center text-[var(--text-4)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
                >
                  <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                </Link>
              </li>
            ))}
          </ul>
        ) : brief.nothingMine ? (
          <div className="rounded-[10px] border border-dashed border-[var(--border-1)] px-3.5 py-3 text-sm text-[var(--text-2)]">
            <p>{brief.nothingMine}</p>
            {brief.team?.length ? (
              <ul className="mt-2 space-y-1">
                {brief.team.map((p) => (
                  <li key={p.name} className="flex items-center gap-2 text-xs text-[var(--text-3)]">
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <span className="tabular-nums text-[var(--text-2)]" style={MONO}>
                      {p.count}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {brief.unassigned ? (
              <p className="mt-2 text-xs text-[var(--text-3)]">
                {brief.unassigned === 1 ? "1 open task has" : `${brief.unassigned} open tasks have`} nobody on {brief.unassigned === 1 ? "it" : "them"}.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="flex items-center gap-2 rounded-[10px] border border-[var(--border-2)] px-3.5 py-3 text-sm text-[var(--text-2)]">
            <CheckCircleIcon className="h-4 w-4 shrink-0 text-[var(--success-500)]" aria-hidden />
            Nothing urgent. Your work here is on track.
          </p>
        )}
      </section>

      {/* 02 Suggested, each with the reason it's suggested now */}
      <section>
        <SectionLabel n="02">Suggested</SectionLabel>
        {loading || !brief ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : (
          <div className="space-y-2">
            {brief.suggestions.map((s) => (
              <SuggestionCard key={s.id} s={s} onPick={onPick} />
            ))}
          </div>
        )}
      </section>

      {/* 03 Everything else Dispatch can do here, grouped */}
      <section>
        <button type="button" onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen} className="flex w-full items-center gap-2 text-left">
          <span className="text-[10.5px] font-medium uppercase tracking-[0.8px] text-[var(--text-4)]" style={MONO}>
            {"03 // More it can do"}
          </span>
          <ChevronDownIcon className={cn("ml-auto h-3.5 w-3.5 text-[var(--text-4)] transition", moreOpen && "rotate-180")} aria-hidden />
        </button>
        {moreOpen ? (
          <div className="mt-3 space-y-3">
            {groups.map(({ g, list }) => (
              <div key={g}>
                <p className="mb-1.5 text-[11px] font-medium text-[var(--text-3)]">{SKILL_GROUP_LABELS[g]}</p>
                <div className="flex flex-wrap gap-1.5">
                  {list.map((s: DispatchSkill) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onPick(s)}
                      className="rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] px-2.5 py-1.5 text-left text-xs font-medium text-[var(--text-2)] transition hover:border-[var(--brand-300)] hover:bg-[var(--surface-1)]"
                    >
                      {s.label}
                      {s.needsInput ? <span className="text-[var(--text-4)]"> …</span> : null}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function SuggestionCard({ s, onPick }: { s: BriefSuggestion; onPick: (s: { prompt: string; needsInput?: boolean }) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(s)}
      className="group flex w-full items-center gap-3 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3 py-2.5 text-left transition hover:border-[var(--brand-300)] hover:bg-[var(--brand-50)]"
    >
      <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[var(--brand-50)] text-[var(--brand-700)] transition group-hover:bg-[var(--surface-0)]">
        <SparklesIcon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-[var(--text-1)]">{s.title}</span>
        <span className="block truncate text-xs text-[var(--text-3)]">{s.reason}</span>
      </span>
      <ArrowRightIcon className="h-4 w-4 shrink-0 text-[var(--text-4)] transition group-hover:translate-x-0.5 group-hover:text-[var(--brand-700)]" aria-hidden />
    </button>
  );
}

function SourceChips({ sources }: { sources: Source[] }) {
  return (
    <div className="border-t border-[var(--border-2)] pt-3">
      <p className="mb-1.5 text-[10.5px] font-medium uppercase tracking-[0.8px] text-[var(--text-4)]" style={MONO}>
        Sources
      </p>
      <div className="flex flex-wrap gap-1.5">
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
    </div>
  );
}

/** What Dispatch looked at: live while it works, folded into one line when it's done. */
function StepTrail({ steps, working }: { steps: string[]; working: boolean }) {
  const [open, setOpen] = useState(false);
  if (!steps.length) {
    return working ? (
      <p role="status" className="flex items-center gap-2 text-xs text-[var(--text-3)]">
        <Spinner size="sm" tone="brand" />
        Thinking…
      </p>
    ) : null;
  }
  if (working || open) {
    return (
      <ol role={working ? "status" : undefined} className="space-y-1">
        {steps.map((s, i) => {
          const live = working && i === steps.length - 1;
          return (
            <li key={`${i}-${s}`} className={cn("flex items-center gap-2 text-xs", live ? "text-[var(--text-2)]" : "text-[var(--text-4)]")}>
              {live ? <Spinner size="sm" tone="brand" /> : <CheckIcon className="h-3.5 w-3.5 text-[var(--success-500)]" aria-hidden />}
              {s}
              {live ? "…" : ""}
            </li>
          );
        })}
      </ol>
    );
  }
  return (
    <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1.5 text-xs text-[var(--text-4)] transition hover:text-[var(--text-2)]">
      <CheckIcon className="h-3.5 w-3.5 text-[var(--success-500)]" aria-hidden />
      Looked at {steps.length} {steps.length === 1 ? "thing" : "things"}
      <ChevronDownIcon className="h-3 w-3" aria-hidden />
    </button>
  );
}

function ChatItem({ item, onDecide }: { item: Item; onDecide: (id: string, d: "confirm" | "cancel") => void }) {
  const [copied, setCopied] = useState(false);
  if (item.type === "question") {
    return (
      <div className="ml-auto w-fit max-w-[85%] rounded-[12px] rounded-br-[4px] bg-[var(--surface-1)] px-3.5 py-2 text-sm whitespace-pre-wrap text-[var(--text-1)]">
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
    return <p className="rounded-[8px] bg-[var(--warning-50)] px-3 py-2 text-xs text-[var(--warning-500)]">{item.text}</p>;
  }
  if (item.type === "answer") {
    return (
      <div className="group space-y-2">
        <StepTrail steps={item.steps} working={item.working && !item.text} />
        {item.text ? (
          <div className="text-sm leading-6 text-[var(--text-1)]">
            <Markdown compact className="space-y-2">
              {item.text}
            </Markdown>
          </div>
        ) : null}
        {item.text.length > 40 && !item.working ? (
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(item.text).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              });
            }}
            className="inline-flex items-center gap-1 rounded-[6px] px-1.5 py-1 text-[11px] text-[var(--text-4)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-2)]"
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
      <SparklesIcon aria-hidden className="h-4 w-4" />
      <span className="hidden xl:inline">Dispatch</span>
    </button>
  );
}
