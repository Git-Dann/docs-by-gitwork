/**
 * Document → HTML serializer for the Google Drive backup.
 *
 * Turns a `ProposalDocument` (from `serializeProposal`) into a clean, self-contained HTML string
 * that Google Drive imports and converts into a native, editable Google Doc (upload with
 * `mimeType: "application/vnd.google-apps.document"` — see `google-drive-backup.ts`).
 *
 * Deliberately NOT the styled `ProposalPreview`/PDF render: those carry Tailwind/CSS-variable
 * classes and a heavy layout that convert into messy Google Docs. This produces plain semantic
 * HTML (headings, paragraphs, lists, tables) that Docs maps cleanly onto its own styles, and it
 * works for drafts (no share/token required).
 *
 * XSS-safe: every text value is HTML-escaped and only a safe Markdown subset (bold/italic/code/
 * links/lists/headings) is expanded — no raw HTML passthrough. `safeUrl` (shared with the public
 * Markdown renderer) sanitises every href/src.
 */

import { safeUrl } from "@/lib/markdown";
import type {
  CostingSectionData,
  DocumentType,
  ProposalDocument,
  ProposalSection,
} from "@/types/proposal";

// ── Escaping ──────────────────────────────────────────────────────────────

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

// ── Minimal Markdown → HTML (mirrors src/lib/markdown.tsx's safe subset) ─────

// Precedence: link → bold → italic (*) → italic (_) → inline code.
const INLINE_RE = /(\[[^\]]+\]\([^)\s]+\))|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(_[^_\n]+_)|(`[^`\n]+`)/;

function renderInline(text: string): string {
  let out = "";
  let rest = text;
  while (rest.length) {
    const m = rest.match(INLINE_RE);
    if (!m || m.index === undefined) {
      out += escapeHtml(rest);
      break;
    }
    if (m.index > 0) out += escapeHtml(rest.slice(0, m.index));
    const token = m[0];
    if (token.startsWith("[")) {
      const lm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
      const href = lm ? safeUrl(lm[2]) : null;
      out += lm && href ? `<a href="${escapeAttr(href)}">${escapeHtml(lm[1])}</a>` : escapeHtml(lm?.[1] ?? token);
    } else if (token.startsWith("**")) {
      out += `<strong>${escapeHtml(token.slice(2, -2))}</strong>`;
    } else if (token.startsWith("*")) {
      out += `<em>${escapeHtml(token.slice(1, -1))}</em>`;
    } else if (token.startsWith("_")) {
      out += `<em>${escapeHtml(token.slice(1, -1))}</em>`;
    } else if (token.startsWith("`")) {
      out += `<code>${escapeHtml(token.slice(1, -1))}</code>`;
    }
    rest = rest.slice(m.index + token.length);
  }
  return out;
}

/** Block-level Markdown → HTML string. `baseLevel` shifts headings so they nest under the doc <h1>. */
function markdownToHtml(md: string | null | undefined, baseLevel = 2): string {
  const text = (md ?? "").replace(/\r\n/g, "\n");
  const blocks = text
    .split(/\n{2,}/)
    .map((b) => b.replace(/\s+$/, ""))
    .filter((b) => b.trim().length > 0);
  if (blocks.length === 0) return "";

  return blocks
    .map((block) => {
      const lines = block.split("\n");
      const heading = /^(#{1,6})\s+(.*)$/.exec(block.trim());
      if (heading && lines.length === 1) {
        const level = Math.min(baseLevel + heading[1].length - 1, 6);
        return `<h${level}>${renderInline(heading[2])}</h${level}>`;
      }
      if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
        return `<ul>${lines.map((l) => `<li>${renderInline(l.replace(/^\s*[-*]\s+/, ""))}</li>`).join("")}</ul>`;
      }
      if (lines.every((l) => /^\s*\d+\.\s+/.test(l))) {
        return `<ol>${lines.map((l) => `<li>${renderInline(l.replace(/^\s*\d+\.\s+/, ""))}</li>`).join("")}</ol>`;
      }
      return `<p>${lines.map(renderInline).join("<br>")}</p>`;
    })
    .join("\n");
}

// ── Generic value rendering ─────────────────────────────────────────────────

