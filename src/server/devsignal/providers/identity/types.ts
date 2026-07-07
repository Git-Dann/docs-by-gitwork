/**
 * IdentityVerificationProvider — the abstraction over a KYC vendor.
 *
 * DATA-MINIMISATION RULE (Dan, 2026-07-06): Foundry stores ONLY a provider
 * reference + result status + minimal metadata. Raw identity documents /
 * selfies are NEVER stored in Foundry. Target provider is Stripe Identity;
 * a mock ships for tests/local. Do not hardcode a paid provider into logic —
 * selection is config-driven.
 */

export type IdentityStatus =
  | "verified"
  | "unverified"
  | "pending"
  | "manual_review"
  | "error";

export type IdentityConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

export interface IdentityCheckRequest {
  candidateId: string;
  email?: string | null;
  country?: string | null;
}

/** The ONLY identity data persisted — no documents, no images, no raw PII. */
export interface IdentityResult {
  provider: string;
  verificationId: string;
  status: IdentityStatus;
  confidence?: IdentityConfidenceLevel | null;
  level?: string | null;
  checkedAt: string;
  expiresAt?: string | null;
  country?: string | null;
  documentType?: string | null;
  manualReview: boolean;
  error?: string | null;
}

export interface IdentityVerificationProvider {
  name: string;
  verify(request: IdentityCheckRequest): Promise<IdentityResult>;
}
