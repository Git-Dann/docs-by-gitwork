/**
 * Recording a deal that didn't come from Docs: a PDF from the client, a proposal written
 * elsewhere, a call. It's saved as an accepted document with cost lines, so the Money page
 * (src/lib/money.ts) reads it exactly like any other won document. No new data model.
 *
 * Pure: the shape, the checks, how a deal becomes cost lines, and how an AI reading of a file is
 * cleaned up before anyone sees it. Nothing read from a file is saved until a person confirms it.
 */

import { ROLE_LINE_PREFIXES } from "@/lib/money";

export type DealLineKind = "monthly" | "once" | "ongoing";

export interface DealLine {
  label: string;
  kind: DealLineKind;
  /** Per month for monthly and ongoing; the whole amount for once. Before VAT. */
  amount: number;
  /** Monthly only. */
  months: number | null;
  /** From a file: true when the amount appears in the file's text, so it can be trusted more. */
  foundInFile?: boolean;
}

export interface DealInput {
  clientId: string;
  title: string;
  /** YYYY-MM-DD. */
  wonOn: string;
  currency: string;
  lines: DealLine[];
  source: { kind: "manual" } | { kind: "file"; fileName: string };
}

export const DEAL_LIMITS = { lines: 40, title: 160, label: 120, months: 120, amount: 10_000_000 } as const;
export const DEAL_CURRENCIES = ["GBP", "USD", "EUR"] as const;
export const DEAL_LABEL = "Recorded deal";

/** Every problem with a deal, as sentences. Empty means it can be saved. */
export function dealProblems(d: DealInput, today: Date = new Date()): string[] {
  const out: string[] = [];
  if (!d.clientId) out.push("Choose the client.");
  if (!d.title.trim()) out.push("Give the deal a name.");
  if (d.title.length > DEAL_LIMITS.title) out.push(`Keep the name under ${DEAL_LIMITS.title} characters.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.wonOn) || Number.isNaN(Date.parse(`${d.wonOn}T00:00:00Z`))) {
    out.push("Give the date it was agreed.");
  } else if (Date.parse(`${d.wonOn}T00:00:00Z`) > today.getTime() + 86_400_000) {
    out.push("The date it was agreed can't be in the future.");
  }
  if (!(DEAL_CURRENCIES as readonly string[]).includes(d.currency)) out.push("Choose GBP, USD or EUR.");
  if (d.lines.length === 0) out.push("Add at least one amount.");
  if (d.lines.length > DEAL_LIMITS.lines) out.push(`Keep it to ${DEAL_LIMITS.lines} lines.`);
  d.lines.forEach((l, i) => {
    const n = `Line ${i + 1}`;
    if (!l.label.trim()) out.push(`${n} needs a name.`);
    if (!(Number.isFinite(l.amount) && l.amount > 0 && l.amount <= DEAL_LIMITS.amount)) out.push(`${n} needs an amount above zero.`);
    if (l.kind === "monthly" && !(Number.isInteger(l.months) && (l.months ?? 0) >= 1 && (l.months ?? 0) <= DEAL_LIMITS.months)) {
      out.push(`${n} needs a number of months (1 to ${DEAL_LIMITS.months}).`);
    }
  });
  return out;
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "line"
  );
}

export interface CostLineCreate {
  category: string;
  itemName: string;
  description: string | null;
  quantity: number;
  unitCost: number;
  subtotal: number;
  costKind: "ONE_OFF" | "RECURRING";
  sortOrder: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * A deal as cost lines the Money rules read back the same way: monthly lines carry a role
 * prefix (rate × months), one-offs don't, ongoing ones are RECURRING.
 */
export function dealCostLines(d: DealInput): CostLineCreate[] {
  return d.lines.map((l, i) => {
    const label = l.label.trim().slice(0, DEAL_LIMITS.label);
    const amount = round2(l.amount);
    if (l.kind === "monthly") {
      const months = l.months ?? 1;
      return {
        category: label,
        itemName: `${ROLE_LINE_PREFIXES[2]}${slug(label)}`,
        description: null,
        quantity: months,
        unitCost: amount,
        subtotal: round2(amount * months),
        costKind: "ONE_OFF",
        sortOrder: i,
      };
    }
    return {
      category: label,
      itemName: label,
      description: null,
      quantity: 1,
      unitCost: amount,
      subtotal: amount,
      costKind: l.kind === "ongoing" ? "RECURRING" : "ONE_OFF",
      sortOrder: i,
    };
  });
}

/** What a deal is worth, the same way the Money page will count it. */
export function dealTotal(lines: DealLine[]): number {
  return round2(
    lines.reduce((sum, l) => {
      if (!(l.amount > 0)) return sum;
      if (l.kind === "monthly") return sum + l.amount * (l.months ?? 0);
      if (l.kind === "ongoing") return sum + l.amount * 12;
      return sum + l.amount;
    }, 0),
  );
}

// ── Reading a file ──────────────────────────────────────────────────────────────

export interface DealDraft {
  title: string;
  clientName: string | null;
  currency: string | null;
  wonOn: string | null;
  lines: DealLine[];
  /** Plain-language notes on anything the reader wasn't sure of. */
  notes: string[];
}

/** Every way an amount could be written in a document: 12500, 12,500, 12,500.00, 12.5k. */
function amountSpellings(n: number): string[] {
  const whole = Math.round(n);
  const out = new Set<string>([String(whole), whole.toLocaleString("en-GB"), n.toFixed(2), n.toLocaleString("en-GB", { minimumFractionDigits: 2 })]);
  if (whole >= 1000 && whole % 100 === 0) out.add(`${whole / 1000}k`);
  return [...out];
}

/** Whether an amount is written in the text, so a figure the reader made up is caught. */
export function amountInText(amount: number, text: string): boolean {
  const flat = text.replace(/\s+/g, " ").toLowerCase();
  return amountSpellings(amount).some((s) => {
    const esc = s.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^0-9.,])${esc}(?![0-9])`).test(flat);
  });
}

