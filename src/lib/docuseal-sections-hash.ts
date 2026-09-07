import type { ProposalSection, SignaturesSectionData } from "@/types/proposal";

/**
 * Recursively sorts keys of all objects so that JSON.stringify produces
 * a deterministic canonical representation regardless of how JavaScript
 * or PostgreSQL ordered the keys. Also drops null/undefined values so
 * optional field representations don'\''t cause spurious diffs.
 */
export function canonicalizeJson(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalizeJson);
  }
  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const result: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    const v = obj[key];
    if (v !== undefined && v !== null) {
      result[key] = canonicalizeJson(v);
    }
  }
  return result;
}

/**
 * Strips transient signing capture fields from signature section blocks
 * so that capturing signatures (e.g. DocuSeal signing, webhooks) does not
 * falsely flag the document content as modified.
 */
export function normalizeSectionDataForHash(key: string, data: unknown): unknown {
  if (!data || typeof data !== "object") return data;

  if (key === "signatures") {
    const sigData = data as SignaturesSectionData;
    if (Array.isArray(sigData.blocks)) {
      return {
        ...sigData,
        blocks: sigData.blocks.map((b) => {
          const rest = { ...(b as unknown as Record<string, unknown>) };
          delete rest.signed;
          delete rest.signaturePayload;
          delete rest.signedName;
          delete rest.signatureDate;
          delete rest.docusealSlug;
          delete rest.docusealSubmitterId;
          delete rest.docusealEmbedSrc;
          return rest;
        }),
      };
    }
  }

  return data;
}

/**
 * Produces a stable, canonical fingerprint of a document'\''s section content —
 * the same data that gets rendered into the DocuSeal PDF. Excludes timestamps
 * and transient signing capture fields. Canonicalizes all object keys recursively
 * so PostgreSQL JSONB reordering or client serialization never alters the hash.
 */
export function computeSectionsHash(sections: ProposalSection[]): string {
  const normalized = [...sections]
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map(({ key, title, data, isVisible }) => ({
      key,
      title,
      data: normalizeSectionDataForHash(key, data),
      isVisible,
    }));
  return JSON.stringify(canonicalizeJson(normalized));
}

/**
 * Safely parses and re-canonicalizes a baseline string (from localStorage or metadata).
 * Handles legacy uncanonicalized JSON strings that may already be stored in the user'\''s browser.
 */
export function parseStoredBaseline(stored: string | null | undefined): string | null {
  if (!stored || typeof stored !== "string") return null;
  const trimmed = stored.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return JSON.stringify(canonicalizeJson(parsed));
  } catch {
    return trimmed;
  }
}
