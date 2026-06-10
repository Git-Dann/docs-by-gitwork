"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowUpTrayIcon, ArrowDownTrayIcon, DocumentTextIcon } from "@heroicons/react/24/outline";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/format";
import { useBackstageTeam } from "@/hooks/use-backstage";
import { useImportTasks } from "@/hooks/use-tasks";
import {
  TASK_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
  type TaskStatus,
  type TaskPriority,
} from "@/types/tasks";

// ── The fields a CSV can map onto ─────────────────────────────────────────────
type FieldKey = "title" | "status" | "priority" | "assignee" | "dueDate" | "category" | "description";

const FIELDS: { key: FieldKey; label: string; required?: boolean; aliases: string[] }[] = [
  { key: "title", label: "Title", required: true, aliases: ["title", "name", "task", "task name", "summary", "subject"] },
  { key: "status", label: "Status", aliases: ["status", "state", "task status", "column", "stage"] },
  { key: "priority", label: "Priority", aliases: ["priority", "urgency", "importance"] },
  { key: "assignee", label: "Assignee", aliases: ["assignee", "owner", "assigned to", "assigned", "dev", "developer", "responsible", "who"] },
  { key: "dueDate", label: "Due date", aliases: ["due", "due date", "deadline", "date", "end date", "due on"] },
  { key: "category", label: "Category", aliases: ["category", "section", "block", "list", "group", "feature", "epic", "phase"] },
  { key: "description", label: "Description", aliases: ["description", "notes", "details", "desc", "body"] },
];

const STATUS_ALIASES: Record<string, TaskStatus> = {
  backlog: "BACKLOG",
  todo: "TODO", "to do": "TODO", "to-do": "TODO", open: "TODO", new: "TODO", "not started": "TODO",
  doing: "DOING", "in progress": "DOING", "in-progress": "DOING", wip: "DOING", active: "DOING", started: "DOING",
  review: "IN_REVIEW", "in review": "IN_REVIEW", "in-review": "IN_REVIEW", qa: "IN_REVIEW", testing: "IN_REVIEW",
  done: "DONE", complete: "DONE", completed: "DONE", closed: "DONE", shipped: "DONE", live: "DONE", merged: "DONE",
};
const PRIORITY_ALIASES: Record<string, TaskPriority> = {
  low: "LOW", minor: "LOW",
  medium: "MEDIUM", med: "MEDIUM", normal: "MEDIUM", standard: "MEDIUM",
  high: "HIGH", urgent: "HIGH", critical: "HIGH", p0: "HIGH", p1: "HIGH",
};

// ── CSV parser — quote-aware (handles commas/newlines/"" inside quoted fields) ─
function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const s = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  const cleaned = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (cleaned.length === 0) return { headers: [], rows: [] };
  return { headers: cleaned[0].map((h) => h.trim()), rows: cleaned.slice(1) };
}

function parseDate(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v; // ISO
  const uk = v.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/); // dd/mm/yyyy
  if (uk) {
    const dd = +uk[1], mm = +uk[2];
    let yy = +uk[3];
    if (yy < 100) yy += 2000;
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      const dt = new Date(Date.UTC(yy, mm - 1, dd));
      if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
    }
  }
  const dt = new Date(v);
  if (!Number.isNaN(dt.getTime())) {
    return new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate())).toISOString().slice(0, 10);
  }
  return null;
}

function mapStatus(raw: string): { value: TaskStatus; flagged: boolean } {
  const k = raw.trim().toLowerCase();
  if (!k) return { value: "BACKLOG", flagged: false };
  const v = STATUS_ALIASES[k];
  return v ? { value: v, flagged: false } : { value: "BACKLOG", flagged: true };
}
function mapPriority(raw: string): { value: TaskPriority; flagged: boolean } {
  const k = raw.trim().toLowerCase();
  if (!k) return { value: "MEDIUM", flagged: false };
  const v = PRIORITY_ALIASES[k];
  return v ? { value: v, flagged: false } : { value: "MEDIUM", flagged: true };
}

const TEMPLATE = [
  "Title,Status,Priority,Assignee,Due date,Category,Description",
  "Design login screen,To Do,High,Jane Smith,2026-07-15,Frontend,Wireframe then final UI",
  "Set up auth API,Doing,Medium,sam@acme.com,2026-07-20,Backend,JWT + refresh tokens",
  "Write release notes,Backlog,Low,,,Docs,",
].join("\n");

const SELECT_CLASS =
  "rounded-[6px] border border-[var(--border-2)] bg-white px-2 py-1 text-xs text-[var(--text-2)] focus:border-[var(--brand-500)] focus:outline-none";

