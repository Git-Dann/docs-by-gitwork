/**
 * Starter merge variables — live-insert client/document/Pulse-scan data into a Starter's prompt
 * before copying or downloading it. Sibling to `src/lib/merge-variables.ts` (same `{{token}}`
 * syntax, same `applyMergeVariables` substitution engine, reused here as-is), but NOT an extension
 * of it: Docs' resolver is hard-typed to "the current proposal" (a document always has exactly one
 * client). A Starter has no inherent client/document/scan — the user picks one per group in the
 * editor — so this module builds its own `Record<string,string>` per group instead.
 *
 * Session-only by design: nothing here ever persists back to `Starter.content.promptText`. This is
 * a scratch pad for one visit — reopening a starter later starts fresh from the stored template.
 *
 * Framework-free (no React) so it's usable from both the editor component and the download route.
 */

import { applyMergeVariables } from "@/lib/merge-variables";
import type { ClientListItem, ClientDetailFields, ClientPulseScanSummary } from "@/types/client";
import type { ProposalDocument } from "@/types/proposal";
import type { PulseScanRecord, PulseScanListItem } from "@/types/pulse";

export { applyMergeVariables };

export type StarterMergeGroup = "client" | "document" | "pulseScan";

export interface StarterMergeVariableDef {
  token: string;
  label: string;
}

export const STARTER_MERGE_GROUPS: Array<{
  group: StarterMergeGroup;
  label: string;
  tokens: StarterMergeVariableDef[];
}> = [
  {
    group: "client",
    label: "Client",
    tokens: [
      { token: "client_name", label: "Client name" },
      { token: "client_website", label: "Website" },
      { token: "client_contact_name", label: "Primary contact" },
      { token: "client_contact_email", label: "Primary contact email" },
      { token: "client_notes", label: "Notes" },
    ],
  },
  {
    group: "document",
    label: "Document",
    tokens: [
      { token: "doc_title", label: "Document title" },
      { token: "doc_product_name", label: "Product / project" },
      { token: "doc_total", label: "Total cost" },
      { token: "doc_timeline_summary", label: "Timeline summary" },
      { token: "doc_version", label: "Version" },
    ],
  },
  {
    group: "pulseScan",
    label: "Pulse scan",
    tokens: [
      { token: "scan_project_name", label: "Project name" },
      { token: "scan_health_score", label: "Health score" },
      { token: "scan_status", label: "Status" },
      { token: "scan_top_gap", label: "Top critical gap" },
    ],
  },
];

// ── Client ──────────────────────────────────────────────────────────────────────

/** Accepts the list-item shape (for a quick pick) or the fuller detail shape (once loaded). */
export function resolveClientTokens(
  client: ClientListItem & Partial<ClientDetailFields>,
): Record<string, string> {
  return {
    client_name: client.name ?? "",
    client_website: client.website ?? "",
    client_contact_name: client.primaryContactName ?? "",
    client_contact_email: client.primaryContactEmail ?? "",
    client_notes: client.notes ?? "",
  };
}

// ── Document ────────────────────────────────────────────────────────────────────

// Duplicated from merge-variables.ts's computeTotal (deliberately not extracted/shared — keeps
// this module and the Docs merge-variable system independent, per the "not touched" scope cut).
function computeDocTotal(doc: ProposalDocument): string {
  const items = doc.costLineItems ?? [];
  if (items.length === 0) return "";
  const total = items.reduce((sum, item) => {
    const subtotal =
      typeof item.subtotal === "number" ? item.subtotal : (item.quantity ?? 0) * (item.unitCost ?? 0);
    return sum + (Number.isFinite(subtotal) ? subtotal : 0);
  }, 0);
  const costingSection = doc.sections?.find((s) => s.key === "costing");
  const currency =
    (costingSection?.data as { currency?: string } | undefined)?.currency &&
    typeof (costingSection?.data as { currency?: string }).currency === "string"
      ? (costingSection!.data as { currency: string }).currency
      : "GBP";
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(total);
  } catch {
    return String(Math.round(total));
  }
}

function summarizeTimeline(doc: ProposalDocument): string {
  const phases = doc.timelinePhases ?? [];
  if (phases.length === 0) return "";
  return [...phases]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((p) => (p.duration ? `${p.name} (${p.duration})` : p.name))
    .join(" → ");
}

export function resolveDocumentTokens(doc: ProposalDocument): Record<string, string> {
  return {
    doc_title: doc.title ?? "",
    doc_product_name: doc.productName ?? "",
    doc_total: computeDocTotal(doc),
    doc_timeline_summary: summarizeTimeline(doc),
    doc_version: doc.version ?? "",
  };
}

// ── Pulse scan ──────────────────────────────────────────────────────────────────

type PulseScanLike = (PulseScanRecord | PulseScanListItem | ClientPulseScanSummary) & {
  llmAnalysis?: { criticalGaps?: Array<{ gap: string }> } | null;
};

export function resolvePulseTokens(scan: PulseScanLike): Record<string, string> {
  return {
    scan_project_name: scan.projectName ?? "",
    scan_health_score: scan.healthScore != null ? String(scan.healthScore) : "",
    scan_status: scan.status ?? "",
    scan_top_gap: scan.llmAnalysis?.criticalGaps?.[0]?.gap ?? "",
  };
}
