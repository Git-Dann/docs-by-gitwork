/**
 * Document comment lifecycle (P1.5). Public viewers and workspace operators leave threaded
 * feedback on documents. Comments can be tied to a specific section or to the document as a
 * whole (sectionId null).
 *
 * Public comments arrive via /docs/[token] and require name + email. Workspace comments arrive
 * via the editor and are tied to a User. Both flows funnel through the same model.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface CreatePublicCommentInput {
  documentId: string;
  sectionId: string | null;
  parentId: string | null;
  authorName: string;
  authorEmail: string;
  body: string;
}

export interface CreateWorkspaceCommentInput {
  documentId: string;
  sectionId: string | null;
  parentId: string | null;
  authorUserId: string;
  authorName: string;
  body: string;
}

export async function createPublicComment(input: CreatePublicCommentInput) {
  return prisma.documentComment.create({
    data: {
      documentId: input.documentId,
      sectionId: input.sectionId,
      parentId: input.parentId,
      authorKind: "PUBLIC",
      authorName: input.authorName.trim(),
      authorEmail: input.authorEmail.trim().toLowerCase(),
      body: input.body.trim(),
      status: "OPEN",
    },
  });
}

export async function createWorkspaceComment(input: CreateWorkspaceCommentInput) {
  return prisma.documentComment.create({
    data: {
      documentId: input.documentId,
      sectionId: input.sectionId,
      parentId: input.parentId,
      authorKind: "WORKSPACE",
      authorName: input.authorName,
      authorUserId: input.authorUserId,
      body: input.body.trim(),
      status: "OPEN",
    },
  });
}

export async function resolveComment(commentId: string, resolvedBy: string) {
  return prisma.documentComment.update({
    where: { id: commentId },
    data: { status: "RESOLVED", resolvedAt: new Date(), resolvedBy },
  });
}

export async function reopenComment(commentId: string) {
  return prisma.documentComment.update({
    where: { id: commentId },
    data: { status: "OPEN", resolvedAt: null, resolvedBy: null },
  });
}

export async function listCommentsForDocument(documentId: string) {
  return prisma.documentComment.findMany({
    where: { documentId },
    orderBy: { createdAt: "asc" },
    include: { replies: { orderBy: { createdAt: "asc" } } },
  });
}

/** Public, token-scoped view — only OPEN comments, only top-level, no PII for non-public. */
export async function listPublicCommentsForDocument(documentId: string) {
  return prisma.documentComment.findMany({
    where: { documentId, status: "OPEN", parentId: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      sectionId: true,
      authorName: true,
      body: true,
      createdAt: true,
    },
  });
}
