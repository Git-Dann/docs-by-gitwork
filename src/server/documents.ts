/**
 * Generic document operations — used by Proposals today, will host SLA / SOW / NDA / MSA / CO in
 * future sprints. Keep this file doc-type-agnostic. Proposal-specific helpers live in
 * `src/server/proposals.ts` (which we'll trim down as the new framework lands).
 */

import { randomBytes } from "node:crypto";
import { DocumentType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_PROPOSAL_METADATA } from "@/lib/default-template";
import { proposalInclude, serializeProposal } from "@/server/proposals";
import type { proposalUpdateSchema } from "@/server/validators";
import {
  allowedDocTypesForUser,
  assertCan,
  canManageDocs,
  canViewCosts,
  type EffectiveUser,
} from "@/server/auth/effective-user";
import type { z } from "zod";

// ── Document numbering ──────────────────────────────────────────────────────

const TYPE_PREFIX: Record<DocumentType, string> = {
  PROPOSAL: "PROP",
  SLA: "SLA",
  SOW: "SOW",
  MSA: "MSA",
  NDA: "NDA",
  CO: "CO",
  DSA: "DSA",
  HANDOVER: "HAND",
  REPORT: "RPT",
  BRIEF: "BRIEF",
  DECK: "DECK",
  OTHER: "DOC",
};

/** Human-readable label for each document type. Used in covers, picker UI, and emails. */
export const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  PROPOSAL: "Proposal",
  SLA: "Service Level Agreement",
  SOW: "Statement of Work",
  MSA: "Master Service Agreement",
  NDA: "Non-Disclosure Agreement",
  CO: "Change Order",
  DSA: "Data Sharing Agreement",
  HANDOVER: "Handover",
  REPORT: "Status Report",
  BRIEF: "Brief",
  DECK: "Deck",
  OTHER: "Document",
};

/** Short label for the cover eyebrow (`FOUNDRY // {LABEL}`). Uppercase, 3-4 chars feels best. */
export const DOCUMENT_TYPE_SHORT: Record<DocumentType, string> = {
  PROPOSAL: "PROPOSAL",
  SLA: "SLA",
  SOW: "SOW",
  MSA: "MSA",
  NDA: "NDA",
  CO: "CHANGE ORDER",
  DSA: "DSA",
  HANDOVER: "HANDOVER",
  REPORT: "STATUS REPORT",
  BRIEF: "BRIEF",
  DECK: "DECK",
  OTHER: "DOCUMENT",
};

/**
 * Allocate the next document number for a workspace × type × year, atomically.
 *
 * Uses an interactive transaction with `SELECT … FOR UPDATE` semantics (Prisma's
 * `tx.documentCounter.update({ data: { increment: 1 } })` produces an atomic UPDATE returning
 * the new row, which is sufficient to avoid two concurrent creates getting the same number).
 *
 * Format: `{PREFIX}-{yyyy}-{NNN}`  e.g. `PROP-2026-014`
 */
export async function allocateDocumentNumber(
  workspaceId: string,
  documentType: DocumentType,
  now: Date = new Date(),
): Promise<string> {
  const year = now.getFullYear();
  const prefix = TYPE_PREFIX[documentType] ?? "DOC";

  // Single-statement atomic upsert: if the (workspace, type, year) counter doesn't exist, create
  // it with nextValue=2 and claim 1. If it does exist, increment nextValue and claim the OLD
  // value. Both branches happen inside one Prisma round-trip.
  const claimed = await prisma.$transaction(async (tx) => {
    const counter = await tx.documentCounter.upsert({
      where: {
        workspaceId_documentType_year: { workspaceId, documentType, year },
      },
      update: { nextValue: { increment: 1 } },
      create: { workspaceId, documentType, year, nextValue: 2 },
      select: { nextValue: true },
    });
    // After upsert, counter.nextValue is the *new* value. The number we just claimed is one less,
    // except in the create branch where we created with nextValue=2 and claimed 1.
    return counter.nextValue - 1;
  });

  return `${prefix}-${year}-${String(claimed).padStart(3, "0")}`;
}

