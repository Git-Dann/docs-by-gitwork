/**
 * Deterministic legal-doc rendering. No AI — a fixed answer map always produces
 * byte-identical markdown, which is what makes these safe to show a client and
 * cheap to re-render on every read.
 *
 * ⚠️ The TEMPLATE banner is returned as its own field, NOT spliced into `body`.
 * That is deliberate and load-bearing: a client can edit the body (which is the
 * point — they hand a filled draft to their lawyer), and a banner living inside
 * the markdown would be one backspace away from a document that reads as finished
 * legal advice. Keeping it out of `body` means no edit and no `bodyOverride` can
 * remove it, while the panel still renders one banner rather than two.
 */

import { applyMergeVariables } from "@/lib/merge-variables";
import type { LaunchpadAnswers, LaunchpadDocKey } from "@/types/launchpad";
import { LAUNCHPAD_DOC_KEYS } from "@/types/launchpad";
import type { LegalDocGenerator, LegalFieldDef } from "./types";
import { cookieGenerator } from "./cookie";
import { privacyGenerator } from "./privacy";
import { termsGenerator } from "./terms";

/**
 * The red banner every generated doc carries. Wording is deliberately blunt about
 * all three things a reader needs to know: it is a template, it is not advice, and
 * a lawyer has to see it.
 */
export const LAUNCHPAD_LEGAL_BANNER =
  "TEMPLATE — a starting point, not legal advice. Have your lawyer review this before you publish it.";

export const LEGAL_GENERATORS: Record<LaunchpadDocKey, LegalDocGenerator> = {
  cookie: cookieGenerator,
  terms: termsGenerator,
  privacy: privacyGenerator,
};

export function isLaunchpadDocKey(value: unknown): value is LaunchpadDocKey {
  return typeof value === "string" && (LAUNCHPAD_DOC_KEYS as readonly string[]).includes(value);
}

export function legalGenerator(key: LaunchpadDocKey): LegalDocGenerator {
  return LEGAL_GENERATORS[key];
}

// ─── Answer resolution ────────────────────────────────────────────────────────

function rawString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "boolean") return value ? "true" : "";
  if (Array.isArray(value)) return value.map(String).join("\n");
  return String(value);
}

/** True when an answer counts as given — the gate rule for a conditional section. */
export function isAnswered(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  return rawString(value).trim().length > 0;
}

/** Turn a newline-separated answer into markdown bullets. Already-bulleted lines
 *  are left alone so a client who typed `- ` themselves doesn't get `- - item`. */
function asList(value: string): string {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => (/^([-*]|\d+\.)\s/.test(line) ? line : `- ${line}`))
    .join("\n");
}

/** A `select` renders its option LABEL, never its id — `{{consent_approach}}` has
 *  to read "Consent banner before non-essential cookies are set", not "banner". */
function resolveField(def: LegalFieldDef, answers: LaunchpadAnswers): string {
  const raw = rawString(answers[def.id]).trim();
  if (def.type === "select") {
    const match = def.options?.find((o) => o.id === raw);
    return match ? match.label : raw;
  }
  if (def.type === "checkbox") return raw ? "Yes" : "";
  if (def.renderAs === "list" && raw) return asList(raw);
  return raw;
}

const TOKEN_RE = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

/**
 * Line-aware substitution.
 *
 * A line is DROPPED when every token on it resolved to nothing — which is what
 * lets an optional unanswered field disappear cleanly instead of leaving
 * "VAT registration number:" hanging in a contract. Testing for a
 * punctuation-only leftover (the obvious first approach) cannot see that case at
 * all, because the label is ordinary prose.
 *
 * A line survives when it carries at least one token that DID resolve, or a
 * required token still showing as `{{token}}` — a visible gap has to stay visible.
 * That is why the template convention is "optional tokens sit on their own line":
 * an optional token buried in a paragraph is simply substituted away and the
 * paragraph is kept, since its other tokens resolved.
 */
function substituteLines(markdown: string, vars: Record<string, string>): string {
  return markdown
    .split("\n")
    .filter((line) => {
      const tokens = [...line.matchAll(TOKEN_RE)].map((m) => m[1].toLowerCase());
      if (tokens.length === 0) return true;
      // A token absent from `vars` is a REQUIRED one left deliberately unresolved,
      // so it counts as content — the client must see the hole.
      return tokens.some((t) => !(t in vars) || vars[t] !== "");
    })
    .map((line) => applyMergeVariables(line, vars))
    .join("\n");
}