// Structural / internal keys that carry no reader value in a backup.
const SKIP_KEYS = new Set([
  "id",
  "sortOrder",
  "included",
  "coverStyle",
  "brandLockup",
  "assignmentTimelineMode",
  "aspectRatio",
  "polarity",
  "confidentialityMode",
  "showBrandingBlock",
]);

function isImageKey(key: string): boolean {
  return /(image|graphic|logo|hero|thumb|avatar|photo)/i.test(key);
}

function humanize(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function scalarToHtml(value: unknown): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return renderInline(String(value));
}

/** Render an array of like-shaped objects as a table (falls back to stacked blocks if heterogeneous). */
function objectsToTable(items: Record<string, unknown>[]): string {
  const keys: string[] = [];
  for (const item of items) {
    for (const k of Object.keys(item)) {
      if (SKIP_KEYS.has(k)) continue;
      if (items.every((it) => isBlank(it[k]))) continue;
      if (!keys.includes(k)) keys.push(k);
    }
  }
  if (keys.length === 0) return "";

  // If any cell holds a nested array/object, a flat table would lose it — stack blocks instead.
  const hasComplexCell = items.some((it) => keys.some((k) => Array.isArray(it[k]) || isPlainObject(it[k])));
  if (hasComplexCell) {
    return items.map((it) => `<div>${renderObjectFields(it)}</div>`).join("");
  }

  const head = keys.map((k) => `<th>${escapeHtml(humanize(k))}</th>`).join("");
  const body = items
    .map((it) => `<tr>${keys.map((k) => `<td>${isBlank(it[k]) ? "" : scalarToHtml(it[k])}</td>`).join("")}</tr>`)
    .join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function arrayToHtml(items: unknown[], key: string): string {
  if (items.length === 0) return "";
  if (items.every((i) => typeof i === "string" || typeof i === "number")) {
    return `<ul>${items.map((i) => `<li>${scalarToHtml(i)}</li>`).join("")}</ul>`;
  }
  if (items.every(isPlainObject)) {
    return objectsToTable(items as Record<string, unknown>[]);
  }
  // Mixed — render each item on its own.
  return items.map((i) => renderValue(i, key)).join("");
}

function renderValue(value: unknown, key: string): string {
  if (isBlank(value)) return "";
  if (typeof value === "string") {
    if (isImageKey(key)) {
      const src = safeUrl(value);
      return src ? `<p><img src="${escapeAttr(src)}" alt="${escapeAttr(humanize(key))}" /></p>` : "";
    }
    return markdownToHtml(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return `<p>${scalarToHtml(value)}</p>`;
  }
  if (Array.isArray(value)) return arrayToHtml(value, key);
  if (isPlainObject(value)) return renderObjectFields(value);
  return "";
}

/** Render an object's fields: scalars as labelled paragraphs, arrays/objects under a sub-heading. */
function renderObjectFields(obj: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (SKIP_KEYS.has(key) || isBlank(value)) continue;
    const label = humanize(key);
    if (typeof value === "string" && !isImageKey(key)) {
      // Multiline / markdown strings get a sub-heading; short one-liners stay inline.
      if (value.includes("\n")) {
        parts.push(`<h3>${escapeHtml(label)}</h3>${markdownToHtml(value, 3)}`);
      } else {
        parts.push(`<p><strong>${escapeHtml(label)}:</strong> ${renderInline(value)}</p>`);
      }
    } else if (typeof value === "number" || typeof value === "boolean") {
      parts.push(`<p><strong>${escapeHtml(label)}:</strong> ${scalarToHtml(value)}</p>`);
    } else {
      const inner = renderValue(value, key);
      if (inner) parts.push(`<h3>${escapeHtml(label)}</h3>${inner}`);
    }
  }
  return parts.join("");
}

// ── Section-specific rendering ───────────────────────────────────────────────

const CURRENCY_SYMBOL: Record<string, string> = { GBP: "£", USD: "$", EUR: "€" };

function formatMoney(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOL[currency] ?? "";
  return `${symbol}${amount.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/** Cost breakdown table built from the document's cost line items (not the section JSON). */
function renderCostTable(doc: ProposalDocument, currency: string): string {
  if (doc.costLineItems.length === 0) return "";
  const rows = doc.costLineItems
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.category ?? "")}</td><td>${escapeHtml(item.itemName ?? "")}</td>` +
        `<td>${escapeHtml(item.description ?? "")}</td><td>${item.quantity}</td>` +
        `<td>${escapeHtml(formatMoney(item.unitCost, currency))}</td>` +
        `<td>${escapeHtml(formatMoney(item.subtotal, currency))}</td>` +
        `<td>${item.costKind === "RECURRING" ? "Recurring" : "One-off"}</td></tr>`,
    )
    .join("");
  const total = doc.costLineItems.reduce((sum, i) => sum + (i.subtotal || 0), 0);
  return (
    `<table><thead><tr><th>Category</th><th>Item</th><th>Description</th><th>Qty</th>` +
    `<th>Unit</th><th>Subtotal</th><th>Type</th></tr></thead><tbody>${rows}` +
    `<tr><td colspan="5"></td><td><strong>${escapeHtml(formatMoney(total, currency))}</strong></td><td></td></tr>` +
    `</tbody></table>`
  );
}

