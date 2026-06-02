// Local, one-time CSV → dataset transform for the ClickUp migration.
//
// ClickUp's CSV export is a flat, complete dump (one row per task incl. subtasks),
// which sidesteps the API/MCP bulk-pull timeouts entirely — no token needed.
//
// Usage:  node scripts/parse-clickup-csv.mjs "/path/to/clickup-export.csv"
//
// Writes src/data/clickup-import.json (a compact, server-importable dataset) and
// prints a per-client dry-run summary (total / active / subtasks / milestones +
// distinct assignee names) so we can eyeball the numbers before importing.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const csvPath = process.argv[2];
if (!csvPath) {
  console.error("Usage: node scripts/parse-clickup-csv.mjs <path-to-csv>");
  process.exit(1);
}

// ── Robust CSV parser (handles quoted fields, embedded newlines, "" escapes) ──
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // ignore
    } else field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ── Mirror of the server's done-status detection (preview counts only) ────────
function isDone(status) {
  const s = (status || "").toLowerCase().trim();
  return /\b(done|complete|completed|closed|archived|cancel|cancelled|canceled|live|shipped|merged)\b/.test(s);
}

// Lists we never import (Care replaces support; legacy/feedback/course-requests are dead).
const SKIP = [/support/i, /feedback/i, /course\s*request/i, /\blegacy\b/i, /\{\{.*\}\}/];
const isSkipped = (name) => SKIP.some((re) => re.test(name));

const raw = readFileSync(csvPath, "utf8");
const rows = parseCSV(raw);
const header = rows[0];
const idx = {};
header.forEach((h, i) => (idx[h.trim()] = i));

function cell(row, name) {
  const i = idx[name];
  return i === undefined ? "" : (row[i] ?? "").trim();
}

// folderName -> { name, lists: Map(listId -> { clickupId, name, isMilestones, tasks: [] }) }
const folders = new Map();
let skippedFolderless = 0;
const assigneeCounts = new Map();

for (let r = 1; r < rows.length; r++) {
  const row = rows[r];
  if (!row.length || !cell(row, "Task ID")) continue;
  if (cell(row, "Space Name") !== "Clients") continue;

  // Hierarchy from the "Clients > Folder > List" home-location path.
  const path = (cell(row, "Home Location") || "")
    .split(">")
    .map((s) => s.trim())
    .filter(Boolean);
  if (path.length < 3) {
    skippedFolderless++;
    continue; // folderless list directly in the space — not a client folder
  }
  const folderName = path[1];
  const listName = cell(row, "List Name") || path[2];
  const listId = cell(row, "Home Location ID") || `${folderName}/${listName}`;

  // Assignees (native) — JSON array of display names (or objects).
  let assigneeNames = [];
  try {
    const a = JSON.parse(cell(row, "Assignees") || "[]");
    if (Array.isArray(a)) {
      assigneeNames = a
        .map((x) => (typeof x === "string" ? x : x && (x.username || x.name || x.email)))
        .filter(Boolean);
    }
  } catch {
    /* leave empty */
  }
  for (const n of assigneeNames) assigneeCounts.set(n, (assigneeCounts.get(n) ?? 0) + 1);

  const parentRaw = cell(row, "Parent ID");
  const parentClickupId = parentRaw && parentRaw !== "null" ? parentRaw : null;
  const dueRaw = cell(row, "Due Date");
  const startRaw = cell(row, "Start Date");
  const priorityRaw = cell(row, "Priority");
  const desc = cell(row, "Task Content");

  const task = {
    clickupId: cell(row, "Task ID"),
    name: cell(row, "Task Name") || "(untitled)",
    description: desc || null,
    status: cell(row, "Status") || null,
    priority: priorityRaw && priorityRaw !== "null" ? priorityRaw : null,
    dueMs: dueRaw && dueRaw !== "null" ? Number(dueRaw) : null,
    startMs: startRaw && startRaw !== "null" ? Number(startRaw) : null,
    parentClickupId,
    assigneeNames,
  };

  if (!folders.has(folderName)) folders.set(folderName, { name: folderName, lists: new Map() });
  const folder = folders.get(folderName);
  if (!folder.lists.has(listId)) {
    folder.lists.set(listId, {
      clickupId: listId,
      name: listName,
      isMilestones: /milestone/i.test(listName),
      tasks: [],
    });
  }
  folder.lists.get(listId).tasks.push(task);
}

