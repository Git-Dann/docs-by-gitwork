/**
 * Fold the old four-list handover into one entry per client.
 *
 * The first cut modelled a handover as four lists — decisions, open risks,
 * duties, client notes — each a flat row. Read on the real board it was a task
 * list, and a task list is the wrong shape for "where is this client and what
 * do I pick up": the reader is a person opening ONE client, not scanning four
 * tabs for the lines that happen to mention it.
 *
 * So a client entry is now three paragraphs — where we are, what the duties
 * are, anything else — and this is the one-time reshape that gets the existing
 * rows into it.
 *
 * ⚠️ NOTHING IS DISCARDED. Every title and every detail lands in exactly one
 * paragraph, and `foldedText()` exists so a test can assert that by comparing
 * the input text against the output text rather than by reading the code.
 *
 * Pure: no Prisma, no clock. The caller applies the plan.
 */

export type FoldKind = "DECISION" | "RISK" | "DUTY" | "CLIENT" | "ROUTE";

export interface FoldItem {
  id: string;
  kind: FoldKind;
  clientId: string | null;
  clientName: string | null;
  title: string;
  detail: string | null;
  cadence: string | null;
  channel: string | null;
  duties: string | null;
  other: string | null;
}

export interface FoldEntryPlan {
  /** The CLIENT row to write into, or null when one must be created. */
  id: string | null;
  clientId: string;
  clientName: string;
  detail: string;
  duties: string;
  other: string;
}

export interface FoldPlan {
  entries: FoldEntryPlan[];
  /** Appended to `Handover.details` — the lines that belong to no client. */
  orphanDetails: string;
  /** Rows consumed by the fold. Deleting them is what makes it self-terminating. */
  consumedIds: string[];
}

/** One line of prose from an item: its headline, then its body. */
function asParagraph(item: FoldItem): string {
  const bits = [item.title.trim()];
  if (item.detail?.trim()) bits.push(item.detail.trim());
  // Cadence and channel are DUTY-only and would otherwise be lost, since the new
  // shape has no field for them — they belong in the sentence.
  const meta = [item.cadence?.trim(), item.channel?.trim()].filter(Boolean).join(" · ");
  if (meta) bits.push(`(${meta})`);
  return bits.filter(Boolean).join("\n");
}

function join(existing: string | null, addition: string): string {
  const a = existing?.trim() ?? "";
  if (!a) return addition;
  if (!addition) return a;
  return `${a}\n\n${addition}`;
}

/**
 * Does this handover still hold rows in the old shape?
 *
 * The fold is self-terminating: it consumes every non-CLIENT row, so once it has
 * run there is nothing left to match and a read costs one already-loaded check.
 */
export function needsFold(items: FoldItem[]): boolean {
  return items.some((i) => i.kind !== "CLIENT");
}

export function planFold(items: FoldItem[]): FoldPlan {
  const byClient = new Map<string, FoldItem[]>();
  const orphans: FoldItem[] = [];

  for (const item of items) {
    if (item.clientId) {
      const list = byClient.get(item.clientId) ?? [];
      list.push(item);
      byClient.set(item.clientId, list);
    } else if (item.kind !== "CLIENT") {
      orphans.push(item);
    }
  }

  const entries: FoldEntryPlan[] = [];
  const consumedIds: string[] = [];

  for (const [clientId, group] of byClient) {
    const existing = group.find((i) => i.kind === "CLIENT") ?? null;
    let detail = existing?.detail?.trim() ?? "";
    let duties = existing?.duties?.trim() ?? "";
    let other = existing?.other?.trim() ?? "";

    // The old CLIENT row's title was a headline sentence, not a name. Merge it into
    // the paragraph, because after the fold `title` is only the client's name.
    if (existing && existing.title.trim() && existing.title.trim() !== existing.clientName?.trim()) {
      detail = join(existing.title.trim(), detail);
    }

    for (const item of group) {
      if (item.id === existing?.id) continue;
      consumedIds.push(item.id);
      const para = asParagraph(item);
      if (item.kind === "DUTY") duties = join(duties, para);
      else other = join(other, para);
    }

    entries.push({
      id: existing?.id ?? null,
      clientId,
      clientName: existing?.clientName ?? group.find((i) => i.clientName)?.clientName ?? "",
      detail,
      duties,
      other,
    });
  }

  for (const item of orphans) consumedIds.push(item.id);

  return {
    entries,
    orphanDetails: orphans.map(asParagraph).join("\n\n"),
    consumedIds,
  };
}

/**
 * Every scrap of text a fold moved, normalised for comparison.
 *
 * This is the guard that matters: a test folds a realistic set and asserts that
 * every word of the input survives somewhere in the output. Reading the code
 * cannot tell you that; comparing the text can.
 */
export function foldedText(plan: FoldPlan): string {
  const parts = plan.entries.flatMap((e) => [e.detail, e.duties, e.other]);
  parts.push(plan.orphanDetails);
  return parts.join("\n").replace(/\s+/g, " ").trim();
}
