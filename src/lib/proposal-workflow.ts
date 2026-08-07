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

/**
 * Statuses `deriveProposalStatus` has no concept of — it only ever produces DRAFT / PRODUCT_SIGN_OFF
 * / TECH_SIGN_OFF / IN_REVIEW / APPROVED from the sign-off checkboxes. These four are set by
 * something OUTSIDE that track (the share route, the client accept/decline routes, an explicit
 * archive) and must never be silently recomputed back to a sign-off-derived value by the next
 * unrelated edit.
 */
const EXTERNALLY_SET_STATUSES: readonly DocumentStatus[] = ["SENT", "ACCEPTED", "DECLINED", "ARCHIVED"];

export function resolveProposalStatus(
  currentStatus: DocumentStatus,
  explicitStatus: DocumentStatus | undefined,
  metadata?: Partial<ProposalMetadata> | null,
  approvalEnabled: boolean = true,
): DocumentStatus {
  // An explicit status — the caller deliberately set one this update, e.g. the editor's own Status
  // dropdown — always wins outright. It was a direct action, not something the sign-off checkboxes
  // should be free to overrule on the very next keystroke elsewhere in the document.
  if (explicitStatus) {
    return explicitStatus;
  }

  // No explicit change this update. A status the sign-off derivation doesn't understand stays as
  // it is; anything else re-derives from the current sign-off metadata, as before.
  if (EXTERNALLY_SET_STATUSES.includes(currentStatus)) {
    return currentStatus;
  }

  return deriveProposalStatus(metadata, approvalEnabled);
}
