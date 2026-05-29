/**
 * GET /api/documents/[id]/snapshot
 *
 * Single endpoint that returns every piece of editor-polling state in one round-trip:
 *
 *   - comments    (top-level + nested replies, same shape as /comments)
 *   - versions    (newest 25, same shape as /versions)
 *   - presence    (active sessions within the 30s heartbeat TTL, same shape as /presence)
 *   - relations   ({ parent, children } same shape as /proposals/[id]/relations)
 *   - activity    (last 50 events — view, signature, comment, version)
 *
 * Lets React Query share one fetch across every hook that needs editor state. Cuts editor
 * mount network traffic from 4–5 requests every 10–30s to a single request every 10s.
 *
 * Each sub-payload is built the same way as the dedicated endpoint so swapping back to per-
 * resource calls if needed is a one-line change in the hook.
 */

import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const PRESENCE_TTL_MS = 30_000;

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    await ensureBaseRecords();
    const { id } = await context.params;

    const doc = await prisma.document.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        documentType: true,
        documentNumber: true,
        parent: {
          select: {
            id: true,
            title: true,
            documentType: true,
            status: true,
            documentNumber: true,
            updatedAt: true,
          },
        },
        children: {
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            title: true,
            documentType: true,
            status: true,
            documentNumber: true,
            updatedAt: true,
          },
        },
      },
    });
    if (!doc) return apiError("Document not found", 404);

    const presenceCutoff = new Date(Date.now() - PRESENCE_TTL_MS);

    const [comments, versions, presence, views, sigEvents] = await Promise.all([
      prisma.documentComment.findMany({
        where: { documentId: id },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          documentId: true,
          sectionId: true,
          parentId: true,
          authorKind: true,
          authorName: true,
          authorEmail: true,
          body: true,
          status: true,
          createdAt: true,
          resolvedAt: true,
        },
      }),
      prisma.documentVersion.findMany({
        where: { documentId: id },
        orderBy: { createdAt: "desc" },
        take: 25,
        select: {
          id: true,
          documentId: true,
          version: true,
          changelog: true,
          createdAt: true,
        },
      }),
      prisma.editorPresence.findMany({
        where: { documentId: id, lastSeenAt: { gte: presenceCutoff } },
        orderBy: { lastSeenAt: "desc" },
        select: {
          sessionId: true,
          userId: true,
          userName: true,
          lastSeenAt: true,
        },
      }),
      prisma.documentView.findMany({
        where: { documentId: id },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          createdAt: true,
          ip: true,
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

    // ── Comments: nest replies under their parent (matches /comments shape) ──
    const topLevel = comments.filter((c) => c.parentId === null);
    const replies = comments.filter((c) => c.parentId !== null);
    const commentsNested = topLevel.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      resolvedAt: c.resolvedAt?.toISOString() ?? null,
      replies: replies
        .filter((r) => r.parentId === c.id)
        .map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
          resolvedAt: r.resolvedAt?.toISOString() ?? null,
        })),
    }));

    // ── Presence: dedupe by userName (single user across tabs counts once) ──
    const presenceByUser = new Map<string, (typeof presence)[number]>();
    for (const p of presence) {
      const key = p.userName;
      const prev = presenceByUser.get(key);
      if (!prev || prev.lastSeenAt < p.lastSeenAt) presenceByUser.set(key, p);
    }
    const presenceList = Array.from(presenceByUser.values()).map((p) => ({
      sessionId: p.sessionId,
      userId: p.userId,
      userName: p.userName,
      lastSeenAt: p.lastSeenAt.toISOString(),
    }));

    // ── Relations: same shape as /proposals/[id]/relations ──
    const serializeRel = (d: NonNullable<typeof doc.parent>) => ({
      id: d.id,
      title: d.title,
      documentType: d.documentType,
      documentNumber: d.documentNumber,
      status: d.status,
      updatedAt: d.updatedAt.toISOString(),
    });

    // ── Activity: merge view + sigEvent + comment + version, newest first ──
    type ActivityItem = {
      kind: string;
      id: string;
      createdAt: string;
    } & Record<string, unknown>;

    const activity: ActivityItem[] = [
      ...views.map<ActivityItem>((v) => ({
        kind: "VIEW",
        id: v.id,
        createdAt: v.createdAt.toISOString(),
        origin: v.origin,
        signerName: v.signer?.name ?? null,
        signerRole: v.signer?.role ?? null,
        ip: v.ip,
      })),
      ...sigEvents.map<ActivityItem>((e) => ({
        kind: "SIGNATURE_EVENT",
        id: e.id,
        createdAt: e.createdAt.toISOString(),
        eventKind: e.kind,
        signerName: e.signer?.name ?? null,
        signerRole: e.signer?.role ?? null,
        ip: e.ip,
        metadata: e.metadata,
      })),
      ...topLevel.map<ActivityItem>((c) => ({
        kind: "COMMENT",
        id: c.id,
        createdAt: c.createdAt.toISOString(),
        authorKind: c.authorKind,
        authorName: c.authorName,
        excerpt: c.body.length > 160 ? `${c.body.slice(0, 160)}…` : c.body,
        status: c.status,
      })),
      ...versions.map<ActivityItem>((v) => ({
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
      document: {
        id: doc.id,
        title: doc.title,
        documentType: doc.documentType,
        documentNumber: doc.documentNumber,
      },
      comments: commentsNested,
      versions: versions.map((v) => ({
        ...v,
        createdAt: v.createdAt.toISOString(),
      })),
      presence: presenceList,
      relations: {
        parent: doc.parent ? serializeRel(doc.parent) : null,
        children: doc.children.map(serializeRel),
      },
      activity,
      summary: {
        totalViews: views.length,
        lastViewedAt: views[0]?.createdAt.toISOString() ?? null,
        totalComments: topLevel.length,
        totalVersions: versions.length,
        activeEditors: presenceList.length,
      },
    });
  } catch (error) {
    return fromError(error);
  }
}