// ── Serialize dataset ─────────────────────────────────────────────────────────
const dataset = {
  generatedFrom: csvPath.split("/").pop(),
  space: "Clients",
  // Clean, import-ready set: skip-lists excluded, normal lists active-only,
  // milestone lists kept whole (the server picks the dated ones).
  folders: [...folders.values()]
    .map((f) => ({
      name: f.name,
      lists: [...f.lists.values()]
        .filter((l) => !isSkipped(l.name))
        .map((l) => ({
          clickupId: l.clickupId,
          name: l.name,
          isMilestones: l.isMilestones,
          tasks: l.isMilestones ? l.tasks : l.tasks.filter((t) => !isDone(t.status)),
        }))
        .filter((l) => l.tasks.length > 0),
    }))
    .filter((f) => f.lists.length > 0),
};

const outPath = resolve(repoRoot, "src/data/clickup-import.json");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(dataset, null, 1));

// ── Dry-run summary ───────────────────────────────────────────────────────────
let T = { folders: 0, lists: 0, total: 0, active: 0, subtasks: 0, milestones: 0, skippedLists: 0 };

console.log(`\n=== ClickUp CSV → dataset ===`);
console.log(`source: ${dataset.generatedFrom}  |  written: src/data/clickup-import.json`);
console.log(`folderless rows skipped: ${skippedFolderless}\n`);

const sortedFolders = dataset.folders.sort((a, b) => a.name.localeCompare(b.name));
for (const f of sortedFolders) {
  T.folders++;
  let fTotal = 0,
    fActive = 0,
    fSub = 0,
    fMile = 0;
  const lines = [];
  for (const l of f.lists) {
    T.lists++;
    const skipped = isSkipped(l.name);
    if (skipped) {
      T.skippedLists++;
      lines.push(`     · ${l.name}  [SKIPPED]  (${l.tasks.length})`);
      continue;
    }
    if (l.isMilestones) {
      const dated = l.tasks.filter((t) => t.dueMs || t.startMs).length;
      fMile += dated;
      lines.push(`     ◆ ${l.name}  [MILESTONES]  ${dated} dated / ${l.tasks.length}`);
      continue;
    }
    const active = l.tasks.filter((t) => !isDone(t.status));
    const sub = active.filter((t) => t.parentClickupId).length;
    fTotal += l.tasks.length;
    fActive += active.length;
    fSub += sub;
    lines.push(`     · ${l.name}  ${active.length} active / ${l.tasks.length}  (${sub} sub)`);
  }
  T.total += fTotal;
  T.active += fActive;
  T.subtasks += fSub;
  T.milestones += fMile;
  console.log(`■ ${f.name}  — ${fActive} active tasks, ${fSub} subtasks, ${fMile} milestones  (${f.lists.length} lists)`);
  for (const ln of lines) console.log(ln);
  console.log("");
}

console.log(`=== TOTALS ===`);
console.log(
  `clients(folders): ${T.folders}  lists: ${T.lists} (skipped ${T.skippedLists})  ` +
    `tasks(all): ${T.total}  active: ${T.active}  subtasks: ${T.subtasks}  milestones: ${T.milestones}`,
);

const assignees = [...assigneeCounts.entries()].sort((a, b) => b[1] - a[1]);
console.log(`\n=== distinct native assignees (${assignees.length}) ===`);
console.log(assignees.map(([n, c]) => `${n} (${c})`).join(", "));
