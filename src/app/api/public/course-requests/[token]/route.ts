/**
 * Inbound course-request API (public, token-authenticated).
 *
 *   POST /api/public/course-requests/[token]
 *
 * The per-wiki token in the URL path is the auth (minted in the wiki's Course
 * Requests → API intake panel; null/rotated to disable). Lets an external system
 * push course requests straight into the tracker. Idempotent: de-duped by
 * externalRef, then by course name (see ingestCourseRequestsByToken).
 *
 * Body — a single request or a batch:
 *   { "courseName": "...", "country": "...", "notes": "...", "requestedBy": "...", "externalRef": "..." }
 *   { "requests": [ { ... }, { ... } ] }
 *
 * GET returns { ok: true } if the token is valid — a cheap connectivity check.
 */

import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ingestCourseRequestsByToken, type CourseIngestItem } from "@/server/wiki";
import { z } from "zod";

export const maxDuration = 60;

const itemSchema = z.object({
  courseName: z.string().min(1).max(300),
  country: z.string().max(120).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  requestedBy: z.string().max(200).nullable().optional(),
  externalRef: z.string().max(200).nullable().optional(),
});

const bodySchema = z.union([
  itemSchema,
  z.object({ requests: z.array(itemSchema).min(1).max(200) }),
]);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const wiki = await prisma.clientWiki.findUnique({
      where: { courseIngestToken: token },
      select: { id: true },
    });
    if (!wiki) return apiError("Invalid or disabled token", 401);
    return apiOk({ ok: true });
  } catch (err) {
    return fromError(err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const parsed = bodySchema.parse(await req.json());
    const items: CourseIngestItem[] = "requests" in parsed ? parsed.requests : [parsed];

    const result = await ingestCourseRequestsByToken(token, items);
    if (!result) return apiError("Invalid or disabled token", 401);

    return apiOk({ count: result.count, skipped: result.skipped, created: result.created });
  } catch (err) {
    return fromError(err);
  }
}
