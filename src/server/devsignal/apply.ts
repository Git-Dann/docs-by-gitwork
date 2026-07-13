import { createHash } from "node:crypto";
import { ensureBaseRecords } from "@/server/bootstrap";
import { sendWorkspaceEmail } from "@/server/email";
import { createAssessment } from "./assessment";
import type { NewCandidateInput } from "./assessment";

/**
 * Public self-serve entry (`/apply`). A dev with the shared URL + access
 * password can start their own DevSignal assessment. It still lands in staging
 * (origin EXTERNAL, unpromoted) — nothing enters Code without a human. Simple
 * shared-password gate for now (not per-user auth).
 */

export const APPLY_COOKIE = "devsignal_access";

/** Shared access password. Set DEVSIGNAL_ACCESS_PASSWORD on the VPS to change it. */
export function accessPassword(): string {
  return process.env.DEVSIGNAL_ACCESS_PASSWORD || "gitwork-devsignal";
}

/** Opaque cookie value derived from the password — can't be forged without it. */
export function accessCookieValue(): string {
  return createHash("sha256").update(`devsignal:${accessPassword()}`).digest("hex").slice(0, 40);
}

export function isPasswordCorrect(input: unknown): boolean {
  return typeof input === "string" && input.length > 0 && input === accessPassword();
}

export function isAccessCookieValid(value: string | undefined | null): boolean {
  return Boolean(value) && value === accessCookieValue();
}

/**
 * Create a fresh assessment for a self-serve applicant. Returns the public
 * token so the flow can run inline. Reuses createAssessment (EXTERNAL candidate
 * + config snapshot + token).
 */
export async function startPublicApplication(
  candidate: NewCandidateInput,
  opts: { origin?: string | null } = {},
): Promise<{ token: string | null; assessmentId: string }> {
  const { workspace } = await ensureBaseRecords();
  const assessment = await createAssessment({ workspaceId: workspace.id, candidate });
  const token = assessment.publicToken ?? null;

  // Resume-by-email: best-effort send the candidate their own resume link so
  // they can pick up where they left off. No-ops silently if email is unconfigured.
  if (token && candidate.email && opts.origin) {
    const url = `${opts.origin.replace(/\/$/, "")}/vet/${token}`;
    void sendWorkspaceEmail({
      workspaceId: workspace.id,
      to: candidate.email,
      subject: "Your Gitwork DevSignal assessment — resume link",
      html: [
        `<p>Hi ${escapeHtml(candidate.name)},</p>`,
        `<p>Thanks for starting your Gitwork developer assessment. You can pause any time and resume from this private link:</p>`,
        `<p><a href="${url}">${url}</a></p>`,
        `<p>It expires in 30 days. If you didn't start this, you can ignore this email.</p>`,
      ].join(""),
    }).catch(() => {});
  }
  return { token, assessmentId: assessment.id };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}
