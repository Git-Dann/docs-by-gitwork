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
import { WikiMarkdown } from "@/lib/wiki-markdown";
import type { WikiSection } from "./wiki-sidebar";

// ─── Section hints ────────────────────────────────────────────────────────────

const SECTION_HINTS: Partial<Record<WikiSection, string>> = {
  ia: "Document the product's information hierarchy — navigation, content taxonomy, URL patterns, and key user flows.",
  "dev-guide": "Capture everything a developer needs: setup, architecture, env vars, API endpoints, and deployment steps.",
  "api-docs": "Document authentication, endpoints, examples, response shapes, webhooks, pagination, and error codes.",
  architecture: "Map the system boundaries, environments, services, data flow, security boundaries, and decisions.",
  runbook: "Capture operating routines, contacts, incident response steps, deployment checks, and recovery notes.",
  "data-model": "Document entities, relationships, key fields, statuses, ownership rules, and import/export expectations.",
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
// Rendered as React elements by `src/lib/wiki-markdown.tsx` — never as an HTML string. Wiki pages
// reach the client's public share page, so links go through the shared `safeUrl` allow-list.

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
        <WikiMarkdown className="min-h-[200px]" content={initialContent} />
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
          <WikiMarkdown
            className="min-h-[480px] rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-white p-6"
            content={editContent}
          />
        )}
      </div>
    );
  },
);