/** Timeline rendered from the document's timeline phases (not the section JSON). */
function renderTimeline(doc: ProposalDocument): string {
  if (doc.timelinePhases.length === 0) return "";
  return doc.timelinePhases
    .map((phase) => {
      const heading = `<h3>${escapeHtml(phase.name)}${phase.duration ? ` — ${escapeHtml(phase.duration)}` : ""}</h3>`;
      const summary = phase.summary ? markdownToHtml(phase.summary, 3) : "";
      const deliverables =
        phase.deliverables.length > 0
          ? `<ul>${phase.deliverables.map((d) => `<li>${renderInline(d)}</li>`).join("")}</ul>`
          : "";
      return `${heading}${summary}${deliverables}`;
    })
    .join("");
}

function renderSection(section: ProposalSection, doc: ProposalDocument): string {
  const data = (section.data ?? {}) as unknown as Record<string, unknown>;

  switch (section.key) {
    case "divider":
      return data.variant === "page-break" ? "" : "<hr />";

    case "heading": {
      const level = data.level === "h1" ? 2 : data.level === "h3" ? 4 : 3;
      const eyebrow = typeof data.eyebrow === "string" && data.eyebrow.trim() ? `<p><em>${renderInline(data.eyebrow)}</em></p>` : "";
      const text = typeof data.text === "string" ? renderInline(data.text) : "";
      return `${eyebrow}<h${level}>${text}</h${level}>`;
    }

    case "prose":
      return `<h2>${escapeHtml(section.title)}</h2>${markdownToHtml(typeof data.content === "string" ? data.content : "")}`;

    case "image": {
      const src = typeof data.url === "string" ? safeUrl(data.url) : null;
      if (!src) return "";
      const cap = typeof data.caption === "string" && data.caption.trim() ? `<p><em>${renderInline(data.caption)}</em></p>` : "";
      const alt = typeof data.altText === "string" ? data.altText : section.title;
      return `<h2>${escapeHtml(section.title)}</h2><p><img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" /></p>${cap}`;
    }

    case "cover": {
      // Title/product/client already live in the document header — render only the extra cover copy.
      const rest: Record<string, unknown> = { ...data };
      for (const k of ["proposalTitle", "productName", "clientName", "brandLogoUrl", "clientLogoUrl"]) delete rest[k];
      const body = renderObjectFields(rest);
      return body ? `<h2>${escapeHtml(section.title)}</h2>${body}` : "";
    }

    case "timeline":
      return `<h2>${escapeHtml(section.title)}</h2>${renderTimeline(doc)}`;

    case "costing": {
      const costing = data as unknown as Partial<CostingSectionData>;
      const currency = costing.currency ?? "GBP";
      const narrative = renderObjectFields({
        totalCostLabel: costing.totalCostLabel,
        monthlyCostSummary: costing.monthlyCostSummary,
        durationSummary: costing.durationSummary,
        supportingNarrative: costing.supportingNarrative,
        paymentTerms: costing.paymentTerms,
        additionalNotes: costing.additionalNotes,
      });
      return `<h2>${escapeHtml(section.title)}</h2>${narrative}${renderCostTable(doc, currency)}`;
    }

    default: {
      const body = renderObjectFields(data);
      return body ? `<h2>${escapeHtml(section.title)}</h2>${body}` : `<h2>${escapeHtml(section.title)}</h2>`;
    }
  }
}

