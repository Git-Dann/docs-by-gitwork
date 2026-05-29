/**
 * GET /api/documents/[id]/activity
 *
 * Workspace-side audit feed for a document. Merges four event sources into a single newest-first
 * timeline:
 *
 *   - DocumentView      → "public viewer opened the doc"
 *   - SignatureEvent    → REQUEST_SENT / SIGNER_SIGNED / SIGNER_DECLINED / REQUEST_COMPLETED…
 *   - DocumentComment   → workspace + public comments (top-level only — replies stay nested in
 *                         the CollabPanel comment thread; we don't double-surface them here)
 *   - DocumentVersion   → version snapshots taken by operators
 *
 * Result is capped to the latest 50 events across all sources.
 */

import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const doc = await prisma.document.findUnique({
      where: { id },
      select: { id: true, createdAt: true },
    });
    if (!doc) return apiError("Document not found", 404);

    const [views, sigEvents, comments, versions] = await Promise.all([
      prisma.documentView.findMany({
        where: { documentId: id },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          createdAt: true,
          ip: true,
          userAgent: true,
          referer: true,
          origin: true,
          signer: { select: { name: true, role: true } },
        },
      }),
      prisma.signatureEvent.findMany({
        where: { request: { documentId: id } },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          createdAt: true,
          kind: true,
          ip: true,
          metadata: true,
          signer: { select: { name: true, role: true } },
        },
      }),
      prisma.documentComment.findMany({
        where: { documentId: id, parentId: null },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          createdAt: true,
          authorKind: true,
          authorName: true,
          body: true,
          status: true,
        },
      }),
      prisma.documentVersion.findMany({
        where: { documentId: id },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          createdAt: true,
          version: true,
          changelog: true,
        },
      }),
    ]);

    // Merge + sort newest first, cap at 50
    type FeedItem =
      | {
          kind: "VIEW";
          id: string;
          createdAt: string;
          origin: string;
          signerName: string | null;
          signerRole: string | null;
          ip: string | null;
        }
      | {
          kind: "SIGNATURE_EVENT";
          id: string;
          createdAt: string;
          eventKind: string;
          signerName: string | null;
          signerRole: string | null;
          ip: string | null;
          metadata: unknown;
        }
      | {
          kind: "COMMENT";
          id: string;
          createdAt: string;
          authorKind: "PUBLIC" | "WORKSPACE";
          authorName: string;
          /** First 160 chars of the comment body — full text lives in the CollabPanel. */
          excerpt: string;
          status: "OPEN" | "RESOLVED";
        }
      | {
          kind: "VERSION";
          id: string;
          createdAt: string;
          version: string;
          changelog: string | null;
        };

    const merged: FeedItem[] = [
      ...views.map<FeedItem>((v) => ({
        kind: "VIEW",
        id: v.id,
        createdAt: v.createdAt.toISOString(),
        origin: v.origin,
        signerName: v.signer?.name ?? null,
        signerRole: v.signer?.role ?? null,
        ip: v.ip,
      })),
      ...sigEvents.map<FeedItem>((e) => ({
        kind: "SIGNATURE_EVENT",
        id: e.id,
        createdAt: e.createdAt.toISOString(),
        eventKind: e.kind,
        signerName: e.signer?.name ?? null,
        signerRole: e.signer?.role ?? null,
        ip: e.ip,
        metadata: e.metadata,
      })),
      ...comments.map<FeedItem>((c) => ({
        kind: "COMMENT",
        id: c.id,
        createdAt: c.createdAt.toISOString(),
        authorKind: c.authorKind,
        authorName: c.authorName,
        excerpt: c.body.length > 160 ? `${c.body.slice(0, 160)}…` : c.body,
        status: c.status,
      })),
      ...versions.map<FeedItem>((v) => ({
        kind: "VERSION",
        id: v.id,
        createdAt: v.createdAt.toISOString(),
        version: v.version,
        changelog: v.changelog,
      })),
    ]
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, 50);

    return apiOk({
      activity: merged,
      summary: {
        totalViews: views.length,
        lastViewedAt: views[0]?.createdAt.toISOString() ?? null,
        totalComments: comments.length,
        totalVersions: versions.length,
      },
    });
  } catch (error) {
    return fromError(error);
  }
}