// ── Update ───────────────────────────────────────────────────────────────
//
// Extracted from the PATCH /api/proposals/[id] route so the web editor's autosave and the
// MCP `update_document` tool call one path instead of duplicating the transaction. Throws
// (rather than returning a Response) so each caller can translate to its own response shape;
// thrown errors carry a `status` field per the `Object.assign(new Error(...), { status })`
// convention used elsewhere in src/server (see pulse-lite/leads.ts).

export async function updateDocument(
  actor: EffectiveUser | null,
  id: string,
  payload: z.infer<typeof proposalUpdateSchema>,
) {
  assertCan(actor, canManageDocs, "edit documents");
  // Cost write-protection: a user without docs.viewCosts edits non-cost parts of the
  // document but must NOT be able to wipe costs (their read is blanked). We ignore their
  // costLineItems and restore the real costing section on save.
  const showCosts = actor ? canViewCosts(actor) : true;

  const existing = await prisma.document.findFirst({
    where: { id },
    include: { sections: true },
  });

  if (!existing) {
    throw Object.assign(new Error("Document not found"), { status: 404 });
  }

  // Type gate: a developer must never edit an admin doc type (mirrors the GET 404).
  if (actor && !allowedDocTypesForUser(actor).includes(existing.documentType)) {
    throw Object.assign(new Error("Document not found"), { status: 404 });
  }

  // Edit lock when document is SENT — it's mid-signature. Block any update that isn't just
  // changing status (e.g. a revoke that flips status back to DRAFT/APPROVED).
  if (existing.status === "SENT") {
    const flippingStatusOnly =
      payload.status &&
      payload.status !== "SENT" &&
      Object.keys(payload).every((k) => k === "status");
    if (!flippingStatusOnly) {
      throw Object.assign(
        new Error("This document is out for signature. Revoke the signature request before editing."),
        { status: 423 }, // 423 Locked — semantically accurate
      );
    }
  }

  // Protect the client's conversion signal: once a document is ACCEPTED/DECLINED (set from the
  // public page), an autosave/update carrying a client-derived status must not silently
  // downgrade it back to DRAFT/APPROVED. Only an explicit ARCHIVE may move it out of a terminal
  // state. (Same spirit as the SENT edit-lock above, but content edits stay allowed.)
  const terminalLocked = existing.status === "ACCEPTED" || existing.status === "DECLINED";
  const nextStatus =
    terminalLocked && payload.status && payload.status !== "ARCHIVED"
      ? existing.status
      : payload.status;

  await prisma.$transaction(async (tx) => {
    await tx.document.update({
      where: { id },
      data: {
        title: payload.title,
        status: nextStatus,
        productName: payload.productName,
        clientName: payload.clientName,
        // Link/unlink a Portal client. undefined → leave untouched; null → unlink.
        clientId: payload.clientId === undefined ? undefined : payload.clientId,
        summary: payload.summary,
        version: payload.version,
        expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : payload.expiresAt,
        // Only touch metadata when the caller actually sends it — an omitted metadata must
        // NOT clobber saved values (notes / sign-off flags / client / version) with template
        // defaults. Defaults are base-only; existing + payload win.
        ...(payload.metadata !== undefined
          ? {
              metadata: {
                ...DEFAULT_PROPOSAL_METADATA,
                ...(existing.metadata as Record<string, unknown> | null),
                ...payload.metadata,
              },
            }
          : {}),
        exportSettings: payload.exportSettings as unknown as Prisma.InputJsonValue | undefined,
        labels:
          payload.labels !== undefined ? (payload.labels as unknown as Prisma.InputJsonValue) : undefined,
        parentId: payload.parentId === undefined ? undefined : payload.parentId,
      },
    });

    if (payload.sections) {
      // For a no-viewCosts editor, keep the real costing section instead of their blanked
      // copy — they can't see costs, so they can't be allowed to overwrite them.
      const existingCosting = existing.sections.find((s) => s.key === "costing");
      await tx.documentSection.deleteMany({ where: { documentId: id } });
      await tx.documentSection.createMany({
        data: payload.sections.map((section, index) => ({
          documentId: id,
          key: section.key,
          title: section.title,
          description: section.description,
          sortOrder: section.sortOrder ?? index,
          isVisible: section.isVisible,
          speakerNotes: section.speakerNotes ?? null,
          fontSize: section.fontSize ?? null,
          data:
            !showCosts && section.key === "costing" && existingCosting
              ? (existingCosting.data as Prisma.InputJsonValue)
              : (section.data as unknown as Prisma.InputJsonValue),
        })),
      });
    }

    if (payload.costLineItems && showCosts) {
      await tx.costLineItem.deleteMany({ where: { documentId: id } });
      await tx.costLineItem.createMany({
        data: payload.costLineItems.map((item, index) => ({
          id: item.id,
          documentId: id,
          category: item.category,
          itemName: item.itemName,
          description: item.description,
          quantity: new Prisma.Decimal(item.quantity),
          unitCost: new Prisma.Decimal(item.unitCost),
          subtotal: new Prisma.Decimal(item.subtotal ?? item.quantity * item.unitCost),
          costKind: item.costKind,
          sortOrder: item.sortOrder ?? index,
        })),
      });
    }

    if (payload.timelinePhases) {
      await tx.timelinePhase.deleteMany({ where: { documentId: id } });
      await tx.timelinePhase.createMany({
        data: payload.timelinePhases.map((phase, index) => ({
          documentId: id,
          name: phase.name,
          duration: phase.duration,
          summary: phase.summary,
          deliverables: phase.deliverables as unknown as Prisma.InputJsonValue,
          sortOrder: phase.sortOrder ?? index,
          viewMode: phase.viewMode,
        })),
      });
    }

    if (payload.links) {
      await tx.link.deleteMany({ where: { documentId: id } });
      await tx.link.createMany({
        data: payload.links.map((link, index) => ({
          documentId: id,
          label: link.label,
          url: link.url,
          type: link.type,
          notes: link.notes,
          sortOrder: link.sortOrder ?? index,
        })),
      });
    }

    if (payload.ctas) {
      await tx.cTA.deleteMany({ where: { documentId: id } });
      await tx.cTA.createMany({
        data: payload.ctas.map((cta, index) => ({
          documentId: id,
          role: cta.role,
          label: cta.label,
          destination: cta.destination,
          destinationType: cta.destinationType,
          sortOrder: cta.sortOrder ?? index,
        })),
      });
    }

    if (payload.assets) {
      await tx.asset.deleteMany({ where: { documentId: id } });
      await tx.asset.createMany({
        data: payload.assets.map((asset, index) => ({
          documentId: id,
          sectionId: asset.sectionId,
          type: asset.type,
          title: asset.title,
          url: asset.url,
          altText: asset.altText,
          placement: asset.placement,
          caption: asset.caption,
          size: asset.size,
          alignment: asset.alignment,
          sortOrder: asset.sortOrder ?? index,
        })),
      });
    }
  });

  const updated = await prisma.document.findFirst({
    where: { id },
    include: proposalInclude,
  });

  if (!updated) {
    throw Object.assign(new Error("Document not found after update"), { status: 404 });
  }

  return serializeProposal(updated);
}

