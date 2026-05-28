/**
 * GET /api/documents/[id]/activity
 *
 * Workspace-side audit feed for a document. Merges DocumentView rows + SignatureEvent rows
 * into a single newest-first timeline. Used by the editor's "Recent activity" widget.
 *
 * The result is capped to the last 50 events.
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

    const [views, sigEvents] = await Promise.all([
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
    ]
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, 50);

    return apiOk({
      activity: merged,
      summary: {
        totalViews: views.length,
        lastViewedAt: views[0]?.createdAt.toISOString() ?? null,
      },
    });
  } catch (error) {
    return fromError(error);
  }
}
