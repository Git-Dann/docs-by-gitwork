/**
 * Generic document operations — used by Proposals today, will host SLA / SOW / NDA / MSA / CO in
 * future sprints. Keep this file doc-type-agnostic. Proposal-specific helpers live in
 * `src/server/proposals.ts` (which we'll trim down as the new framework lands).
 */

import { randomBytes } from "node:crypto";
import { DocumentType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// ── Document numbering ──────────────────────────────────────────────────────

const TYPE_PREFIX: Record<DocumentType, string> = {
  PROPOSAL: "PROP",
  SLA: "SLA",
  SOW: "SOW",
  MSA: "MSA",
  NDA: "NDA",
  CO: "CO",
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
 */
export async function enableDocumentShare(
  documentId: string,
): Promise<{ shareToken: string; url: string }> {
  const existing = await prisma.document.findUnique({
    where: { id: documentId },
    select: { shareToken: true },
  });

  const shareToken = existing?.shareToken ?? mintShareToken();
  await prisma.document.update({
    where: { id: documentId },
    data: { shareToken, isShared: true },
  });

  return { shareToken, url: `/docs/${shareToken}` };
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
