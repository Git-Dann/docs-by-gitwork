import type { DocumentStatus, ProposalMetadata } from "@/types/proposal";

/**
 * Derive the workflow status from the sign-off metadata.
 *
 * `approvalEnabled` controls whether the internal review track (Product / Tech / MD sign-off)
 * applies. Lightweight docs (and proposals with the review toggle off) pass `false`, which
 * short-circuits to DRAFT — the SENT / ACCEPTED / DECLINED states are still set by the
 * share/accept routes, not here. Defaults to `true` so existing callers keep current behaviour.
 */
export function deriveProposalStatus(
  metadata?: Partial<ProposalMetadata> | null,
  approvalEnabled: boolean = true,
): DocumentStatus {
  if (!approvalEnabled) {
    return "DRAFT";
  }

  const productSignOff = Boolean(metadata?.productSignOff);
  const techSignOff = Boolean(metadata?.techSignOff);
  const approved = Boolean(metadata?.approvalChecked);

  if (approved) {
    return "APPROVED";
  }

  if (productSignOff && techSignOff) {
    return "IN_REVIEW";
  }

  if (productSignOff) {
    return "PRODUCT_SIGN_OFF";
  }

  if (techSignOff) {
    return "TECH_SIGN_OFF";
  }

  return "DRAFT";
}

export function resolveProposalStatus(
  currentStatus: DocumentStatus,
  explicitStatus: DocumentStatus | undefined,
  metadata?: Partial<ProposalMetadata> | null,
  approvalEnabled: boolean = true,
): DocumentStatus {
  if (explicitStatus === "ARCHIVED" || explicitStatus === "SENT") {
    return explicitStatus;
  }

  if (!explicitStatus && (currentStatus === "ARCHIVED" || currentStatus === "SENT")) {
    return currentStatus;
  }

  return deriveProposalStatus(metadata, approvalEnabled);
}
