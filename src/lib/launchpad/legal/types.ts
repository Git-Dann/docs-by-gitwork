/**
 * Shared shape for the three boilerplate legal-doc generators.
 *
 * A generator owns its own question set, because the questions differ per document
 * (a cookie policy needs to know which cookie categories are set; a T&C needs to
 * know whether you sell anything). Answers live on `LaunchpadDoc.answers`, keyed by
 * these field ids.
 *
 * ⚠️ `template` markdown is rendered by the BLOCK renderer (`<Markdown>` in
 * `src/lib/markdown.tsx`), which draws `#`/`##`/`###` headings, ordered and
 * unordered nested lists, paragraphs and inline marks — and nothing else. A
 * heading must be alone in its block (blank line after it) or it renders as a
 * paragraph. Anything outside that subset prints VERBATIM to the client, which is
 * the trap ONBOARDING.md §4.7 exists for: teach the renderer first, in the same
 * change.
 */

import type { LaunchpadDocKey } from "@/types/launchpad";

export type LegalFieldType =
  | "short_text"
  | "long_text"
  | "email"
  | "url"
  | "select"
  | "checkbox";

export interface LegalFieldDef {
  /** Doubles as the merge token: `{{id}}` in the template. */
  id: string;
  label: string;
  type: LegalFieldType;
  helper?: string;
  placeholder?: string;
  options?: { id: string; label: string }[];
  /** Key in the server's PREFILL_SOURCES allow-list — never a raw column name. */
  prefillKey?: string;
  /** Listed in `missing` until answered, and its token stays visible in the body. */
  required?: boolean;
  /** Grid width hint for the answer form. */
  width?: "full" | "half";
  /**
   * Render a newline-separated answer as markdown bullets. For the "one per line"
   * questions (what data you collect, which cookies you set) — without it the
   * answer lands as one run-on paragraph, which is the exact defect CLAUDE.md §41
   * describes for document text fields.
   */
  renderAs?: "list";
  /**
   * Fall back to another field's answer when this one is blank. Used for
   * `trading_name` → `company_name`: a client with no separate trading name should
   * read as their legal name, not as a hole in the sentence.
   */
  fallbackId?: string;
  /**
   * What an OPTIONAL blank renders as. Defaults to "" — which, combined with the
   * empty-line drop in `render.ts`, is why the convention below matters.
   */
  emptyText?: string;
}

export interface LegalDocGenerator {
  key: LaunchpadDocKey;
  title: string;
  /** One line on what this document is for, shown above the questions. */
  summary: string;
  fields: LegalFieldDef[];
  /**
   * Markdown with `{{token}}` placeholders resolved from answers.
   *
   * ⚠️ Two template conventions the renderer depends on:
   *   1. A heading (`#`, `##`) must be ALONE in its block — blank line after it —
   *      or the block renderer draws it as a paragraph.
   *   2. An OPTIONAL token sits on its OWN LINE. A blank optional resolves to
   *      nothing and its line is dropped, so an optional token buried inline in a
   *      paragraph would take the whole paragraph with it.
   */
  template: string;
  /**
   * `## Heading` text → the answer field id that gates it. The section renders only
   * when that answer is given (checkbox ticked, or a non-empty string), so a client
   * who sets no marketing cookies gets no empty "Marketing cookies" clause.
   *
   * Gating is DATA rather than a `{{#if}}` syntax because the body goes through the
   * app's own Markdown renderer, which would print an unknown directive verbatim to
   * the client (ONBOARDING.md §4.7).
   */
  sectionGates?: Record<string, string>;
}
