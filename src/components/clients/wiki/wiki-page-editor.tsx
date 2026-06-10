"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import type { WikiSection } from "./wiki-sidebar";

// ─── Section hints ────────────────────────────────────────────────────────────

const SECTION_HINTS: Partial<Record<WikiSection, string>> = {
  ia: "Document the product's information hierarchy — navigation, content taxonomy, URL patterns, and key user flows.",
  "dev-guide": "Capture everything a developer needs: setup, architecture, env vars, API endpoints, and deployment steps.",
};

// ─── Block templates ──────────────────────────────────────────────────────────

const BLOCKS: Array<{
  group: string;
  items: Array<{ label: string; block: string }>;
}> = [
  {
    group: "Tables",
    items: [
      {
        label: "2-column table",
        block: `| Column 1 | Column 2 |
|----------|----------|
| Value    | Value    |
| Value    | Value    |`,
      },
      {
        label: "3-column table",
        block: `| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Value    | Value    | Value    |
| Value    | Value    | Value    |`,
      },
      {
        label: "4-column table",
        block: `| Column 1 | Column 2 | Column 3 | Column 4 |
|----------|----------|----------|----------|
| Value    | Value    | Value    | Value    |
| Value    | Value    | Value    | Value    |`,
      },
      {
        label: "API endpoints",
        block: `| Method | Route | Description | Auth |
|--------|-------|-------------|------|
| \`GET\` | \`/api/resource\` | List items | Bearer |
| \`POST\` | \`/api/resource\` | Create item | Bearer |
| \`PATCH\` | \`/api/resource/[id]\` | Update item | Bearer |
| \`DELETE\` | \`/api/resource/[id]\` | Delete item | Bearer |`,
      },
      {
        label: "Environment variables",
        block: `| Variable | Description | Required |
|----------|-------------|----------|
| \`VAR_NAME\` | What it does | ✓ |
| \`VAR_NAME\` | What it does | — |`,
      },
      {
        label: "User roles",
        block: `| Role | Description | Access |
|------|-------------|--------|
| Admin | Full platform access | Full |
| Member | Standard account | Standard |
| Guest | Unauthenticated | Limited |`,
      },
      {
        label: "Key contacts",
        block: `| Role | Name | Contact |
|------|------|---------|
| Tech Lead | — | — |
| DevOps | — | — |
| Product | — | — |`,
      },
    ],
  },
  {
    group: "Blocks",
    items: [
      {
        label: "Note / callout",
        block: `> **Note:** Add an important note or warning here.`,
      },
      {
        label: "Code block (bash)",
        block: `\`\`\`bash
# Your command here
\`\`\``,
      },
      {
        label: "Code block (TypeScript)",
        block: `\`\`\`typescript
// Your code here
\`\`\``,
      },
      {
        label: "Numbered steps",
        block: `1. First step
2. Second step
3. Third step`,
      },
    ],
  },
];

// ─── Markdown renderer ────────────────────────────────────────────────────────

