import type {
  IdentityCheckRequest,
  IdentityResult,
  IdentityStatus,
  IdentityVerificationProvider,
} from "./types";

/**
 * Deterministic mock KYC provider for tests + local dev. Performs NO real
 * verification and stores NO documents — it returns a stable minimal result
 * keyed off the candidate id so the pipeline is exercisable without Stripe.
 */
export interface MockIdentityOptions {
  status?: IdentityStatus;
  confidence?: IdentityResult["confidence"];
  /** Fixed timestamp for deterministic tests; defaults to now at call time. */
  checkedAt?: string;
}

export class MockIdentityProvider implements IdentityVerificationProvider {
  readonly name = "mock";
  private readonly opts: MockIdentityOptions;

  constructor(opts: MockIdentityOptions = {}) {
    this.opts = opts;
  }

  async verify(request: IdentityCheckRequest): Promise<IdentityResult> {
    const status = this.opts.status ?? "verified";
    return {
      provider: this.name,
      verificationId: `mock-idv-${request.candidateId}`,
      status,
      confidence: this.opts.confidence ?? (status === "verified" ? "HIGH" : "LOW"),
      level: null,
      checkedAt: this.opts.checkedAt ?? new Date().toISOString(),
      expiresAt: null,
      country: request.country ?? null,
      documentType: null,
      manualReview: status === "manual_review",
      error: status === "error" ? "mock error" : null,
    };
  }
}
