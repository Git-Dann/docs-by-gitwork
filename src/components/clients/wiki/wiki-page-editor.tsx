"use client";

import { useEffect, useRef, useState } from "react";
import { CheckIcon } from "@heroicons/react/24/outline";

interface Props {
  title: string;
  content: string;
  onSave: (title: string, content: string) => Promise<void>;
  isSaving: boolean;
  readOnly?: boolean;
}

/** Simple Markdown renderer — handles headings, bold, lists, code, links. */
function renderMarkdown(md: string): string {
  return md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/^\s*[-*] (.+)$/gm, "<li>$1</li>")
    .replace(/^\s*\d+\. (.+)$/gm, "<li>$1</li>")
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(?!<[hlu])(.+)$/gm, (line) =>
      line.trim() ? `<p>${line}</p>` : "",
    );
}

export function WikiPageEditor({ title, content, onSave, isSaving, readOnly = false }: Props) {
  const [editTitle, setEditTitle] = useState(title);
  const [editContent, setEditContent] = useState(content);
  const [mode, setMode] = useState<"edit" | "preview">(readOnly ? "preview" : "edit");
  const [saved, setSaved] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = `${ta.scrollHeight}px`;
    }
  }, [editContent]);

  async function handleSave() {
    await onSave(editTitle, editContent);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (readOnly) {
    return (
      <div className="max-w-3xl">
        <h2 className="mb-4 text-xl font-semibold text-[var(--text-1)]">{title}</h2>
        <div
          className="prose prose-sm max-w-none text-[var(--text-2)]"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(content || "*No content yet.*") }}
        />
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      {/* Title */}
      <input
        type="text"
        value={editTitle}
        onChange={(e) => setEditTitle(e.target.value)}
        className="mb-4 w-full rounded-[6px] border border-[rgba(0,0,0,0.1)] bg-transparent px-3 py-2 text-lg font-semibold text-[var(--text-1)] outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-500)]/20"
        placeholder="Section title"
      />

      {/* Edit / Preview toggle */}
      <div className="mb-3 flex items-center gap-2">
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
        <span className="text-xs text-[var(--text-4)]">Markdown supported</span>
      </div>

      {mode === "edit" ? (
        <textarea
          ref={textareaRef}
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          className="min-h-[320px] w-full resize-none rounded-[6px] border border-[rgba(0,0,0,0.1)] bg-[var(--surface-0)] p-3 text-sm leading-6 text-[var(--text-1)] outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-500)]/20"
          style={{ fontFamily: "var(--font-mono)", fontSize: "12.5px" }}
          placeholder="Write your content here... Markdown is supported."
        />
      ) : (
        <div
          className="min-h-[320px] rounded-[6px] border border-[rgba(0,0,0,0.1)] bg-[var(--surface-0)] p-4 prose prose-sm max-w-none text-[var(--text-2)]"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(editContent || "*Nothing to preview.*") }}
        />
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={isSaving}
          className="flex items-center gap-1.5 rounded-[6px] bg-[var(--brand-700)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand-800)] disabled:opacity-60 transition"
        >
          {isSaving ? "Saving…" : "Save"}
        </button>
        {saved && (
          <span className="flex items-center gap-1 text-xs text-emerald-600">
            <CheckIcon className="h-3.5 w-3.5" />
            Saved
          </span>
        )}
      </div>
    </div>
  );
}