export function TaskImportModal({
  slug,
  blocks,
  onClose,
  onDone,
}: {
  slug: string;
  blocks: { id: string; name: string }[];
  onClose: () => void;
  onDone: (created: number) => void;
}) {
  const team = useBackstageTeam();
  const members = useMemo(
    () => (team.data ?? []).map((m) => ({ id: m.id, name: m.name, email: m.email })),
    [team.data],
  );
  const importMut = useImportTasks();

  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [mapping, setMapping] = useState<Record<FieldKey, number | null>>({
    title: null, status: null, priority: null, assignee: null, dueDate: null, category: null, description: null,
  });
  // Distinct unmatched value → chosen id ("" = leave unset).
  const [assigneeFix, setAssigneeFix] = useState<Record<string, string>>({});
  const [categoryFix, setCategoryFix] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // member / block lookups (by lowercased name + email)
  const memberByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of members) {
      if (u.name) m.set(u.name.trim().toLowerCase(), u.id);
      if (u.email) m.set(u.email.trim().toLowerCase(), u.id);
    }
    return m;
  }, [members]);
  const blockByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of blocks) m.set(b.name.trim().toLowerCase(), b.id);
    return m;
  }, [blocks]);

  function onFile(file: File) {
    setError(null);
    file
      .text()
      .then((text) => {
        const p = parseCsv(text);
        if (p.headers.length === 0) {
          setError("That file looks empty — no header row found.");
          return;
        }
        // Auto-map: for each field, find the first header whose normalized value matches an alias.
        const norm = (s: string) => s.trim().toLowerCase();
        const used = new Set<number>();
        const next: Record<FieldKey, number | null> = {
          title: null, status: null, priority: null, assignee: null, dueDate: null, category: null, description: null,
        };
        for (const f of FIELDS) {
          const idx = p.headers.findIndex((h, i) => !used.has(i) && f.aliases.includes(norm(h)));
          if (idx !== -1) { next[f.key] = idx; used.add(idx); }
        }
        setFileName(file.name);
        setParsed(p);
        setMapping(next);
        setAssigneeFix({});
        setCategoryFix({});
      })
      .catch(() => setError("Could not read that file."));
  }

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "task-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Resolve every row against the current mapping + value fixes ──────────────
  const resolved = useMemo(() => {
    if (!parsed) return null;
    const cell = (r: string[], key: FieldKey) => {
      const i = mapping[key];
      return i == null ? "" : (r[i] ?? "").trim();
    };
    const unmatchedAssignees = new Set<string>();
    const unmatchedCategories = new Set<string>();

    const rows = parsed.rows.map((r) => {
      const title = cell(r, "title");
      const st = mapStatus(cell(r, "status"));
      const pr = mapPriority(cell(r, "priority"));
      const dueRaw = cell(r, "dueDate");
      const dueIso = parseDate(dueRaw);
      const aName = cell(r, "assignee");
      let aId: string | null = aName ? memberByKey.get(aName.toLowerCase()) ?? null : null;
      if (!aId && aName) {
        const fix = assigneeFix[aName.toLowerCase()];
        if (fix) aId = fix;
        else unmatchedAssignees.add(aName);
      }
      const cName = cell(r, "category");
      let cId: string | null = cName ? blockByName.get(cName.toLowerCase()) ?? null : null;
      if (!cId && cName) {
        const fix = categoryFix[cName.toLowerCase()];
        if (fix) cId = fix;
        else unmatchedCategories.add(cName);
      }
      return {
        title,
        description: cell(r, "description"),
        status: st.value,
        statusFlagged: st.flagged,
        priority: pr.value,
        priorityFlagged: pr.flagged,
        assigneeName: aName,
        assigneeId: aId,
        assigneeFlagged: Boolean(aName) && !aId,
        dueRaw,
        dueIso,
        dueFlagged: Boolean(dueRaw) && !dueIso,
        categoryName: cName,
        categoryId: cId,
        categoryFlagged: Boolean(cName) && !cId,
        valid: title.length > 0,
      };
    });
    return {
      rows,
      unmatchedAssignees: [...unmatchedAssignees],
      unmatchedCategories: [...unmatchedCategories],
      importCount: rows.filter((r) => r.valid).length,
      skipCount: rows.filter((r) => !r.valid).length,
    };
  }, [parsed, mapping, memberByKey, blockByName, assigneeFix, categoryFix]);

  const titleMapped = mapping.title != null;

  async function runImport() {
    if (!resolved) return;
    setError(null);
    const tasks = resolved.rows
      .filter((r) => r.valid)
      .map((r) => ({
        title: r.title,
        description: r.description || undefined,
        status: r.status,
        priority: r.priority,
        assigneeIds: r.assigneeId ? [r.assigneeId] : undefined,
        featureBlockId: r.categoryId ?? undefined,
        dueDate: r.dueIso ?? undefined,
      }));
    if (tasks.length === 0) {
      setError("No rows with a Title to import.");
      return;
    }
    try {
      const res = await importMut.mutateAsync({ slug, tasks });
      onDone(res.created);
    } catch {
      setError("Import failed. Please check the file and try again.");
    }
  }

  return (
    <Modal open onClose={onClose} title="Import tasks" panelClassName="w-full max-w-3xl">
      <div className="max-h-[calc(100dvh-160px)] overflow-y-auto p-5">
        {!parsed ? (
          // ── Step 1: pick a file ──────────────────────────────────────────────
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-3)]">
              Upload a <strong>CSV</strong> of tasks. The first row must be column headers. Only
              <strong> Title</strong> is required — Status, Priority, Assignee, Due date, Category and
              Description are optional and will be auto-matched (you can adjust the mapping next).
            </p>
            <div className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3 text-xs text-[var(--text-3)]">
              <p className="mb-1 font-medium text-[var(--text-2)]">Expected columns</p>
              <p>
                <span className="font-mono">Title</span>, <span className="font-mono">Status</span>{" "}
                (Backlog / To&nbsp;Do / Doing / In&nbsp;Review / Done), <span className="font-mono">Priority</span>{" "}
                (Low / Medium / High), <span className="font-mono">Assignee</span> (name or email),{" "}
                <span className="font-mono">Due&nbsp;date</span> (YYYY-MM-DD), <span className="font-mono">Category</span>,{" "}
                <span className="font-mono">Description</span>.
              </p>
              <button
                type="button"
                onClick={downloadTemplate}
                className="mt-2 inline-flex items-center gap-1.5 font-medium text-[var(--brand-700)] hover:underline"
              >
                <ArrowDownTrayIcon className="h-3.5 w-3.5" /> Download template
              </button>
            </div>

            <label
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-[var(--border-2)] bg-white px-4 py-10 text-center transition hover:border-[var(--brand-400)] hover:bg-[var(--surface-1)]"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) onFile(f);
              }}
            >
              <ArrowUpTrayIcon className="h-6 w-6 text-[var(--text-4)]" />
              <span className="text-sm font-medium text-[var(--text-2)]">Drop a CSV here, or click to browse</span>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                }}
              />
            </label>
            {error ? <p className="text-xs font-medium text-rose-600">{error}</p> : null}
          </div>
        ) : (
          // ── Step 2: map, fix, preview ────────────────────────────────────────
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-3)]">
                <DocumentTextIcon className="h-4 w-4" /> {fileName} · {parsed.rows.length} rows
              </span>
              <button
                type="button"
                onClick={() => { setParsed(null); setFileName(null); }}
                className="text-xs font-medium text-[var(--text-4)] hover:text-[var(--text-1)]"
              >
                Choose a different file
              </button>
            </div>

            {/* Column mapping */}
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-4)]" style={{ fontFamily: "var(--font-mono)" }}>
                Map columns
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {FIELDS.map((f) => {
                  const unmapped = mapping[f.key] == null;
                  return (
                    <label key={f.key} className="flex items-center justify-between gap-2 rounded-[8px] border border-[var(--border-2)] bg-white px-3 py-2">
                      <span className="text-xs font-medium text-[var(--text-2)]">
                        {f.label}
                        {f.required ? <span className="text-rose-500"> *</span> : null}
                        {f.required && unmapped ? (
                          <span className="ml-1 text-[10px] font-normal text-rose-600">needs a column</span>
                        ) : null}
                      </span>
                      <select
                        className={cn(SELECT_CLASS, f.required && unmapped && "border-rose-400")}
                        value={mapping[f.key] ?? ""}
                        onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value === "" ? null : Number(e.target.value) }))}
                      >
                        <option value="">— skip —</option>
                        {parsed.headers.map((h, i) => (
                          <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                        ))}
                      </select>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Align unmatched assignees / categories */}
            {resolved && (resolved.unmatchedAssignees.length > 0 || resolved.unmatchedCategories.length > 0) ? (
              <div className="space-y-3 rounded-[10px] border border-amber-200 bg-amber-50/60 p-3">
                <p className="text-xs font-medium text-amber-800">
                  Some values didn&apos;t match — align them to existing records (or leave unset).
                </p>
                {resolved.unmatchedAssignees.length > 0 ? (
                  <div>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-[1px] text-amber-700">Assignees</p>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {resolved.unmatchedAssignees.map((name) => (
                        <div key={name} className="flex items-center justify-between gap-2 rounded-[6px] bg-white px-2 py-1.5">
                          <span className="truncate text-xs text-[var(--text-2)]">{name}</span>
                          <select
                            className={SELECT_CLASS}
                            value={assigneeFix[name.toLowerCase()] ?? ""}
                            onChange={(e) => setAssigneeFix((s) => ({ ...s, [name.toLowerCase()]: e.target.value }))}
                          >
                            <option value="">Unassigned</option>
                            {members.map((m) => (
                              <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {resolved.unmatchedCategories.length > 0 ? (
                  <div>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-[1px] text-amber-700">Categories</p>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {resolved.unmatchedCategories.map((name) => (
                        <div key={name} className="flex items-center justify-between gap-2 rounded-[6px] bg-white px-2 py-1.5">
                          <span className="truncate text-xs text-[var(--text-2)]">{name}</span>
                          <select
                            className={SELECT_CLASS}
                            value={categoryFix[name.toLowerCase()] ?? ""}
                            onChange={(e) => setCategoryFix((s) => ({ ...s, [name.toLowerCase()]: e.target.value }))}
                          >
                            <option value="">No category</option>
                            {blocks.map((b) => (
                              <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Preview */}
            {resolved ? (
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-4)]" style={{ fontFamily: "var(--font-mono)" }}>
                  Preview · first {Math.min(8, resolved.rows.length)} of {resolved.rows.length}
                </p>
                <div className="overflow-x-auto rounded-[8px] border border-[var(--border-2)]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[var(--surface-1)] text-[10px] uppercase tracking-[0.5px] text-[var(--text-4)]">
                      <tr>
                        <th className="px-2 py-1.5 font-medium">Title</th>
                        <th className="px-2 py-1.5 font-medium">Status</th>
                        <th className="px-2 py-1.5 font-medium">Priority</th>
                        <th className="px-2 py-1.5 font-medium">Assignee</th>
                        <th className="px-2 py-1.5 font-medium">Due</th>
                        <th className="px-2 py-1.5 font-medium">Category</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resolved.rows.slice(0, 8).map((r, i) => {
                        const flag = "text-amber-700";
                        return (
                          <tr key={i} className={cn("border-t border-[rgba(0,0,0,0.05)]", !r.valid && "bg-rose-50")}>
                            <td className={cn("px-2 py-1.5", !r.valid && "text-rose-600")}>
                              {r.title || <span className="italic">missing title — skipped</span>}
                            </td>
                            <td className={cn("px-2 py-1.5", r.statusFlagged && flag)}>{TASK_STATUS_LABELS[r.status]}</td>
                            <td className={cn("px-2 py-1.5", r.priorityFlagged && flag)}>{TASK_PRIORITY_LABELS[r.priority]}</td>
                            <td className={cn("px-2 py-1.5", r.assigneeFlagged && flag)}>
                              {r.assigneeId ? (members.find((m) => m.id === r.assigneeId)?.name ?? "—") : r.assigneeName ? `${r.assigneeName} (unmatched)` : "—"}
                            </td>
                            <td className={cn("px-2 py-1.5", r.dueFlagged && flag)}>
                              {r.dueIso ?? (r.dueRaw ? `${r.dueRaw} (?)` : "—")}
                            </td>
                            <td className={cn("px-2 py-1.5", r.categoryFlagged && flag)}>
                              {r.categoryId ? (blocks.find((b) => b.id === r.categoryId)?.name ?? "—") : r.categoryName ? `${r.categoryName} (unmatched)` : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="mt-1.5 text-[11px] text-[var(--text-4)]">
                  Amber = adjusted to a default/unset value. {resolved.skipCount > 0 ? `${resolved.skipCount} row(s) without a title will be skipped.` : ""}
                </p>
              </div>
            ) : null}

            {error ? <p className="text-xs font-medium text-rose-600">{error}</p> : null}

            <div className="flex items-center justify-between gap-3 border-t border-[var(--border-2)] pt-4">
              <span className="text-xs text-[var(--text-3)]">
                {resolved ? <><strong>{resolved.importCount}</strong> task{resolved.importCount === 1 ? "" : "s"} will be imported</> : null}
              </span>
              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={runImport}
                  disabled={!titleMapped || !resolved || resolved.importCount === 0 || importMut.isPending}
                >
                  {importMut.isPending ? "Importing…" : `Import ${resolved?.importCount ?? 0} tasks`}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