// ── Trailing sections (relational data not tied to a specific section) ───────

function renderLinks(doc: ProposalDocument): string {
  if (doc.links.length === 0) return "";
  const items = doc.links
    .map((l) => {
      const href = safeUrl(l.url);
      const label = escapeHtml(l.label || l.url);
      const link = href ? `<a href="${escapeAttr(href)}">${label}</a>` : label;
      const notes = l.notes ? ` — ${renderInline(l.notes)}` : "";
      return `<li>${link}${notes}</li>`;
    })
    .join("");
  return `<h2>Links &amp; resources</h2><ul>${items}</ul>`;
}

function renderCtas(doc: ProposalDocument): string {
  if (doc.ctas.length === 0) return "";
  const items = doc.ctas
    .map((c) => {
      const href = safeUrl(c.destination);
      const label = escapeHtml(c.label || c.destination);
      return `<li>${href ? `<a href="${escapeAttr(href)}">${label}</a>` : label} (${escapeHtml(c.role.toLowerCase())})</li>`;
    })
    .join("");
  return `<h2>Calls to action</h2><ul>${items}</ul>`;
}

function renderAssets(doc: ProposalDocument): string {
  // Only standalone assets not already embedded via an image section.
  const imageable = doc.assets.filter((a) => a.url && safeUrl(a.url));
  if (imageable.length === 0) return "";
  const blocks = imageable
    .map((a) => {
      const src = safeUrl(a.url)!;
      const cap = a.caption ? `<p><em>${renderInline(a.caption)}</em></p>` : "";
      return `<p><img src="${escapeAttr(src)}" alt="${escapeAttr(a.altText || a.title || "asset")}" /></p>${cap}`;
    })
    .join("");
  return `<h2>Attachments</h2>${blocks}`;
}

// ── Public API ────────────────────────────────────────────────────────────

const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  PROPOSAL: "Proposal",
  SLA: "SLA",
  SOW: "Statement of Work",
  MSA: "Master Service Agreement",
  NDA: "NDA",
  CO: "Change Order",
  DSA: "Data Sharing Agreement",
  HANDOVER: "Handover",
  REPORT: "Report",
  BRIEF: "Brief",
  DECK: "Deck",
  OTHER: "Document",
};

/** Human-friendly Google Doc filename for a document. */
export function backupDocTitle(doc: {
  documentNumber?: string | null;
  title: string;
  clientName?: string | null;
  status: string;
}): string {
  const prefix = doc.documentNumber ? `${doc.documentNumber} — ` : "";
  const client = doc.clientName ? ` — ${doc.clientName}` : "";
  return `${prefix}${doc.title}${client} (${doc.status})`;
}

export interface RenderedDocument {
  title: string;
  html: string;
}

/**
 * Render a serialized document to a self-contained HTML string for Drive import → Google Doc.
 */
export function renderDocumentToHtml(doc: ProposalDocument): RenderedDocument {
  const title = backupDocTitle(doc);

  const metaBits = [
    doc.documentNumber ?? null,
    DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType,
    doc.clientName ? `Client: ${doc.clientName}` : null,
    `Version ${doc.version}`,
    `Status: ${doc.status}`,
    `Updated ${doc.updatedAt.slice(0, 10)}`,
  ]
    .filter((b): b is string => Boolean(b))
    .map(escapeHtml)
    .join(" · ");

  const sections = doc.sections
    .filter((s) => s.isVisible)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s) => renderSection(s, doc))
    .filter(Boolean)
    .join("\n");

  const summary = doc.summary ? markdownToHtml(doc.summary) : "";

  const body = [
    `<h1>${escapeHtml(doc.title)}</h1>`,
    `<p><em>${metaBits}</em></p>`,
    summary,
    sections,
    renderLinks(doc),
    renderCtas(doc),
    renderAssets(doc),
    `<hr /><p><em>Backed up automatically from Foundry by Gitwork. Edits made here are not synced back.</em></p>`,
  ]
    .filter(Boolean)
    .join("\n");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body>${body}</body></html>`;

  return { title, html };
}