// ── Share tokens ───────────────────────────────────────────────────────────

/**
 * Mint a fresh share token. URL-safe base64, ~32 chars from 24 random bytes.
 * Roughly 192 bits of entropy — collision-resistant for the lifetime of the company.
 */
export function mintShareToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Enable sharing for a document. If a token already exists it's preserved (so a previously
 * distributed link keeps working when re-shared after a revoke). If no token exists, mints one.
 *
 * The returned `url` is the relative `/docs/{token}` path. When the workspace has a verified
 * custom hostname (P5.19), use `publicShareUrl()` from `@/server/custom-hostname` at the call
 * site to translate this into a fully-qualified `https://{custom-host}/{token}` instead.
 */
export async function enableDocumentShare(
  documentId: string,
): Promise<{ shareToken: string; url: string }> {
  const existing = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      shareToken: true,
      sharedAt: true,
      workspace: {
        select: { customHostname: true, customHostnameVerified: true },
      },
    },
  });

  const shareToken = existing?.shareToken ?? mintShareToken();
  await prisma.document.update({
    where: { id: documentId },
    data: {
      shareToken,
      isShared: true,
      // Stamp the first-ever share so time-to-first-open is measurable. Preserved across
      // revoke/re-enable (only set when still null) so the original send time is the anchor.
      ...(existing?.sharedAt ? {} : { sharedAt: new Date() }),
    },
  });

  // Prefer the workspace's branded subdomain when verified; otherwise fall back to the relative
  // `/docs/{token}` path that the editor resolves against `window.location.origin`.
  const customHost = existing?.workspace.customHostnameVerified
    ? existing.workspace.customHostname
    : null;
  const url = customHost ? `https://${customHost}/${shareToken}` : `/docs/${shareToken}`;

  return { shareToken, url };
}

