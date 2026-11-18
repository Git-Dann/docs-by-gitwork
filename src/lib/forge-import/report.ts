/**
 * The dry-run plan as a readable summary, for the person who approves the import. Says what
 * would be created, what would be linked to what, and what is waiting for a decision — and that
 * nothing on the board is moved, archived or deleted, because that is the question they'll have.
 */

import type { ForgePlan, PlanItem } from "./plan";

const TYPE_LABEL = new Map<string, string>([
  ["feature", "Feature"],
  ["subitem", "Sub-item"],
  ["bug", "Bug"],
  ["feedback", "Feedback"],
]);
const typeLabel = (t: string) => TYPE_LABEL.get(t) ?? t;
const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
const where = (i: PlanItem) => i.card.column ?? i.card.status.replace("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
const task = (t: { title: string; status: string; archived: boolean }) => `${esc(t.title)} (${t.status}${t.archived ? ", archived" : ""})`;

export function renderForgePlanMarkdown(plan: ForgePlan, opts: { title?: string; generatedAt?: string } = {}): string {
  const c = plan.counts;
  const L: string[] = [];
  L.push(`# ${opts.title ?? "Big Wedge plan → Wedge board: import dry run"}`, "");
  if (opts.generatedAt) L.push(`Generated ${opts.generatedAt}. Nothing has been written.`, "");
  L.push(
    "The import never moves, reparents, archives or deletes a task the team already has. A matching dev task is linked to its card and stays where it is.",
    "",
    "| | Items |",
    "|---|---|",
    `| Considered | ${c.considered} |`,
    `| New cards | ${c.create} |`,
    `| Existing task becomes the card | ${c.link} |`,
    `| Dev tasks linked to a card | ${c.devLinks} |`,
    `| Already imported (only empty fields filled) | ${c.alreadyImported} |`,
    `| **Waiting for your decision** | **${c.review}** |`,
    `| Sub-items waiting for their feature's card | ${c.waiting} |`,
    `| Skipped in review | ${c.skip} |`,
    `| Releases to create | ${c.releasesToCreate} |`,
    `| Screenshots to copy onto cards | ${c.imagesToCopy ?? 0} |`,
    "",
  );
  if (c.unknownStages) L.push(`⚠️ ${c.unknownStages} item(s) have a stage we don't recognise and would go in Future Idea.`, "");
  if (c.skippedFromFeed) L.push(`⚠️ ${c.skippedFromFeed} item(s) in the feed had no id or no title and can't be imported.`, "");
  if (plan.missingColumns.length) {
    L.push(`## ⛔ Board columns missing`, "", "The import won't run until the Wedge board has these columns:", "", ...plan.missingColumns.map((n) => `- ${n}`), "");
  }

  const review = plan.items.filter((i) => i.action === "review");
  L.push(`## Waiting for your decision (${review.length})`, "");
  if (!review.length) L.push("Nothing.", "");
  for (const i of review) {
    L.push(`### ${esc(i.title)}`, `${typeLabel(i.forgeType)} · ${i.stage} · Forge #${i.forgeId}. ${i.reason ?? ""}`, "");
    for (const cand of i.candidates) L.push(`- ${task(cand)}: ${cand.kind}, ${esc(cand.why)}`);
    L.push(`- Or: a new card, or skip it.`, "");
  }

  const waiting = plan.items.filter((i) => i.action === "waiting");
  if (waiting.length) {
    L.push(`## Sub-items waiting for their feature (${waiting.length})`, "", "Made on the run after their feature's card is decided.", "");
    for (const i of waiting) L.push(`- ${esc(i.title)}`);
    L.push("");
  }

  const warned = plan.items.filter((i) => i.warnings.length);
  if (warned.length) {
    L.push(`## Worth knowing (${warned.length})`, "");
    for (const i of warned) L.push(`- **${esc(i.title)}**: ${esc(i.warnings.join(" "))}`);
    L.push("");
  }

  const linked = plan.items.filter((i) => i.action === "link");
  L.push(`## Existing task becomes the card (${linked.length})`, "");
  for (const i of linked) L.push(`- **${esc(i.title)}** → ${task(i.target!)}${i.reason ? `. ${esc(i.reason)}` : ""}`);
  L.push("");

  const withDev = plan.items.filter((i) => i.devLinks.length);
  L.push(`## New card with a dev task linked to it (${withDev.length})`, "");
  for (const i of withDev) L.push(`- **${esc(i.title)}** (${typeLabel(i.forgeType)}, ${where(i)}) ← ${i.devLinks.map(task).join(", ")}`);
  L.push("");

  const creates = plan.items.filter((i) => i.action === "create");
  L.push(`## New cards by column (${creates.length})`, "");
  const byColumn = new Map<string, PlanItem[]>();
  for (const i of creates) byColumn.set(where(i), [...(byColumn.get(where(i)) ?? []), i]);
  for (const [col, list] of byColumn) {
    L.push(`### ${col} (${list.length})`, "");
    for (const i of list) L.push(`- ${esc(i.title)} · ${typeLabel(i.forgeType)}${i.card.tier ? ` · ${i.card.tier}` : ""}${i.card.area ? ` · ${esc(i.card.area)}` : ""}`);
    L.push("");
  }

  L.push(`## Releases (${plan.releases.length})`, "", "| Version | Name | Dates | |", "|---|---|---|---|");
  for (const r of plan.releases) {
    const doc = r.docUrl ? ` · [release doc](${r.docUrl})` : "";
    L.push(`| ${esc(r.version)} | ${esc(r.name ?? "")} | ${r.startDate ?? "?"} → ${r.endDate ?? "?"} | ${r.existingId ? "already on the board" : "new"}${doc} |`);
  }
  L.push("");

  const done = plan.items.filter((i) => i.action === "already-imported");
  if (done.length) {
    L.push(`## Already imported (${done.length})`, "");
    for (const i of done) L.push(`- ${esc(i.title)}${i.fill.length ? ` (fill: ${i.fill.join(", ")})` : ""}`);
    L.push("");
  }
  return L.join("\n");
}