function renderMarkdown(md: string): string {
  if (!md.trim())
    return "<p class='text-[var(--text-4)] italic'>Nothing to preview yet.</p>";

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
    const line = lines[i];

    // fenced code block
    if (line.trim().startsWith("```")) {
      if (!inCode) {
        if (inUl) { out.push("</ul>"); inUl = false; }
        if (inOl) { out.push("</ol>"); inOl = false; }
        out.push(
          '<pre class="overflow-x-auto rounded-[6px] bg-[var(--surface-1)] p-3 text-[12.5px] font-mono my-3"><code>',
        );
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

    // blockquote / callout
    if (/^&gt; /.test(line)) {
      if (inUl) { out.push("</ul>"); inUl = false; }
      if (inOl) { out.push("</ol>"); inOl = false; }
      out.push(
        `<blockquote class="my-3 border-l-[3px] border-[var(--brand-500)] bg-[var(--surface-0)] px-4 py-2.5 rounded-r-[6px] text-sm text-[var(--text-2)]">${inlineFormat(line.slice(5))}</blockquote>`,
      );
      continue;
    }

    // close open lists if line doesn't match
    const isBullet = /^(\s*[-*])\s/.test(line);
    const isOrdered = /^\d+\.\s/.test(line);
    if (!isBullet && inUl) { out.push("</ul>"); inUl = false; }
    if (!isOrdered && inOl) { out.push("</ol>"); inOl = false; }

    // headings
    if (/^### /.test(line)) {
      out.push(
        `<h3 class="mt-5 mb-1.5 text-[15px] font-semibold text-[var(--text-1)]">${inlineFormat(line.slice(4))}</h3>`,
      );
    } else if (/^## /.test(line)) {
      out.push(
        `<h2 class="mt-6 mb-2 text-[17px] font-semibold text-[var(--text-1)] border-b border-[rgba(0,0,0,0.07)] pb-1.5">${inlineFormat(line.slice(3))}</h2>`,
      );
    } else if (/^# /.test(line)) {
      out.push(
        `<h1 class="mt-4 mb-3 text-[20px] font-bold text-[var(--text-1)]">${inlineFormat(line.slice(2))}</h1>`,
      );
    } else if (/^---$/.test(line.trim())) {
      out.push('<hr class="my-5 border-[rgba(0,0,0,0.09)]" />');
    } else if (isBullet) {
      if (!inUl)
        out.push('<ul class="my-2 ml-4 list-disc space-y-1 text-sm text-[var(--text-2)]">');
      inUl = true;
      out.push(`<li>${inlineFormat(line.replace(/^\s*[-*]\s/, ""))}</li>`);
    } else if (isOrdered) {
      if (!inOl)
        out.push('<ol class="my-2 ml-4 list-decimal space-y-1 text-sm text-[var(--text-2)]">');
      inOl = true;
      out.push(`<li>${inlineFormat(line.replace(/^\d+\.\s/, ""))}</li>`);
    } else if (/^\|.+\|$/.test(line)) {
      if (i === 0 || !/^\|.+\|$/.test(lines[i - 1])) {
        out.push(
          '<div class="overflow-x-auto my-4"><table class="min-w-full text-sm border-collapse border border-[rgba(0,0,0,0.1)] rounded-[6px]">',
        );
      }
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim());
      const isHeader =
        lines[i + 1]?.trim().startsWith("|---") ||
        lines[i + 1]?.trim().startsWith("| ---");
      const isSep = /^\|\s*[-:]+\s*(\|\s*[-:]+\s*)+\|$/.test(line.trim());
      if (isSep) {
        // skip separator rows
      } else if (isHeader) {
        out.push(
          `<thead><tr>${cells.map((c) => `<th class="border border-[rgba(0,0,0,0.08)] px-3 py-2 text-left font-semibold text-[var(--text-1)] bg-[var(--surface-0)]">${inlineFormat(c)}</th>`).join("")}</tr></thead><tbody>`,
        );
      } else {
        out.push(
          `<tr>${cells.map((c) => `<td class="border border-[rgba(0,0,0,0.08)] px-3 py-2 text-[var(--text-2)]">${inlineFormat(c)}</td>`).join("")}</tr>`,
        );
        if (!/^\|.+\|$/.test(lines[i + 1] ?? "")) {
          out.push("</tbody></table></div>");
        }
      }
    } else if (line.trim() === "") {
      out.push("");
    } else {
      out.push(
        `<p class="my-1.5 text-sm leading-6 text-[var(--text-2)]">${inlineFormat(line)}</p>`,
      );
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
    .replace(
      /`(.+?)`/g,
      '<code class="rounded bg-[var(--surface-1)] px-1 py-px text-[12px] font-mono text-[var(--brand-700)]">$1</code>',
    )
    .replace(
      /\[(.+?)\]\((.+?)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer" class="text-[var(--brand-700)] underline hover:no-underline">$1</a>',
    );
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
      className="flex h-6 min-w-[24px] items-center justify-center rounded px-1.5 text-[11px] text-[var(--text-3)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)] select-none"
      style={mono ? { fontFamily: "var(--font-mono)" } : undefined}
    >
      {label}
    </button>
  );
}

// ─── Public handle ────────────────────────────────────────────────────────────

export interface WikiPageEditorHandle {
  save: () => Promise<void>;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  section: WikiSection;
  title: string;
  content: string;
  isNew: boolean;
  onSave: (title: string, content: string) => Promise<void>;
  /** Controlled by the parent (WikiWorkspace renders the toggle in its action bar). */
  mode: "edit" | "preview";
  /** Called after a successful save so the parent can show the saved label. */
  onSaved?: (label: "Saved" | "Auto-saved") => void;
  readOnly?: boolean;
}

export const WikiPageEditor = forwardRef<WikiPageEditorHandle, Props>(
  function WikiPageEditor(
    {
      section,
      title,
      content: initialContent,
      isNew,
      onSave,
      mode,
      onSaved,
      readOnly = false,
    },
    ref,
  ) {
    const [editContent, setEditContent] = useState(initialContent);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSaved = useRef({ content: initialContent });
    const editContentRef = useRef(editContent);
    useEffect(() => {
      editContentRef.current = editContent;
    }, [editContent]);

    // Insert-block dropdown
    const [insertOpen, setInsertOpen] = useState(false);
    const insertContainerRef = useRef<HTMLDivElement>(null);

    // Close dropdown on outside click
    useEffect(() => {
      if (!insertOpen) return;
      function handleClick(e: MouseEvent) {
        if (
          insertContainerRef.current &&
          !insertContainerRef.current.contains(e.target as Node)
        ) {
          setInsertOpen(false);
        }
      }
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }, [insertOpen]);

    // Auto-resize textarea
    useEffect(() => {
      const ta = textareaRef.current;
      if (ta && mode === "edit") {
        ta.style.height = "auto";
        ta.style.height = `${Math.max(ta.scrollHeight, 420)}px`;
      }
    }, [editContent, mode]);

    // Auto-save: 2.5s after last change
    const scheduleAutoSave = useCallback(() => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = setTimeout(async () => {
        const current = editContentRef.current;
        if (current !== lastSaved.current.content) {
          await onSave(title, current);
          lastSaved.current = { content: current };
          onSaved?.("Auto-saved");
        }
      }, 2500);
    }, [onSave, title, onSaved]);

    useEffect(
      () => () => {
        if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      },
      [],
    );

    // Expose save() to parent via ref
    useImperativeHandle(
      ref,
      () => ({
        save: async () => {
          if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
          const current = editContentRef.current;
          await onSave(title, current);
          lastSaved.current = { content: current };
          onSaved?.("Saved");
        },
      }),
      [onSave, title, onSaved],
    );

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
        requestAnimationFrame(() => {
          ta.focus();
          const cur = start + before.length + selected.length;
          ta.setSelectionRange(cur, cur);
        });
        scheduleAutoSave();
      },
      [scheduleAutoSave],
    );

    // Insert a full block (table, callout, etc.) on its own line at cursor
    const insertBlock = useCallback(
      (block: string) => {
        setInsertOpen(false);
        const ta = textareaRef.current;
        if (!ta) return;
        const start = ta.selectionStart;
        const before = ta.value.slice(0, start);
        const after = ta.value.slice(start);
        const prefix = before.length > 0 && !before.endsWith("\n\n") ? "\n\n" : "";
        const suffix = after.length > 0 && !after.startsWith("\n") ? "\n\n" : "\n";
        const newVal = before + prefix + block + suffix + after.trimStart();
        setEditContent(newVal);
        requestAnimationFrame(() => {
          ta.focus();
          const pos = before.length + prefix.length + block.length + suffix.length;
          ta.setSelectionRange(pos, pos);
        });
        scheduleAutoSave();
      },
      [scheduleAutoSave],
    );

    const hint = SECTION_HINTS[section];

    // ── Read-only view ──────────────────────────────────────────────────────────
    if (readOnly) {
      return (
        <div
          className="min-h-[200px]"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(initialContent) }}
        />
      );
    }

    const words = wordCount(editContent);
    const chars = editContent.length;

    // ── Edit / Preview ──────────────────────────────────────────────────────────
    return (
      <div>
        {hint && isNew && (
          <p className="mb-4 text-[13px] text-[var(--text-4)]">{hint}</p>
        )}

        {/* Markdown toolbar — only in edit mode */}
        {mode === "edit" && (
          <div className="mb-3 flex flex-wrap items-center gap-x-0.5 gap-y-1 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-0)] px-2 py-1.5">
            <ToolbarBtn label="B" title="Bold" onClick={() => insert("**", "**", "bold text")} />
            <ToolbarBtn label="I" title="Italic" onClick={() => insert("*", "*", "italic text")} />
            <div className="mx-1 h-4 w-px bg-[rgba(0,0,0,0.1)]" />
            <ToolbarBtn label="H2" title="Heading 2" onClick={() => insert("## ", "", "Heading")} />
            <ToolbarBtn label="H3" title="Heading 3" onClick={() => insert("### ", "", "Heading")} />
            <div className="mx-1 h-4 w-px bg-[rgba(0,0,0,0.1)]" />
            <ToolbarBtn label="`c`" title="Inline code" onClick={() => insert("`", "`", "code")} />
            <ToolbarBtn
              label="```"
              title="Code block"
              onClick={() => insert("```\n", "\n```", "code here")}
            />
            <div className="mx-1 h-4 w-px bg-[rgba(0,0,0,0.1)]" />
            <ToolbarBtn
              label="•"
              title="Bullet list"
              onClick={() => insert("- ", "", "item")}
              mono={false}
            />
            <ToolbarBtn label="1." title="Numbered list" onClick={() => insert("1. ", "", "item")} />
            <div className="mx-1 h-4 w-px bg-[rgba(0,0,0,0.1)]" />
            <ToolbarBtn
              label="—"
              title="Divider"
              onClick={() => insert("\n---\n")}
              mono={false}
            />
            <ToolbarBtn
              label="🔗"
              title="Link"
              onClick={() => insert("[", "](https://)", "link text")}
              mono={false}
            />

            <div className="mx-1 h-4 w-px bg-[rgba(0,0,0,0.1)]" />

            {/* Insert block dropdown */}
            <div className="relative" ref={insertContainerRef}>
              <button
                type="button"
                onClick={() => setInsertOpen((o) => !o)}
                className="flex h-6 items-center gap-1 rounded px-2 text-[11px] font-medium text-[var(--text-3)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)] select-none"
                title="Insert table or block"
              >
                ⊞ Insert
                <ChevronDownIcon className="h-2.5 w-2.5" />
              </button>

              {insertOpen && (
                <div className="absolute left-0 top-full z-30 mt-1.5 w-56 overflow-hidden rounded-[10px] border border-[rgba(0,0,0,0.10)] bg-white py-1.5 shadow-[0_12px_32px_-4px_rgba(0,0,0,0.18)]">
                  {BLOCKS.map((group, gi) => (
                    <div key={group.group}>
                      {gi > 0 && <div className="my-1 mx-1.5 h-px bg-[rgba(0,0,0,0.06)]" />}
                      <p
                        className="mb-0.5 px-3 pt-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]"
                        style={{ fontFamily: "var(--font-mono)" }}
                      >
                        {group.group}
                      </p>
                      {group.items.map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() => insertBlock(item.block)}
                          className="flex w-full items-center px-3 py-1.5 text-left text-[13px] text-[var(--text-2)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Word / char count */}
            <span
              className="ml-auto pl-2 text-[11px] text-[var(--text-4)]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {words}w · {chars}c
            </span>
          </div>
        )}

        {/* Editor / Preview */}
        {mode === "edit" ? (
          <div className="overflow-hidden rounded-[10px] border border-[rgba(0,0,0,0.08)]">
            <textarea
              ref={textareaRef}
              value={editContent}
              onChange={(e) => {
                setEditContent(e.target.value);
                scheduleAutoSave();
              }}
              onBlur={() => scheduleAutoSave()}
              className="w-full resize-none bg-white p-5 text-sm leading-6 text-[var(--text-1)] outline-none"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "12.5px",
                minHeight: "480px",
              }}
              placeholder="Start writing… use the toolbar or ⊞ Insert to add tables and blocks."
              spellCheck={false}
            />
          </div>
        ) : (
          <div
            className="min-h-[480px] rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-white p-6"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(editContent) }}
          />
        )}
      </div>
    );
  },
);
