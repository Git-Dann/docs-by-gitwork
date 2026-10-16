"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { AtSymbolIcon } from "@heroicons/react/24/outline";
import type { MentionPerson, WikiIntakeCommentRecord, WikiMentionables } from "@/lib/api";
import {
  activeMentionQuery,
  insertMention,
  matchMentionables,
  mentionsInBody,
  splitMentions,
} from "@/lib/wiki-mentions";

const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";

function initials(name: string): string {
  const parts = name.replace(/@.*$/, "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** "2h ago" for today, a date after that — a thread reads in sequence, so the
 *  relative time is what matters while it's live and the date once it isn't. */
export function formatCommentTime(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  const mins = Math.round((now - t) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function Avatar({ name, kind }: { name: string; kind: "TEAM" | "CLIENT" }) {
  return (
    <span
      aria-hidden
      className={[
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
        kind === "TEAM"
          ? "bg-[var(--surface-brand)] text-[var(--brand-700)]"
          : "bg-[var(--surface-2)] text-[var(--text-2)]",
      ].join(" ")}
      style={{ fontFamily: MONO }}
    >
      {initials(name)}
    </span>
  );
}

function KindTag({ kind }: { kind: "TEAM" | "CLIENT" }) {
  return (
    <span
      className={[
        "rounded-[4px] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em]",
        kind === "TEAM"
          ? "bg-[var(--surface-brand)] text-[var(--brand-700)]"
          : "bg-[var(--surface-2)] text-[var(--text-3)]",
      ].join(" ")}
      style={{ fontFamily: MONO }}
    >
      {kind === "TEAM" ? "Gitwork" : "Client"}
    </span>
  );
}

function CommentBody({ comment }: { comment: WikiIntakeCommentRecord }) {
  const parts = splitMentions(comment.body, comment.mentions ?? []);
  return (
    <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-[var(--text-2)]">
      {parts.map((p, i) =>
        p.mention ? (
          <span
            key={i}
            className="rounded-[3px] bg-[var(--surface-brand)] px-0.5 font-medium text-[var(--brand-700)]"
          >
            {p.text}
          </span>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </p>
  );
}

/**
 * A request's conversation: the replies as a transcript, and a composer that can
 * @mention people. A mention is posted to the client's shared Slack channel; the
 * composer says so (and says when it won't be), so nobody @s someone believing
 * they've been told when they haven't.
 */
export function RequestThread({
  itemTitle,
  comments,
  mentionables,
  mentionablesLoading,
  onOpen,
  onPost,
}: {
  itemTitle: string;
  comments: WikiIntakeCommentRecord[];
  mentionables: WikiMentionables | undefined;
  mentionablesLoading: boolean;
  /** Called on first focus — the roster is only fetched once someone starts a reply. */
  onOpen: () => void;
  onPost: (body: string, mentionIds: string[]) => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [picked, setPicked] = useState<MentionPerson[]>([]);
  const [caret, setCaret] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  const people = useMemo(() => mentionables?.people ?? [], [mentionables]);
  const query = activeMentionQuery(draft, caret);
  const open = query !== null && dismissedAt !== query.start;
  const suggestions = open ? matchMentionables(people, query.query) : [];
  const active = Math.min(cursor, Math.max(0, suggestions.length - 1));

  function syncCaret() {
    const el = ref.current;
    if (el) setCaret(el.selectionStart ?? el.value.length);
  }

  function choose(person: MentionPerson) {
    if (!query) return;
    const next = insertMention(draft, query.start, caret, person);
    setDraft(next.text);
    setCaret(next.caret);
    setCursor(0);
    setPicked((prev) => (prev.some((p) => p.id === person.id) ? prev : [...prev, person]));
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
    });
  }

  function startMention() {
    const el = ref.current;
    const at = el?.selectionStart ?? draft.length;
    const needsSpace = at > 0 && !/\s/.test(draft[at - 1] ?? "");
    const insert = `${needsSpace ? " " : ""}@`;
    const next = draft.slice(0, at) + insert + draft.slice(at);
    setDraft(next);
    setCaret(at + insert.length);
    setDismissedAt(null);
    onOpen();
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(at + insert.length, at + insert.length);
    });
  }

  async function submit() {
    const body = draft.trim();
    if (!body || posting) return;
    setPosting(true);
    setError(null);
    try {
      await onPost(body, mentionsInBody(body, picked).map((p) => p.id));
      setDraft("");
      setPicked([]);
      setCaret(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post that reply.");
    } finally {
      setPosting(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (open && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((active + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((active - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        choose(suggestions[active]);
        return;
      }
    }
    if (open && e.key === "Escape" && query) {
      e.preventDefault();
      setDismissedAt(query.start);
      return;
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit();
    }
  }

  const slack = mentionables?.slack;
  const willNotify = picked.length > 0 && mentionsInBody(draft, picked).length > 0;

  return (
    <section aria-label={`Conversation on ${itemTitle}`} className="space-y-3">
      <div className="flex items-center gap-2">
        <span
          className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-4)]"
          style={{ fontFamily: MONO }}
        >
          Conversation{comments.length > 0 ? ` · ${comments.length}` : ""}
        </span>
        <span className="h-px flex-1 bg-[var(--border-1)]" />
      </div>

      {comments.length === 0 ? (
        <p className="text-[12px] text-[var(--text-4)]">
          No replies yet. Ask a question, share an update, or @mention someone to pull them in.
        </p>
      ) : (
        <ol className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-2.5">
              <Avatar name={c.authorName} kind={c.authorKind} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  <span className="text-[12px] font-semibold text-[var(--text-1)]">{c.authorName}</span>
                  <KindTag kind={c.authorKind} />
                  <time
                    dateTime={c.createdAt}
                    title={new Date(c.createdAt).toLocaleString()}
                    className="text-[11px] text-[var(--text-4)]"
                    style={{ fontFamily: MONO }}
                  >
                    {formatCommentTime(c.createdAt)}
                  </time>
                </div>
                <CommentBody comment={c} />
              </div>
            </li>
          ))}
        </ol>
      )}

      {/* The composer. The mention list renders IN FLOW below the text, not as an
          absolute popover: this panel sits inside .widget-card, which is
          overflow:hidden, so a floating list on the last row would be clipped. */}
      <div className="rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-0)] transition focus-within:border-[var(--brand-500)] focus-within:shadow-[0_0_0_3px_var(--brand-focus-ring)]">
        <textarea
          ref={ref}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setCaret(e.target.selectionStart ?? e.target.value.length);
            setCursor(0);
          }}
          onKeyDown={onKeyDown}
          onKeyUp={syncCaret}
          onClick={syncCaret}
          onFocus={onOpen}
          placeholder="Write a reply… type @ to mention someone"
          aria-label={`Reply to ${itemTitle}`}
          rows={2}
          className="block w-full resize-y rounded-t-[8px] border-0 bg-transparent px-3 py-2.5 text-[13px] leading-relaxed text-[var(--text-1)] placeholder:text-[var(--text-4)] focus:ring-0"
          // The composer frame carries the focus state (focus-within). The app's global
          // :focus-visible ring is unlayered CSS in layout.tsx, so a Tailwind utility
          // can't remove it — and two concentric blue rings read as two fields.
          style={{ outline: "none" }}
        />

        {open && (
          <div className="border-t border-[var(--border-1)] px-1.5 py-1.5" role="listbox" aria-label="Mention someone">
            {mentionablesLoading && people.length === 0 ? (
              <p className="px-2 py-1.5 text-[12px] text-[var(--text-4)]">Loading people…</p>
            ) : suggestions.length === 0 ? (
              <p className="px-2 py-1.5 text-[12px] text-[var(--text-4)]">
                Nobody matches “{query?.query}”.
              </p>
            ) : (
              suggestions.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => choose(p)}
                  className={[
                    "flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left",
                    i === active ? "bg-[var(--surface-1)]" : "",
                  ].join(" ")}
                >
                  <Avatar name={p.name} kind={p.kind} />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text-1)]" title={p.name}>
                    {p.name}
                  </span>
                  <KindTag kind={p.kind} />
                </button>
              ))
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-1)] px-2 py-1.5">
          <button
            type="button"
            onClick={startMention}
            title="Mention someone"
            aria-label="Mention someone"
            className="rounded-[6px] p-1.5 text-[var(--text-3)] transition hover:bg-[var(--surface-1)] hover:text-[var(--brand-700)]"
          >
            <AtSymbolIcon className="h-4 w-4" />
          </button>
          <span
            className="min-w-0 flex-1 text-[11px] text-[var(--text-4)]"
            style={{ fontFamily: MONO }}
          >
            {slack === undefined
              ? "⌘↵ to send"
              : !slack.connected
                ? "Mentions show here — no shared Slack channel is connected"
                : willNotify
                  ? `Will notify in ${slack.channelName ? `#${slack.channelName}` : "the shared Slack channel"}`
                  : `@mentions post to ${slack.channelName ? `#${slack.channelName}` : "the shared Slack channel"}`}
          </span>
          <button
            type="button"
            disabled={posting || !draft.trim()}
            onClick={() => void submit()}
            className="rounded-[6px] bg-[var(--brand-600)] px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-[var(--brand-700)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {posting ? "Posting…" : "Reply"}
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-[12px] text-rose-600">
          {error}
        </p>
      )}
    </section>
  );
}
