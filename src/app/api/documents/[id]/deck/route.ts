/**
 * GET / PUT /api/documents/[id]/deck
 *
 * The slide content of a DECK document. This is the contract that makes Deck a
 * real part of Docs rather than a link out: the Deck window opens `/deck?doc=<id>`,
 * loads the slides here, and ⌘S saves them straight back — so Foundry is the
 * source of truth and the standalone `.deck.html` becomes an export ("Save a
 * copy"), not the store.
 *
 * GET answers `{ deck: { doc, title, template } }`:
 *   · `doc`      the slide document, or null if this deck has never been opened
 *   · `template` the slug chosen at creation (metadata.deckTemplate). When `doc`
 *                is null the Deck app materialises this template and PUTs the
 *                result, which is how a new deck gets its slides exactly once.
 *
 * Both halves are gated: reading needs the Docs module, writing needs
 * `canManageDocs` — the same bar as editing any other document's content.
 */

import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import {
  assertCan,
  canManageDocs,
  getEffectiveUserOrNull,
} from "@/server/auth/effective-user";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** A deck's JSON can carry embedded images; cap it so one paste can't fill the DB. */
const MAX_DECK_BYTES = 8 * 1024 * 1024;

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const document = await prisma.document.findUnique({
      where: { id },
      select: { id: true, title: true, documentType: true, deckDoc: true, metadata: true },
    });
    if (!document) return apiError("Document not found", 404);
    if (document.documentType !== "DECK") return apiError("Not a deck document", 400);

    const metadata = (document.metadata ?? {}) as Record<string, unknown>;
    const template = typeof metadata.deckTemplate === "string" ? metadata.deckTemplate : null;
    return apiOk({
      deck: { doc: document.deckDoc ?? null, title: document.title, template },
    });
  } catch (error) {
    return fromError(error);
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageDocs, "edit documents");
    const { id } = await context.params;

    const body = (await request.json()) as { doc?: unknown; title?: unknown };
    if (!body?.doc || typeof body.doc !== "object") return apiError("A deck document is required", 400);

    const size = JSON.stringify(body.doc).length;
    if (size > MAX_DECK_BYTES) {
      return apiError(
        `That deck is ${(size / 1024 / 1024).toFixed(1)}MB — too large to save. Large images are the usual cause; link them rather than embedding.`,
        413,
      );
    }

    const existing = await prisma.document.findUnique({
      where: { id },
      select: { id: true, documentType: true },
    });
    if (!existing) return apiError("Document not found", 404);
    if (existing.documentType !== "DECK") return apiError("Not a deck document", 400);

    // The deck's own title is the document's title — renaming in either place is
    // the same rename, so the library card never disagrees with the open window.
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : undefined;

    const saved = await prisma.document.update({
      where: { id },
      data: {
        deckDoc: body.doc as object,
        ...(title ? { title } : {}),
      },
      select: { id: true, title: true, updatedAt: true },
    });
    return apiOk({ deck: saved });
  } catch (error) {
    return fromError(error);
  }
}
