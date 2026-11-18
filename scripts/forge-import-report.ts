/**
 * Turn a saved Forge import plan (JSON from the dry-run route or MCP tool) into the readable
 * markdown summary Dan approves before anything is written.
 *
 *   npx tsx scripts/forge-import-report.ts plan.json > plan.md
 *
 * Or plan offline from saved files (no network, no database):
 *
 *   npx tsx scripts/forge-import-report.ts --items items.json --tasks tasks.json [--json out.json] > plan.md
 *
 * `tasks.json` is a list of { id, title, status, parentId, archivedAt, ... } as exported from the board.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { parseForgeFeed, parseForgeJson } from "../src/lib/forge-import/feed";
import { buildForgePlan, type BoardTask, type ForgePlan } from "../src/lib/forge-import/plan";
import { renderForgePlanMarkdown } from "../src/lib/forge-import/report";
import { FORGE_STAGES } from "../src/lib/forge-import/stages";
import type { BoardColumnDef } from "../src/lib/tasks/board-columns";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** The columns Wedge's board is set up with, so an offline plan doesn't report them missing. */
function plannedColumns(): BoardColumnDef[] {
  const out: BoardColumnDef[] = [];
  for (const p of Object.values(FORGE_STAGES)) {
    if (p.column && !out.some((c) => c.name === p.column)) {
      out.push({ id: `col_${out.length.toString().padStart(6, "0")}`, name: p.column, stage: p.status });
    }
  }
  return out;
}

function offlinePlan(itemsPath: string, tasksPath: string): ForgePlan {
  const feed = parseForgeFeed(parseForgeJson(readFileSync(itemsPath, "utf8")));
  const raw = JSON.parse(readFileSync(tasksPath, "utf8")) as Array<Record<string, unknown>>;
  const tasks: BoardTask[] = raw.map((t) => ({
    id: String(t.id),
    title: String(t.title ?? ""),
    status: String(t.status ?? "BACKLOG"),
    parentId: (t.parentId as string | null) ?? null,
    archived: Boolean(t.archivedAt),
    itemType: (t.itemType as string | null) ?? null,
    productCardId: (t.productCardId as string | null) ?? null,
    externalRef: (t.externalRef as string | null) ?? null,
    description: (t.description as string | null) ?? null,
    releaseId: (t.releaseId as string | null) ?? null,
    tier: (t.tier as string | null) ?? null,
    area: (t.area as string | null) ?? null,
    estimateHours: (t.estimateHours as number | null) ?? null,
  }));
  return buildForgePlan({ feed, tasks, releases: [], columns: plannedColumns() });
}

const itemsPath = arg("--items");
const tasksPath = arg("--tasks");
const plan: ForgePlan =
  itemsPath && tasksPath
    ? offlinePlan(itemsPath, tasksPath)
    : (JSON.parse(readFileSync(process.argv[2], "utf8")) as ForgePlan);
const jsonOut = arg("--json");
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(plan, null, 1));
process.stdout.write(renderForgePlanMarkdown(plan, { generatedAt: new Date().toISOString().slice(0, 10) }) + "\n");
