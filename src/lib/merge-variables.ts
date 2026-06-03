/**
 * Merge variables (Phase 3).
 *
 * Operators type tokens like `{{client_name}}` or `{{total}}` into any text field; the preview,
 * public share page, and PDF substitute the live value at render time. Tokens are NEVER persisted
 * resolved — the stored data keeps `{{client_name}}` so a renamed client re-resolves everywhere.
 *
 * Framework-free (no React/Prisma) so it's shared by the server (public page, PDF) and the client
 * (editor live preview). Unknown tokens are left visible so a typo is obvious rather than silently
 * blank.
 */

import type { ProposalDocument } from "@/types/proposal";

export interface MergeVariableDef {
  token: string; // canonical, e.g. "client_name"
  label: string;
  sample: string;
}

/** The catalog shown in the editor's insert menu. Aliases (below) also resolve but aren't listed. */
export const MERGE_VARIABLES: MergeVariableDef[] = [
  { token: "client_name", label: "Client name", sample: "Acme Ltd" },
  { token: "product_name", label: "Product / project", sample: "Acme Portal" },
  { token: "document_number", label: "Document number", sample: "PROP-2026-014" },
  { token: "total", label: "Total cost", sample: "£85,000" },
  { token: "date", label: "Today's date", sample: "3 June 2026" },
  { token: "expiry_date", label: "Expiry date", sample: "30 June 2026" },
  { token: "owner", label: "Document owner", sample: "Dan Lindsay" },
  { token: "version", label: "Version", sample: "v1.0" },
];

function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(d);
}

function computeTotal(proposal: ProposalDocument): string {
  const items = proposal.costLineItems ?? [];
  if (items.length === 0) return "";
  const total = items.reduce((sum, item) => {
    const subtotal =
      typeof item.subtotal === "number" ? item.subtotal : (item.quantity ?? 0) * (item.unitCost ?? 0);
    return sum + (Number.isFinite(subtotal) ? subtotal : 0);
  }, 0);
  const costingSection = proposal.sections?.find((s) => s.key === "costing");
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

/** Compute the value map for a document. `nowIso` lets callers pin "today" deterministically. */
export function resolveMergeVariables(
  proposal: ProposalDocument,
  nowIso?: string,
): Record<string, string> {
  const metadata = proposal.metadata ?? null;
  const clientName = proposal.clientName || metadata?.client || "";
  const owner = metadata?.owner || "";
  const today = nowIso ?? new Date().toISOString();

  const base: Record<string, string> = {
    client_name: clientName,
    product_name: proposal.productName ?? "",
    document_number: proposal.documentNumber ?? "",
    total: computeTotal(proposal),
    date: formatDate(today),
    expiry_date: formatDate(proposal.expiresAt ?? null),
    owner,
    version: proposal.version ?? "",
  };

  // Aliases → canonical, so common variants Just Work.
  base.client = base.client_name;
  base.product = base.product_name;
  base.doc_number = base.document_number;
  base.total_cost = base.total;
  base.today = base.date;

  return base;
}

const TOKEN_RE = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

/** Replace `{{token}}` occurrences in a string. Unknown tokens are left untouched. */
export function applyMergeVariables(text: string, vars: Record<string, string>): string {
  if (!text || text.indexOf("{{") === -1) return text;
  return text.replace(TOKEN_RE, (match, name: string) => {
    const key = name.toLowerCase();
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match;
  });
}

function deepReplace<T>(value: T, fn: (s: string) => string): T {
  if (typeof value === "string") return fn(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => deepReplace(v, fn)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = deepReplace(v, fn);
    }
    return out as unknown as T;
  }
  return value;
}

/**
 * Return a deep copy of the proposal with every string value token-substituted. Values are read
 * from the ORIGINAL document first, so a section that prints `{{client_name}}` resolves correctly
 * even though clientName itself is also walked. Used by the render surfaces (preview / public /
 * PDF) — never to persist.
 */
export function resolveProposalMergeVariables(proposal: ProposalDocument, nowIso?: string): ProposalDocument {
  const vars = resolveMergeVariables(proposal, nowIso);
  // Nothing to do if no tokens appear anywhere — cheap guard avoids a needless deep clone.
  return deepReplace(proposal, (s) => applyMergeVariables(s, vars));
}
