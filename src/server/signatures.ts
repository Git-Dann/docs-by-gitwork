/**
 * E-signature lifecycle (Sprint 4 of the Docs rebuild).
 *
 * The state machine here is deliberately simple and built around four verbs:
 *
 *     CREATE  →  workspace user starts a new SignatureRequest, populated from the document's
 *                parties / signatures section. Status: DRAFT. No tokens minted yet.
 *
 *     SEND    →  workspace user flips DRAFT → SENT. We mint per-signer access tokens, freeze
 *                a snapshot of the document into `documentSnapshot`, and emit REQUEST_SENT +
 *                one SIGNER_INVITED event per signer.
 *
 *     SIGN    →  each signer hits /sign/[accessToken], records VIEWED, eventually submits
 *                their signature (DRAWN canvas data URL or TYPED string + font). When the last
 *                signer signs, status flips SENT → COMPLETED.
 *
 *     REVOKE  →  workspace cancels the request. SENT → REVOKED. Signer URLs 410 after this.
 *
 * Every state transition writes a SignatureEvent. The Certificate of Completion appendix in the
 * print view reads from those rows so a downstream party can audit who saw what and when.
 */

import { randomBytes } from "node:crypto";
import {
  Prisma,
  type SignatureCaptureMethod,
  type SignatureRequest,
  type SignatureRequestStatus,
  SignatureEventKind,
  SignatureSignerStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { PartyItem, SignatureBlockItem } from "@/types/proposal";

// ── Token helpers ──────────────────────────────────────────────────────────

/** 32-char URL-safe token (~192 bits). Same shape as document share tokens. */
export function mintSignerToken(): string {
  return randomBytes(24).toString("base64url");
}

// ── Input shapes ───────────────────────────────────────────────────────────

export interface CreateSignerInput {
  name: string;
  email: string;
  role: string;
  organization?: string;
  signatureBlockId?: string;
}

export interface CreateSignatureRequestInput {
  documentId: string;
  workspaceId: string;
  createdById: string;
  signers: CreateSignerInput[];
  message?: string;
  expiresAt?: Date;
}

// ── Lifecycle ──────────────────────────────────────────────────────────────

/**
 * Create a fresh DRAFT request. No tokens minted yet — calling code can edit the signer list
 * before sending. Emits a REQUEST_CREATED audit event.
 */
export async function createSignatureRequest(input: CreateSignatureRequestInput) {
  if (!input.signers.length) {
    throw new Error("A signature request requires at least one signer.");
  }

  return prisma.$transaction(async (tx) => {
    const request = await tx.signatureRequest.create({
      data: {
        documentId: input.documentId,
        workspaceId: input.workspaceId,
        createdById: input.createdById,
        status: "DRAFT",
        message: input.message?.trim() || null,
        expiresAt: input.expiresAt ?? null,
        signers: {
          create: input.signers.map((signer, index) => ({
            name: signer.name.trim(),
            email: signer.email.trim().toLowerCase(),
            role: signer.role.trim(),
            organization: signer.organization?.trim() || null,
            signatureBlockId: signer.signatureBlockId ?? null,
            // Mint tokens upfront — they're inert until status flips to SENT.
            accessToken: mintSignerToken(),
            // No signing order in v1 — every signer can sign in parallel.
            signingOrder: index,
            status: "PENDING",
          })),
        },
      },
      include: { signers: true },
    });

    await tx.signatureEvent.create({
      data: {
        requestId: request.id,
        kind: SignatureEventKind.REQUEST_CREATED,
        metadata: { signerCount: request.signers.length },
      },
    });

    return request;
  });
}

/**
 * Flip DRAFT → SENT. Freezes a document snapshot. Emits REQUEST_SENT + per-signer
 * SIGNER_INVITED events. No-op if the request is already SENT (idempotent re-send).
 *
 * The frozen snapshot is intentionally a generic JSON blob — it's not a typed shape because the
 * downstream consumer (the signing page) only needs to display whatever was in the doc at the
 * time, and re-deriving sections / costs / timeline from a serialized proposal is something the
 * existing serializer can already do.
 */
export async function sendSignatureRequest(requestId: string, documentSnapshot: unknown) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.signatureRequest.findUnique({
      where: { id: requestId },
      include: { signers: true },
    });
    if (!existing) throw new Error("Signature request not found.");
    if (existing.status !== "DRAFT" && existing.status !== "SENT") {
      throw new Error(
        `Cannot send a request that is ${existing.status.toLowerCase()}. Revoke and start a new request.`,
      );
    }

    const now = new Date();

    const updated = await tx.signatureRequest.update({
      where: { id: requestId },
      data: {
        status: "SENT",
        sentAt: existing.sentAt ?? now,
        documentSnapshot: documentSnapshot as Prisma.InputJsonValue,
        signers: {
          updateMany: existing.signers
            .filter((s) => !s.invitedAt)
            .map((s) => ({
              where: { id: s.id },
              data: { invitedAt: now },
            })),
        },
      },
      include: { signers: true },
    });

    // Only write the SENT event the first time we transition out of DRAFT.
    if (existing.status === "DRAFT") {
      await tx.signatureEvent.create({
        data: {
          requestId,
          kind: SignatureEventKind.REQUEST_SENT,
          metadata: { signerCount: updated.signers.length },
        },
      });
      for (const signer of updated.signers) {
        await tx.signatureEvent.create({
          data: {
            requestId,
            signerId: signer.id,
            kind: SignatureEventKind.SIGNER_INVITED,
            metadata: { email: signer.email, role: signer.role },
          },
        });
      }
    }

    return updated;
  });
}

