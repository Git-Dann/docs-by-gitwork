"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckIcon } from "@heroicons/react/24/outline";
import type { WikiSection } from "./wiki-sidebar";

// ─── Section hints ────────────────────────────────────────────────────────────

const SECTION_HINTS: Partial<Record<WikiSection, string>> = {
  ia: "Document the product's information hierarchy — navigation, content taxonomy, URL patterns, and key user flows.",
  "dev-guide": "Capture everything a developer needs: setup, architecture, env vars, API endpoints, and deployment steps.",
};

// ─── Markdown renderer ────────────────────────────────────────────────────────

function renderMarkdown(md: string): string {
  if (!md.trim()) return "<p class='text-[var(--text-4)] italic'>Nothing to preview yet.</p>";

  const lines = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .split("\n");

  const out: string[] = [];
  let inUl = false;
  let inOl = false;
  let inCode = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // fenced code block
    if (line.trim().startsWith("```")) {
      if (!inCode) {
        out.push('<pre class="overflow-x-auto rounded-[6px] bg-[var(--surface-1)] p-3 text-[12.5px] font-mono my-3"><code>');
        inCode = true;
      } else {
        out.push("</code></pre>");
        inCode = false;
      }
      continue;
    }
    if (inCode) {
      out.push(line + "\n");
      continue;
    }

    // close open lists if line doesn't match
    const isBullet = /^(\s*[-*])\s/.test(line);
    const isOrdered = /^\d+\.\s/.test(line);
    if (!isBullet && inUl) { out.push("</ul>"); inUl = false; }
    if (!isOrdered && inOl) { out.push("</ol>"); inOl = false; }

    // headings
    if (/^### /.test(line)) {
      out.push(`<h3 class="mt-5 mb-1.5 text-[15px] font-semibold text-[var(--text-1)]">${inlineFormat(line.slice(4))}</h3>`);
    } else if (/^## /.test(line)) {
      out.push(`<h2 class="mt-6 mb-2 text-[17px] font-semibold text-[var(--text-1)] border-b border-[rgba(0,0,0,0.07)] pb-1.5">${inlineFormat(line.slice(3))}</h2>`);
    } else if (/^# /.test(line)) {
      out.push(`<h1 class="mt-4 mb-3 text-[20px] font-bold text-[var(--text-1)]">${inlineFormat(line.slice(2))}</h1>`);
    } else if (/^---$/.test(line.trim())) {
      out.push('<hr class="my-5 border-[rgba(0,0,0,0.09)]" />');
    } else if (isBullet) {
      if (!inUl) { out.push('<ul class="my-2 ml-4 list-disc space-y-1 text-sm text-[var(--text-2)]">'); inUl = true; }
      out.push(`<li>${inlineFormat(line.replace(/^\s*[-*]\s/, ""))}</li>`);
    } else if (isOrdered) {
      if (!inOl) { out.push('<ol class="my-2 ml-4 list-decimal space-y-1 text-sm text-[var(--text-2)]">'); inOl = true; }
      out.push(`<li>${inlineFormat(line.replace(/^\d+\.\s/, ""))}</li>`);
    } else if (/^\|.+\|$/.test(line)) {
      // table row — simple pass-through
      if (i === 0 || !/^\|.+\|$/.test(lines[i - 1])) {
        out.push('<div class="overflow-x-auto my-4"><table class="min-w-full text-sm border-collapse border border-[rgba(0,0,0,0.1)] rounded-[6px]">');
      }
      const cells = line.split("|").slice(1, -1).map((c) => c.trim());
      const isHeader = lines[i + 1]?.trim().startsWith("|---") || lines[i + 1]?.trim().startsWith("| ---");
      const isSep = /^\|\s*[-:]+\s*(\|\s*[-:]+\s*)+\|$/.test(line.trim());
      if (isSep) {
        // skip separator rows
      } else if (isHeader) {
        out.push(`<thead><tr>${cells.map((c) => `<th class="border border-[rgba(0,0,0,0.08)] px-3 py-2 text-left font-semibold text-[var(--text-1)] bg-[var(--surface-0)]">${inlineFormat(c)}</th>`).join("")}</tr></thead><tbody>`);
      } else {
        out.push(`<tr>${cells.map((c) => `<td class="border border-[rgba(0,0,0,0.08)] px-3 py-2 text-[var(--text-2)]">${inlineFormat(c)}</td>`).join("")}</tr>`);
        // close table if next isn't a table row
        if (!/^\|.+\|$/.test(lines[i + 1] ?? "")) {
          out.push("</tbody></table></div>");
        }
      }
    } else if (line.trim() === "") {
      out.push("");
    } else {
      out.push(`<p class="my-1.5 text-sm leading-6 text-[var(--text-2)]">${inlineFormat(line)}</p>`);
    }
  }

  if (inUl) out.push("</ul>");
  if (inOl) out.push("</ol>");
  if (inCode) out.push("</code></pre>");

  return out.join("\n");
}