/**
 * Split into `## `-headed sections and drop any whose gate answer is unanswered.
 *
 * Sections are gated as DATA (`sectionGates`) rather than by inventing a
 * conditional syntax, because the body is rendered by the app's own Markdown
 * renderer and a `{{#if}}` would print verbatim to the client — the trap
 * ONBOARDING.md §4.7 describes. Everything before the first `## ` is preamble and
 * always survives.
 */
function applySectionGates(
  markdown: string,
  gates: Record<string, string> | undefined,
  answers: LaunchpadAnswers,
): string {
  if (!gates || Object.keys(gates).length === 0) return markdown;

  const lines = markdown.split("\n");
  const out: string[] = [];
  let skipping = false;

  for (const line of lines) {
    const heading = /^##\s+(.*)$/.exec(line.trim());
    if (heading) {
      const gateField = gates[heading[1].trim()];
      skipping = gateField !== undefined && !isAnswered(answers[gateField]);
      if (skipping) continue;
    }
    if (!skipping) out.push(line);
  }

  return out.join("\n");
}

/** Collapse the 3+ blank lines a dropped section leaves behind. */
function tidyBlankRuns(markdown: string): string {
  return markdown.replace(/\n{3,}/g, "\n\n").trim();
}

// ─── The render ───────────────────────────────────────────────────────────────

export interface RenderedLegalDoc {
  key: LaunchpadDocKey;
  title: string;
  /** Always `LAUNCHPAD_LEGAL_BANNER`. Never part of `body` — see the file header. */
  banner: string;
  /** Resolved markdown, for the block `<Markdown>` renderer. */
  body: string;
  /** Labels of required fields still unanswered. Their `{{token}}` stays visible in
   *  the body on purpose, so an unfinished draft looks unfinished rather than
   *  plausibly complete. */
  missing: string[];
}

/**
 * Render one doc from a fixed answer map. Pure and deterministic — same answers in,
 * same markdown out, every time.
 *
 * Two asymmetric rules on unanswered fields, and the asymmetry is the point:
 *   · **required** + blank → the `{{token}}` stays VISIBLE and the label lands in
 *     `missing`. A gap the client must see.
 *   · **optional** + blank → substituted away, and its line dropped if that leaves
 *     nothing. A gap nobody needs to see.
 */
export function renderLegalDoc(
  key: LaunchpadDocKey,
  answers: LaunchpadAnswers = {},
): RenderedLegalDoc {
  const generator = legalGenerator(key);
  const vars: Record<string, string> = {};
  const missing: string[] = [];

  for (const def of generator.fields) {
    let value = resolveField(def, answers);

    /**
     * A fallback chain that terminates in a REQUIRED-and-blank field inherits that
     * field's treatment — the token stays visible rather than being substituted away.
     *
     * ⚠️ Without this, `**{{trading_name}}**` on a wholly unanswered cookie policy
     * rendered as a literal `****`: `trading_name` is optional, its fallback
     * (`company_name`) was also blank, so it resolved to "" and left its own emphasis
     * markers orphaned on the page. The line survived because it also carries
     * `{{website_url}}`, which is required and correctly left visible — so the
     * empty-line rule could not save it either. Caught by screenshotting the demo,
     * not by any detector.
     */
    let fallbackRequired = false;
    if (!value && def.fallbackId) {
      const fallbackDef = generator.fields.find((f) => f.id === def.fallbackId);
      if (fallbackDef) {
        value = resolveField(fallbackDef, answers);
        if (!value) fallbackRequired = Boolean(fallbackDef.required);
      }
    }

    if (!value) {
      if (def.required || fallbackRequired) {
        // Leave the token unresolved so it renders visibly in the draft.
        if (def.required) missing.push(def.label);
        continue;
      }
      vars[def.id] = def.emptyText ?? "";
      continue;
    }
    vars[def.id] = value;
  }

  const gated = applySectionGates(generator.template, generator.sectionGates, answers);
  const body = tidyBlankRuns(substituteLines(gated, vars));

  return { key, title: generator.title, banner: LAUNCHPAD_LEGAL_BANNER, body, missing };
}

/** The question set a doc panel asks, for the answer form. */
export function legalDocFields(key: LaunchpadDocKey): LegalFieldDef[] {
  return legalGenerator(key).fields;
}