/**
 * Revoke an in-flight request. Token URLs immediately 410 after this. Status becomes REVOKED;
 * the row is preserved for audit.
 */
export async function revokeSignatureRequest(requestId: string, reason?: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.signatureRequest.findUnique({ where: { id: requestId } });
    if (!existing) throw new Error("Signature request not found.");
    if (existing.status === "COMPLETED") {
      throw new Error("Cannot revoke a completed request.");
    }

    const updated = await tx.signatureRequest.update({
      where: { id: requestId },
      data: { status: "REVOKED" },
    });

    await tx.signatureEvent.create({
      data: {
        requestId,
        kind: SignatureEventKind.REQUEST_REVOKED,
        metadata: reason ? { reason } : undefined,
      },
    });

    return updated;
  });
}

// ── Signer-side actions (called from public /sign/[token] endpoints) ──────

export interface RequestContext {
  ip?: string;
  userAgent?: string;
}

/**
 * Look up a signer by their access token, including the request and document. Returns null if
 * the token is unknown, the request was revoked, or the request expired. Useful both for the
 * signing page and the view-tracking endpoint.
 */
export async function findSignerByToken(token: string) {
  if (!token || token.length < 16) return null;

  const signer = await prisma.signatureSigner.findUnique({
    where: { accessToken: token },
    include: {
      request: {
        include: {
          document: true,
          signers: true,
        },
      },
    },
  });
  if (!signer) return null;

  // Reject tokens for requests that haven't been sent yet or are no longer valid for signing.
  const status = signer.request.status;
  if (status !== "SENT") return { signer, gate: status as Exclude<SignatureRequestStatus, "SENT"> };
  if (signer.request.expiresAt && signer.request.expiresAt < new Date()) {
    return { signer, gate: "EXPIRED" as const };
  }

  return { signer, gate: null };
}

/** Record a SIGNER_VIEWED event. Updates `firstViewedAt` only the first time. */
export async function recordSignerView(signerId: string, context: RequestContext = {}) {
  await prisma.$transaction(async (tx) => {
    const signer = await tx.signatureSigner.findUnique({ where: { id: signerId } });
    if (!signer) return;

    await tx.signatureSigner.update({
      where: { id: signerId },
      data: {
        status: signer.status === "PENDING" ? SignatureSignerStatus.VIEWED : signer.status,
        firstViewedAt: signer.firstViewedAt ?? new Date(),
      },
    });

    await tx.signatureEvent.create({
      data: {
        requestId: signer.requestId,
        signerId,
        kind: SignatureEventKind.SIGNER_VIEWED,
        ip: context.ip ?? null,
        userAgent: context.userAgent ?? null,
      },
    });
  });
}

export interface SubmitSignatureInput {
  signerId: string;
  method: SignatureCaptureMethod;
  /** PNG data URL for DRAWN, the typed string for TYPED. */
  payload: string;
  /** Name the signer typed in the consent box. Required for audit. */
  signedName: string;
  /** Font key for TYPED signatures. Ignored when method=DRAWN. */
  fontKey?: string;
}

/**
 * Capture a signer's signature, advance the request if it's the last outstanding signer.
 * Returns the updated request (with all signers + events) for the signing page's success state.
 */
