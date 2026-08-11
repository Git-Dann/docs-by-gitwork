/**
 * DocuSeal Webhook Endpoint.
 *
 * Listens for events from DocuSeal:
 *   - submission.completed  → Marks the whole SignatureRequest + all signers COMPLETED (safety net)
 *   - form.completed        → Marks one individual signer SIGNED; flips request to COMPLETED only
 *                             when no unsigned signers remain (the primary completion signal)
 *   - form.signed           → Alias for form.completed (same handling)
 *   - form.viewed           → Marks a PENDING signer as VIEWED (idempotent, no-op if already signed)
 *
 * Idempotency: duplicate webhook deliveries for an already-SIGNED signer are detected and skipped.
 *
 * Auth: if DOCUSEAL_WEBHOOK_SECRET is set the X-Docuseal-Signature header is verified via
 * HMAC-SHA256. If the env var is absent a warning is logged and processing continues so existing
 * deployments without the secret don't break.
 */

import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

// ─── Optional webhook signature verification ────────────────────────────────────────────────

async function verifySignature(request: NextRequest, rawBody: string): Promise<boolean> {
  const secret = process.env.DOCUSEAL_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.warn("[DocuSeal Webhook] DOCUSEAL_WEBHOOK_SECRET is not set — skipping signature verification.");
    return true;
  }
  const signatureHeader = request.headers.get("x-docuseal-signature") ?? "";
  if (!signatureHeader) {
    console.error("[DocuSeal Webhook] Missing X-Docuseal-Signature header.");
    return false;
  }
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ─── Signer lookup helpers ──────────────────────────────────────────────────────────────────

/** Primary lookup: by DocuSeal-assigned submitter ID or slug (most precise). */
async function findSignerByDocuSealIds(submitterId: string, submitterSlug: string) {
  const conditions: Array<Record<string, string>> = [];
  if (submitterId) conditions.push({ docusealSubmitterId: submitterId });
  if (submitterSlug) conditions.push({ docusealSlug: submitterSlug });
  if (!conditions.length) return null;
  return prisma.signatureSigner.findFirst({ where: { OR: conditions } });
}

/** Fallback lookup: scoped to a known submission, matched by DocuSeal role or email. */
async function findSignerBySubmissionContext(
  submissionId: string,
  submitterRole: string,
  submitterEmail: string,
) {
  const roleOrEmail: Array<Record<string, string>> = [];
  if (submitterRole) roleOrEmail.push({ signerType: submitterRole });
  if (submitterEmail) roleOrEmail.push({ email: submitterEmail });
  if (!roleOrEmail.length) return null;
  return prisma.signatureSigner.findFirst({
    where: {
      request: {
        OR: [{ docusealSubmissionId: submissionId }, { id: submissionId }],
      },
      OR: roleOrEmail,
    },
  });
}