function inlineFormat(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, '<code class="rounded bg-[var(--surface-1)] px-1 py-px text-[12px] font-mono text-[var(--brand-700)]">$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noreferrer" class="text-[var(--brand-700)] underline hover:no-underline">$1</a>');
}

// ─── Word count ───────────────────────────────────────────────────────────────

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

// ─── Toolbar button ───────────────────────────────────────────────────────────

function ToolbarBtn({
  label,
  title,
  onClick,
  mono = true,
}: {
  label: string;
  title: string;
  onClick: () => void;
  mono?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex h-6 min-w-[24px] items-center justify-center rounded px-1.5 text-[11px] text-[var(--text-3)] hover:bg-[var(--surface-1)] hover:text-[var(--text-1)] transition select-none"
      style={mono ? { fontFamily: "var(--font-mono)" } : undefined}
    >
      {label}
    </button>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  section: WikiSection;
  title: string;
  content: string;
  isNew: boolean;
  onSave: (title: string, content: string) => Promise<void>;
  isSaving: boolean;
  readOnly?: boolean;
}

export function WikiPageEditor({
  section,
  title,
  content: initialContent,
  isNew,
  onSave,
  isSaving,
  readOnly = false,
}: Props) {
  const [editTitle, setEditTitle] = useState(title);
  const [editContent, setEditContent] = useState(initialContent);
  const [mode, setMode] = useState<"edit" | "preview">(readOnly ? "preview" : "edit");
  const [savedLabel, setSavedLabel] = useState<"" | "Saved" | "Auto-saved">("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef({ title, content: initialContent });

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta && mode === "edit") {
      ta.style.height = "auto";
      ta.style.height = `${Math.max(ta.scrollHeight, 420)}px`;
    }
  }, [editContent, mode]);

  // Auto-save: trigger 2.5s after last change, only if content differs from last save
  const scheduleAutoSave = useCallback(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      if (
        editTitle !== lastSaved.current.title ||
        editContent !== lastSaved.current.content
      ) {
        await onSave(editTitle, editContent);
        lastSaved.current = { title: editTitle, content: editContent };
        setSavedLabel("Auto-saved");
        setTimeout(() => setSavedLabel(""), 2000);
      }
    }, 2500);
  }, [editTitle, editContent, onSave]);

  // Clear timer on unmount
  useEffect(() => () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); }, []);

  // Explicit save
  async function handleSave() {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    await onSave(editTitle, editContent);
    lastSaved.current = { title: editTitle, content: editContent };
    setSavedLabel("Saved");
    setTimeout(() => setSavedLabel(""), 2000);
  }

  // Insert markdown snippet at cursor
  const insert = useCallback(
    (before: string, after = "", placeholder = "") => {
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const selected = ta.value.slice(start, end) || placeholder;
      const newVal =
        ta.value.slice(0, start) + before + selected + after + ta.value.slice(end);
      setEditContent(newVal);
      // restore cursor after state update
      requestAnimationFrame(() => {
        ta.focus();
        const cur = start + before.length + selected.length;
        ta.setSelectionRange(cur, cur);
      });
      scheduleAutoSave();
    },
    [scheduleAutoSave],
  );

  if (readOnly) {
    return (
      <div className="max-w-3xl">
        <h2 className="mb-4 text-xl font-semibold text-[var(--text-1)]">{title}</h2>
        <div
          className="prose-custom"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(initialContent) }}
        />
      </div>
    );
  }

  const hint = SECTION_HINTS[section];
  const words = wordCount(editContent);
  const chars = editContent.length;

  return (
    <div className="max-w-3xl">
      {/* Section hint */}
      {hint && isNew && (
        <div className="mb-4 rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-[var(--surface-0)] px-4 py-3">
          <p className="text-sm text-[var(--text-3)]">{hint}</p>
        </div>
      )}

      {/* Title */}
      <input
        type="text"
        value={editTitle}
        onChange={(e) => { setEditTitle(e.target.value); scheduleAutoSave(); }}
        className="mb-4 w-full rounded-[6px] border border-[rgba(0,0,0,0.1)] bg-transparent px-3 py-2 text-lg font-semibold text-[var(--text-1)] outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-500)]/20"
        placeholder="Section title"
      />

      {/* Toolbar + Edit/Preview tabs */}
      <div className="mb-2 flex items-center gap-2">
        {/* Edit/Preview pill */}
        <div className="flex rounded-[6px] border border-[rgba(0,0,0,0.1)] p-0.5">
          <button
            type="button"
            onClick={() => setMode("edit")}
            className={[
              "rounded-[4px] px-3 py-1 text-xs font-medium transition",
              mode === "edit" ? "bg-[var(--text-1)] text-white" : "text-[var(--text-3)] hover:text-[var(--text-1)]",
            ].join(" ")}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => setMode("preview")}
            className={[
              "rounded-[4px] px-3 py-1 text-xs font-medium transition",
              mode === "preview" ? "bg-[var(--text-1)] text-white" : "text-[var(--text-3)] hover:text-[var(--text-1)]",
            ].join(" ")}
          >
            Preview
          </button>
        </div>

        {/* Markdown toolbar — only in edit mode */}
        {mode === "edit" && (
          <div className="flex items-center gap-0.5 rounded-[6px] border border-[rgba(0,0,0,0.09)] bg-[var(--surface-0)] px-1 py-0.5">
            <ToolbarBtn label="B" title="Bold (wrap in **)" onClick={() => insert("**", "**", "bold text")} />
            <ToolbarBtn label="I" title="Italic (wrap in *)" onClick={() => insert("*", "*", "italic text")} />
            <div className="mx-0.5 h-4 w-px bg-[rgba(0,0,0,0.1)]" />
            <ToolbarBtn label="H2" title="Heading 2" onClick={() => insert("## ", "", "Heading")} />
            <ToolbarBtn label="H3" title="Heading 3" onClick={() => insert("### ", "", "Heading")} />
            <div className="mx-0.5 h-4 w-px bg-[rgba(0,0,0,0.1)]" />
            <ToolbarBtn label="`c`" title="Inline code" onClick={() => insert("`", "`", "code")} />
            <ToolbarBtn label="```" title="Code block" onClick={() => insert("```\n", "\n```", "code here")} />
            <div className="mx-0.5 h-4 w-px bg-[rgba(0,0,0,0.1)]" />
            <ToolbarBtn label="•" title="Bullet list" onClick={() => insert("- ", "", "item")} mono={false} />
            <ToolbarBtn label="1." title="Numbered list" onClick={() => insert("1. ", "", "item")} />
            <div className="mx-0.5 h-4 w-px bg-[rgba(0,0,0,0.1)]" />
            <ToolbarBtn label="—" title="Divider" onClick={() => insert("\n---\n")} mono={false} />
            <ToolbarBtn label="🔗" title="Link" onClick={() => insert("[", "](https://)", "link text")} mono={false} />
          </div>
        )}
      </div>

      {/* Editor / Preview pane */}
      {mode === "edit" ? (
        <textarea
          ref={textareaRef}
          value={editContent}
          onChange={(e) => { setEditContent(e.target.value); scheduleAutoSave(); }}
          onBlur={() => scheduleAutoSave()}
          className="w-full resize-none rounded-[6px] border border-[rgba(0,0,0,0.1)] bg-[var(--surface-0)] p-4 text-sm leading-6 text-[var(--text-1)] outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-500)]/20"
          style={{ fontFamily: "var(--font-mono)", fontSize: "12.5px", minHeight: "420px" }}
          placeholder="Start writing… Markdown is supported."
          spellCheck={false}
        />
      ) : (
        <div
          className="min-h-[420px] rounded-[6px] border border-[rgba(0,0,0,0.1)] bg-white p-6"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(editContent) }}
        />
      )}

      {/* Status bar */}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={isSaving}
          className="flex items-center gap-1.5 rounded-[6px] bg-[var(--brand-700)] px-4 py-1.5 text-sm font-medium text-white hover:bg-[var(--brand-800)] disabled:opacity-60 transition"
        >
          {isSaving ? "Saving…" : "Save"}
        </button>

        {savedLabel && (
          <span className="flex items-center gap-1 text-xs text-emerald-600">
            <CheckIcon className="h-3.5 w-3.5" />
            {savedLabel}
          </span>
        )}

        <span className="ml-auto text-[11px] text-[var(--text-4)]" style={{ fontFamily: "var(--font-mono)" }}>
          {words} words · {chars} chars
        </span>
      </div>
    </div>
  );
}