/**
 * Revoke sharing. Token is preserved (so an audit trail / re-share is possible) but `isShared`
 * flips to false; public lookups will 404.
 */
export async function disableDocumentShare(documentId: string): Promise<void> {
  await prisma.document.update({
    where: { id: documentId },
    data: { isShared: false },
  });
}

/**
 * Resolve a token to a workspace + document. Returns null if the token is unknown or sharing has
 * been revoked. Public-facing — must not leak internal fields, so callers serialize separately.
 */
export async function findSharedDocumentByToken(token: string) {
  if (!token || token.length < 16) return null;

  return prisma.document.findFirst({
    where: { shareToken: token, isShared: true, archivedAt: null },
    include: {
      sections: { orderBy: { sortOrder: "asc" } },
      costLineItems: { orderBy: { sortOrder: "asc" } },
      timelinePhases: { orderBy: { sortOrder: "asc" } },
      assets: { orderBy: { sortOrder: "asc" } },
      links: { orderBy: { sortOrder: "asc" } },
      ctas: { orderBy: { sortOrder: "asc" } },
      workspace: { select: { id: true, name: true, branding: true } },
      client: { select: { id: true, name: true, logoUrl: true } },
    },
  });
}

// ── Workspace branding ────────────────────────────────────────────────────

export interface WorkspaceBranding {
  brandLogoUrl?: string;
  coverTopAccentUrl?: string;
  coverBottomAccentUrl?: string;
  defaultConfidentialityInternal?: string;
  defaultConfidentialityExternal?: string;
  defaultBrandLockup?: "GITWORK" | "CLIENT_X_GITWORK";
}

export const EMPTY_WORKSPACE_BRANDING: WorkspaceBranding = {
  brandLogoUrl: "",
  coverTopAccentUrl: "",
  coverBottomAccentUrl: "",
  defaultConfidentialityInternal: "Confidential — Internal use only.",
  defaultConfidentialityExternal: "Confidential. Subject to NDA.",
  defaultBrandLockup: "GITWORK",
};

export function parseWorkspaceBranding(value: Prisma.JsonValue | null | undefined): WorkspaceBranding {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...EMPTY_WORKSPACE_BRANDING };
  }
  const v = value as Record<string, unknown>;
  const lockup = v.defaultBrandLockup === "CLIENT_X_GITWORK" ? "CLIENT_X_GITWORK" : "GITWORK";
  return {
    brandLogoUrl: typeof v.brandLogoUrl === "string" ? v.brandLogoUrl : "",
    coverTopAccentUrl: typeof v.coverTopAccentUrl === "string" ? v.coverTopAccentUrl : "",
    coverBottomAccentUrl: typeof v.coverBottomAccentUrl === "string" ? v.coverBottomAccentUrl : "",
    defaultConfidentialityInternal:
      typeof v.defaultConfidentialityInternal === "string"
        ? v.defaultConfidentialityInternal
        : EMPTY_WORKSPACE_BRANDING.defaultConfidentialityInternal,
    defaultConfidentialityExternal:
      typeof v.defaultConfidentialityExternal === "string"
        ? v.defaultConfidentialityExternal
        : EMPTY_WORKSPACE_BRANDING.defaultConfidentialityExternal,
    defaultBrandLockup: lockup,
  };
}