// ─── Route handler ──────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();

    // Verify webhook signature when secret is configured
    const signatureOk = await verifySignature(request, rawBody);
    if (!signatureOk) {
      console.error("[DocuSeal Webhook] Signature verification failed — rejecting request.");
      return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 401 });
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      console.error("[DocuSeal Webhook] Failed to parse JSON body.");
      return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
    }

    // DocuSeal sends event_type as the primary field.
    // We do NOT fall back to data.status checks — those would incorrectly fire for
    // submission-level events whose data object also carries status === "completed".
    const eventType: string = String(payload.event_type ?? "").toLowerCase();

    const data = (payload.data && typeof payload.data === "object"
      ? payload.data
      : {}) as Record<string, unknown>;

    // submission.completed carries the submission ID in data.id
    const submissionId = String(
      data.id || data.submission_id || payload.submission_id || payload.id || "",
    );

    console.log(
      `[DocuSeal Webhook] event_type="${eventType}" submissionId="${submissionId}" data_keys="${Object.keys(data).join(",")}"`,
    );

    // ── 1. Whole submission completed ──────────────────────────────────────────────────────
    // Safety-net: marks everything COMPLETED in bulk when DocuSeal confirms all submitters done.
    // The per-signer form.completed events are the primary completion signal.
    if (eventType === "submission.completed") {
      if (submissionId) {
        const activeRequest = await prisma.signatureRequest.findFirst({
          where: {
            OR: [{ docusealSubmissionId: submissionId }, { id: submissionId }],
          },
          include: { signers: true },
        });

        if (activeRequest) {
          if (activeRequest.status === "COMPLETED") {
            console.log(
              `[DocuSeal Webhook] SignatureRequest ${activeRequest.id} already COMPLETED — skipping.`,
            );
          } else {
            const now = new Date();
            await prisma.$transaction([
              prisma.signatureRequest.update({
                where: { id: activeRequest.id },
                data: { status: "COMPLETED", completedAt: now },
              }),
              prisma.signatureSigner.updateMany({
                where: { requestId: activeRequest.id },
                data: { status: "SIGNED", signedAt: now },
              }),
            ]);
            console.log(
              `[DocuSeal Webhook] submission.completed: SignatureRequest ${activeRequest.id} + all signers → COMPLETED.`,
            );
          }
        } else {
          console.warn(
            `[DocuSeal Webhook] submission.completed: no SignatureRequest found for submissionId="${submissionId}".`,
          );
        }
      }
      return apiOk({ received: true, status: "completed" });
    }

    // ── 2. Individual signer signed ────────────────────────────────────────────────────────
    // Only exact event_type matches — never driven by data.status checks.
    if (eventType === "form.completed" || eventType === "form.signed") {
      const submitterId = String(data.id ?? "");
      const submitterSlug = String(data.slug ?? "");
      const submitterEmail =
        typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
      const submitterRole =
        typeof data.role === "string" ? data.role.trim().toLowerCase() : "";

      // Primary lookup: by DocuSeal submitter ID or slug
      let signer = await findSignerByDocuSealIds(submitterId, submitterSlug);

      // Fallback: scoped to the submission, matched by role or email
      if (!signer && submissionId) {
        signer = await findSignerBySubmissionContext(submissionId, submitterRole, submitterEmail);
      }

      if (!signer) {
        console.warn(
          `[DocuSeal Webhook] ${eventType}: no matching signer (submitterId="${submitterId}", slug="${submitterSlug}", role="${submitterRole}", email="${submitterEmail}").`,
        );
        return apiOk({ received: true, signerProcessed: false });
      }

      // Idempotency: skip if signer is already in the target state
      if (signer.status === "SIGNED") {
        console.log(
          `[DocuSeal Webhook] ${eventType}: Signer ${signer.id} (${signer.name}) already SIGNED — skipping.`,
        );
        return apiOk({ received: true, signerProcessed: true });
      }

      const now = new Date();

      await prisma.$transaction(async (tx) => {
        await tx.signatureSigner.update({
          where: { id: signer.id },
          data: {
            status: "SIGNED",
            signedAt: signer.signedAt ?? now,
            ...(submitterId ? { docusealSubmitterId: submitterId } : {}),
            ...(submitterSlug ? { docusealSlug: submitterSlug } : {}),
          },
        });

        // Count remaining unsigned signers — exclude the one we just updated
        const remaining = await tx.signatureSigner.count({
          where: {
            requestId: signer.requestId,
            id: { not: signer.id },
            status: { not: "SIGNED" },
          },
        });

        if (remaining === 0) {
          await tx.signatureRequest.update({
            where: { id: signer.requestId },
            data: { status: "COMPLETED", completedAt: now },
          });
          console.log(
            `[DocuSeal Webhook] ${eventType}: All signers done. SignatureRequest ${signer.requestId} → COMPLETED.`,
          );
        } else {
          console.log(
            `[DocuSeal Webhook] ${eventType}: Signer ${signer.id} (${signer.name}) → SIGNED. ${remaining} signer(s) still pending.`,
          );
        }
      });

      return apiOk({ received: true, signerProcessed: true });
    }

    // ── 3. Individual signer viewed form ───────────────────────────────────────────────────
    if (eventType === "form.viewed") {
      const submitterId = String(data.id ?? "");
      const submitterSlug = String(data.slug ?? "");
      const submitterEmail =
        typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
      const submitterRole =
        typeof data.role === "string" ? data.role.trim().toLowerCase() : "";

      // Primary lookup
      let signer = await findSignerByDocuSealIds(submitterId, submitterSlug);

      // Fallback: scoped to submission by role or email
      if (!signer && submissionId) {
        signer = await findSignerBySubmissionContext(submissionId, submitterRole, submitterEmail);
      }

      if (signer) {
        // Only transition from PENDING — never overwrite SIGNED or DECLINED
        if (signer.status === "PENDING") {
          await prisma.signatureSigner.update({
            where: { id: signer.id },
            data: { status: "VIEWED" },
          });
          console.log(
            `[DocuSeal Webhook] form.viewed: Signer ${signer.id} (${signer.name}) → VIEWED.`,
          );
        } else {
          console.log(
            `[DocuSeal Webhook] form.viewed: Signer ${signer.id} already "${signer.status}" — skipping.`,
          );
        }
      } else {
        console.warn(
          `[DocuSeal Webhook] form.viewed: no matching signer (submitterId="${submitterId}", slug="${submitterSlug}", role="${submitterRole}", email="${submitterEmail}").`,
        );
      }

      return apiOk({ received: true });
    }

    // ── 4. Unhandled event — log and return 200 so DocuSeal does not retry ─────────────────
    console.log(
      `[DocuSeal Webhook] Unhandled event_type="${eventType}". Payload: ${JSON.stringify(payload)}`,
    );
    return apiOk({ received: true, eventType });
  } catch (error) {
    return fromError(error);
  }
}