/**
 * Cleans an AI reading of a file into a draft. Anything malformed is dropped; every amount is
 * checked against the file's text and marked, so the person confirming can see which figures
 * came from the page and which the reader worked out.
 */
export function parseDealDraft(raw: unknown, sourceText: string): DealDraft {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const currency = str(o.currency, 3).toUpperCase();
  const wonOn = str(o.wonOn, 10);
  const notes = Array.isArray(o.notes) ? o.notes.map((n) => str(n, 200)).filter(Boolean).slice(0, 6) : [];
  const lines: DealLine[] = [];
  for (const l of Array.isArray(o.lines) ? o.lines.slice(0, DEAL_LIMITS.lines) : []) {
    if (!l || typeof l !== "object") continue;
    const r = l as Record<string, unknown>;
    const kind: DealLineKind = r.kind === "monthly" || r.kind === "ongoing" ? r.kind : "once";
    const amount = typeof r.amount === "number" ? r.amount : Number(String(r.amount ?? "").replace(/[^0-9.]/g, ""));
    if (!(Number.isFinite(amount) && amount > 0)) continue;
    const months = kind === "monthly" ? Math.round(Number(r.months)) : null;
    lines.push({
      label: str(r.label, DEAL_LIMITS.label) || "Untitled line",
      kind,
      amount: round2(amount),
      months: kind === "monthly" && Number.isFinite(months) && (months ?? 0) >= 1 ? months : null,
      foundInFile: amountInText(amount, sourceText),
    });
  }
  const unchecked = lines.filter((l) => !l.foundInFile).length;
  if (unchecked > 0) notes.push(`${unchecked} ${unchecked === 1 ? "amount isn't" : "amounts aren't"} written in the file as shown. Check ${unchecked === 1 ? "it" : "them"} before saving.`);
  return {
    title: str(o.title, DEAL_LIMITS.title),
    clientName: str(o.clientName, 120) || null,
    currency: (DEAL_CURRENCIES as readonly string[]).includes(currency) ? currency : null,
    wonOn: /^\d{4}-\d{2}-\d{2}$/.test(wonOn) ? wonOn : null,
    lines,
    notes,
  };
}

export const DEAL_READER_SYSTEM = `You read commercial documents (proposals, quotes, statements of work, order forms, contracts) for a software agency and pull out what the client agreed to pay.

Return ONLY a JSON object:
{
  "title": short name for the deal,
  "clientName": the client's company name, or null,
  "currency": "GBP" | "USD" | "EUR" | null,
  "wonOn": "YYYY-MM-DD" date it was signed or agreed, or null if not stated,
  "lines": [ { "label": what it's for, "kind": "monthly" | "once" | "ongoing", "amount": number, "months": number or null } ],
  "notes": [ short sentences about anything uncertain ]
}

Rules:
1. "monthly" = a fee per month for a stated number of months (a developer at £X a month for N months). Put the monthly figure in amount and N in months.
2. "once" = a fixed price paid once (a project fee, a workshop, setup).
3. "ongoing" = a monthly fee with no end date (a retainer, support).
4. Amounts are before VAT. If only a VAT-inclusive total is given, say so in notes and give the figure before VAT.
5. Never add up, invent or estimate an amount the document doesn't state. If a total and its parts are both given, use the parts and don't repeat the total.
6. If the document doesn't say something, use null and say so in notes. Never guess a date.`;
