/**
 * What still needs doing before this document can go to a client.
 *
 * The Details page used to count things — "13 sections", "Checklists 10". A count is not
 * information: the outline already shows how many blocks there are, and no one has ever been
 * blocked from sending a document by not knowing it had eight written sections.
 *
 * This answers the question the page should answer: **is it ready, and if not, what's missing?**
 * Every finding names the block it is in, so it can be jumped to rather than hunted for.
 *
 * Pure and framework-free — no React, no Prisma, no network — so it is unit-testable and can run
 * on either side. It reads the serialized document only.
 */

export type ReadinessSeverity = "blocker" | "warning";

export interface ReadinessFinding {
  id: string;
  severity: ReadinessSeverity;
  label: string;
  /** What to do about it, in one line. */
  detail: string;
  /** The section key this lives in, when it is section-scoped — used to deep-link. */
  sectionKey?: string;
}

/** The unresolved-placeholder patterns that actually occur in this codebase's templates. */
const PLACEHOLDER_PATTERNS: Array<{ re: RegExp; what: string }> = [
  // The NDA template's own review markers, e.g. "[REVIEW] Authorised Gitwork signatory".
  { re: /\[REVIEW\]/i, what: "a [REVIEW] marker" },
  // Square-bracket fill-ins: "[company number]", "[registered office address]".
  { re: /\[[a-z][a-z0-9 ./'-]{2,40}\]/i, what: "an unfilled [placeholder]" },
  // Merge variables that were never resolved because nothing supplied a value.
  { re: /\{\{[a-z_]+\}\}/i, what: "an unresolved {{merge variable}}" },
];

/** The create-time default that older documents are still stamped with. */
const DEFAULT_OWNER = "Foundry Owner";

interface ReadinessInput {
  clientName?: string | null;
  expiresAt?: string | null;
  metadata?: { owner?: string | null } | null;
  sections: ReadonlyArray<{ key: string; title: string; isVisible: boolean; data: unknown }>;
}

/** Walk any JSON value and yield every string in it, so no field is missed as blocks evolve. */
function* strings(value: unknown): Generator<string> {
  if (typeof value === "string") {
    yield value;
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) yield* strings(item);
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) yield* strings(item);
  }
}

export function documentReadiness(document: ReadinessInput): ReadinessFinding[] {
  const findings: ReadinessFinding[] = [];
  const visible = document.sections.filter((section) => section.isVisible);

  if (!document.clientName?.trim()) {
    findings.push({
      id: "client",
      severity: "blocker",
      label: "No client named",
      detail: "The cover, parties and signature blocks all resolve from the document's client name.",
    });
  }

  const owner = document.metadata?.owner?.trim();
  if (!owner) {
    findings.push({
      id: "owner",
      severity: "warning",
      label: "No author named",
      detail: "“Prepared by” is blank on the cover.",
    });
  } else if (owner === DEFAULT_OWNER) {
    findings.push({
      id: "owner-default",
      severity: "warning",
      label: "Author is still the default",
      detail: `The cover says “${DEFAULT_OWNER}”. Set “Prepared by” to whoever actually wrote it.`,
    });
  }

  if (!document.expiresAt) {
    findings.push({
      id: "expiry",
      severity: "warning",
      label: "No expiry set",
      detail: "An open-ended offer can be accepted months later at the price you quoted today.",
    });
  }

  // Unresolved placeholders — reported once per block, naming the FIRST kind found, so a template
  // with forty brackets produces one actionable row per block rather than forty.
  for (const section of visible) {
    for (const { re, what } of PLACEHOLDER_PATTERNS) {
      const hit = [...strings(section.data)].find((text) => re.test(text));
      if (!hit) continue;
      findings.push({
        id: `placeholder:${section.key}`,
        severity: "blocker",
        label: `“${section.title}” still has ${what}`,
        detail: hit.trim().slice(0, 90),
        sectionKey: section.key,
      });
      break;
    }
  }

  // An empty visible block prints as a heading with nothing under it.
  for (const section of visible) {
    const hasText = [...strings(section.data)].some((text) => text.trim().length > 0);
    if (hasText) continue;
    findings.push({
      id: `empty:${section.key}`,
      severity: "warning",
      label: `“${section.title}” is empty`,
      detail: "It will print as a heading with nothing under it. Fill it in or hide it.",
      sectionKey: section.key,
    });
  }

  return findings;
}

export function readinessSummary(findings: ReadinessFinding[]): {
  blockers: number;
  warnings: number;
  ready: boolean;
} {
  const blockers = findings.filter((finding) => finding.severity === "blocker").length;
  const warnings = findings.length - blockers;
  return { blockers, warnings, ready: blockers === 0 };
}
