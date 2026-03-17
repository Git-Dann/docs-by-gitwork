import type { DocumentStatus, ProposalMetadata } from "@/types/proposal";

export function deriveProposalStatus(metadata?: Partial<ProposalMetadata> | null): DocumentStatus {
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
): DocumentStatus {
  if (explicitStatus === "ARCHIVED" || explicitStatus === "SENT") {
    return explicitStatus;
  }

  if (!explicitStatus && (currentStatus === "ARCHIVED" || currentStatus === "SENT")) {
    return currentStatus;
  }

  return deriveProposalStatus(metadata);
}
