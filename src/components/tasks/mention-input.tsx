"use client";

// A textarea with @mention autocomplete. Typing "@" opens a member picker; selecting one
// inserts a `@[Name](id)` token (see src/lib/mentions.ts). Dependency-free — no editor lib.
//
// Companion <MentionText> renders stored bodies, turning tokens into highlighted chips.

import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/format";
import { mentionToken, parseMentions } from "@/lib/mentions";

export type MentionCandidate = { id: string; name: string; email: string };

/** Find the active "@query" immediately before the caret (no whitespace in the query). */
function activeMention(value: string, caret: number): { start: number; query: string } | null {
  let i = caret - 1;
  while (i >= 0) {
    const ch = value[i];
    if (ch === "@") {
      const before = i === 0 ? "" : value[i - 1];
      // Only trigger at a word boundary so emails / mid-word @ don't open the picker.
      if (before === "" || /\s/.test(before)) {
        return { start: i, query: value.slice(i + 1, caret) };
      }
      return null;
    }
    if (/\s/.test(ch)) return null; // hit whitespace before an "@" → not in a mention
    i -= 1;
  }
  return null;
}

export function MentionInput({
  value,
  onChange,
  candidates,
  placeholder,
  rows = 2,
  disabled,
  onSubmit,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  candidates: MentionCandidate[];
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  /** Fired on ⌘/Ctrl+Enter when the picker is closed. */
  onSubmit?: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [active, setActive] = useState(0);

  const matches = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    return candidates
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
      .slice(0, 6);
  }, [candidates, mention]);

  const open = mention !== null && matches.length > 0;

  function sync() {
    const el = ref.current;
    if (!el) return;
    const found = activeMention(el.value, el.selectionStart ?? el.value.length);
    setMention(found);
    setActive(0);
  }

  function pick(candidate: MentionCandidate) {
    const el = ref.current;
    if (!el || !mention) return;
    const caret = el.selectionStart ?? value.length;
    const token = mentionToken(candidate.name, candidate.id);
    const next = `${value.slice(0, mention.start)}${token} ${value.slice(caret)}`;
    onChange(next);
    setMention(null);
    // Restore the caret just past the inserted token on the next tick.
    const pos = mention.start + token.length + 1;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (open) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => (i + 1) % matches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (i - 1 + matches.length) % matches.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pick(matches[active]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMention(null);
        return;
      }
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      onSubmit?.();
    }
  }

  return (
    <div className="relative flex-1">
      <textarea
        ref={ref}
        className={cn("app-textarea w-full", className)}
        rows={rows}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          sync();
        }}
        onKeyUp={sync}
        onClick={sync}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setMention(null), 120)}
      />
      {open ? (
        <ul
          role="listbox"
          className="absolute bottom-full left-0 z-20 mb-1 max-h-56 w-64 overflow-auto rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-0)] py-1 shadow-[var(--shadow-lg)]"
        >
          {matches.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                // Use onMouseDown so the pick fires before the textarea's onBlur closes the list.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(c);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left transition",
                  i === active ? "bg-[var(--surface-brand)]" : "hover:bg-[var(--surface-1)]",
                )}
              >
                <span className="text-sm font-medium text-[var(--text-1)]">{c.name}</span>
                <span className="text-[11px] text-[var(--text-4)]">{c.email}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Render a stored note body, styling `@[Name](id)` tokens as chips. Highlights the
 *  current user's own mentions. */
export function MentionText({ body, selfId }: { body: string; selfId?: string | null }) {
  const segments = parseMentions(body);
  return (
    <>
      {segments.map((seg, i) =>
        seg.type === "text" ? (
          <span key={i}>{seg.value}</span>
        ) : (
          <span
            key={i}
            className={cn(
              "rounded-[4px] px-1 py-px text-[13px] font-medium",
              seg.id === selfId
                ? "bg-[var(--brand-600)] text-white"
                : "bg-[var(--surface-brand)] text-[var(--brand-700)]",
            )}
          >
            @{seg.name}
          </span>
        ),
      )}
    </>
  );
}
