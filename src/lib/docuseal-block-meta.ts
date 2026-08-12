/**
 * Shared DocuSeal Block Metadata
 *
 * Single source of truth for how we map each `SignatureBlockItem` to a
 * DocuSeal submitter role, field variable names, and PDF text tags.
 *
 * Both `src/lib/sections/signatures.tsx` (PDF rendering) and
 * `src/app/api/documents/[id]/docuseal/route.ts` (API payload) import from
 * here so the text tag printed in the PDF and the submitter field registered
 * with the DocuSeal API are always identical — eliminating the class of bug
 * where a field name mismatch causes DocuSeal to render an unanchored text
 * box instead of a locked signature pad.
 *
 * DocuSeal official text tag format (semicolon-separated attributes):
 *   {{Field Name;role=Signer1;type=signature}}
 *   {{Field Name;role=Signer1;type=date}}
 * Source: https://www.docuseal.com/guides/use-embedded-text-field-tags-in-the-pdf-to-create-a-fillable-form
 *
 * Role/field naming convention:
 *   – First gitwork block  → role "gitwork",    field "gitwork_signature"
 *   – First client block   → role "client",     field "client_signature"
 *   – Second client block  → role "client_2",   field "client_signature_2"
 *   – Nth client block     → role "client_N",   field "client_signature_N"
 */

import type { SignatureBlockItem } from "@/types/proposal";

/** Resolved metadata for one signature block inside a document. */
export interface DocusealBlockMeta {
  /** Submitter role sent to DocuSeal API and embedded in text tags. */
  role: string;
  /** Signature field variable name (e.g. "gitwork_signature"). */
  sigVarName: string;
  /** Date field variable name (e.g. "gitwork_date"). */
  dateVarName: string;
  /** DocuSeal PDF text tag for the signature field. */
  sigTag: string;
  /** DocuSeal PDF text tag for the date field. */
  dateTag: string;
}

/**
 * Compute DocuSeal metadata for every block in the array.
 *
 * Returns one `DocusealBlockMeta` per block, in the same order.
 * Roles are unique within a document (DocuSeal invariant).
 */
export function getDocusealBlocksMeta(
  blocks: Pick<SignatureBlockItem, "type" | "variableName">[],
): DocusealBlockMeta[] {
  const roleCounts: Record<string, number> = {};

  return blocks.map((block, index) => {
    const isGitwork = block.type === "gitwork" || (index === 0 && block.type !== "client");

    const baseType = (
      block.type?.trim().toLowerCase() || (isGitwork ? "gitwork" : "client")
    ).replace(/[^a-z0-9_]/g, "_");

    roleCounts[baseType] = (roleCounts[baseType] ?? 0) + 1;
    const count = roleCounts[baseType];

    // Unique role per submitter
    const role = count === 1 ? baseType : `${baseType}_${count}`;

    // Default variable names — compact so tags stay short and single-line in PDF text layer
    const defaultSigVar = isGitwork
      ? "gitwork_sig"
      : count > 1
      ? `client_sig_${count}`
      : "client_sig";

    const defaultDateVar = isGitwork
      ? "gitwork_date"
      : count > 1
      ? `client_date_${count}`
      : "client_date";

    // Honour an explicit variableName stored on the block, compacting long "signature" tokens
    const rawVar = (block.variableName?.trim() || defaultSigVar)
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_")
      .replace(/_signature/g, "_sig");

    const sigVarName = rawVar;
    const dateVarName = sigVarName.includes("_sig")
      ? sigVarName.replace("_sig", "_date")
      : sigVarName.replace("signature", "date");

    // DocuSeal official PDF text-tag format (semicolon-separated attributes):
    // {{Field Name;role=RoleName;type=signature}}
    // Source: https://www.docuseal.com/guides/use-embedded-text-field-tags-in-the-pdf-to-create-a-fillable-form
    const sigTag = `{{${sigVarName};role=${role};type=signature}}`;
    const dateTag = `{{${dateVarName};role=${role};type=date}}`;

    return { role, sigVarName, dateVarName, sigTag, dateTag };
  });
}