export async function submitSignature(input: SubmitSignatureInput, context: RequestContext = {}) {
  return prisma.$transaction(async (tx) => {
    const signer = await tx.signatureSigner.findUnique({
      where: { id: input.signerId },
      include: { request: { include: { signers: true } } },
    });
    if (!signer) throw new Error("Signer not found.");
    if (signer.status === "SIGNED") return signer.request;  // Idempotent — already signed
    if (signer.status === "DECLINED") throw new Error("This signer has already declined.");
    if (signer.request.status !== "SENT") {
      throw new Error("This request is no longer accepting signatures.");
    }

    const now = new Date();

    await tx.signatureSigner.update({
      where: { id: input.signerId },
      data: {
        status: SignatureSignerStatus.SIGNED,
        signedAt: now,
        signatureMethod: input.method,
        signaturePayload: input.payload,
        signedName: input.signedName,
        signedFontKey: input.fontKey ?? null,
        signedIp: context.ip ?? null,
        signedUserAgent: context.userAgent ?? null,
      },
    });

    await tx.signatureEvent.create({
      data: {
        requestId: signer.requestId,
        signerId: input.signerId,
        kind: SignatureEventKind.SIGNER_SIGNED,
        ip: context.ip ?? null,
        userAgent: context.userAgent ?? null,
        metadata: { method: input.method, signedName: input.signedName },
      },
    });

    // Check whether every signer has now signed — if so, advance the request.
    const allSigners = await tx.signatureSigner.findMany({
      where: { requestId: signer.requestId },
    });
    const everyoneSigned = allSigners.every((s) =>
      s.id === input.signerId ? true : s.status === "SIGNED",
    );

    if (everyoneSigned) {
      await tx.signatureRequest.update({
        where: { id: signer.requestId },
        data: { status: "COMPLETED", completedAt: now },
      });
      await tx.signatureEvent.create({
        data: {
          requestId: signer.requestId,
          kind: SignatureEventKind.REQUEST_COMPLETED,
        },
      });
    }

    return tx.signatureRequest.findUniqueOrThrow({
      where: { id: signer.requestId },
      include: { signers: true, events: { orderBy: { createdAt: "asc" } } },
    });
  });
}

/** Record a decline. Flips both the signer and the request to DECLINED. */
export async function declineSignature(
  signerId: string,
  reason: string | undefined,
  context: RequestContext = {},
) {
  return prisma.$transaction(async (tx) => {
    const signer = await tx.signatureSigner.findUnique({
      where: { id: signerId },
      include: { request: true },
    });
    if (!signer) throw new Error("Signer not found.");
    if (signer.request.status !== "SENT") {
      throw new Error("This request is no longer accepting responses.");
    }

    const now = new Date();

    await tx.signatureSigner.update({
      where: { id: signerId },
      data: {
        status: SignatureSignerStatus.DECLINED,
        declinedAt: now,
        declineReason: reason?.trim() || null,
      },
    });
    await tx.signatureRequest.update({
      where: { id: signer.requestId },
      data: { status: "DECLINED" },
    });
    await tx.signatureEvent.create({
      data: {
        requestId: signer.requestId,
        signerId,
        kind: SignatureEventKind.SIGNER_DECLINED,
        ip: context.ip ?? null,
        userAgent: context.userAgent ?? null,
        metadata: reason ? { reason } : undefined,
      },
    });

    return tx.signatureRequest.findUniqueOrThrow({
      where: { id: signer.requestId },
      include: { signers: true },
    });
  });
}

// ── Query helpers ──────────────────────────────────────────────────────────

/** All signature requests for a document, newest first. Used by the editor side panel. */
export async function listSignatureRequestsForDocument(documentId: string) {
  return prisma.signatureRequest.findMany({
    where: { documentId },
    orderBy: { createdAt: "desc" },
    include: {
      signers: true,
      events: { orderBy: { createdAt: "asc" } },
    },
  });
}

/**
 * Convert the document's `parties` + `signatures` sections into a list of CreateSignerInputs.
 * The signatures section is the source of truth when present; if a doc only has a parties
 * section (some templates) we fall back to that.
 */
export function inferSignersFromSections(sections: Array<{ key: string; data: unknown }>): CreateSignerInput[] {
  const signaturesSection = sections.find((s) => s.key === "signatures")?.data as
    | { blocks?: SignatureBlockItem[] }
    | undefined;

  if (signaturesSection?.blocks?.length) {
    return signaturesSection.blocks.map((block) => ({
      name: block.signatoryName || block.partyName || "—",
      email: block.signatoryEmail || "",
      role: block.signatoryRole || "Signatory",
      organization: block.partyName || undefined,
      signatureBlockId: block.id,
    }));
  }

  const partiesSection = sections.find((s) => s.key === "parties")?.data as
    | { parties?: PartyItem[] }
    | undefined;

  if (partiesSection?.parties?.length) {
    return partiesSection.parties
      .filter((party) => party.signatureRequired)
      .map((party) => ({
        name: party.name || party.organization || "—",
        email: party.email || "",
        role: party.role || "Signatory",
        organization: party.organization || undefined,
      }));
  }

  return [];
}

// ── Re-exports for consumers ───────────────────────────────────────────────

export type { SignatureRequest };
