/**
 * Slack webhook subscriptions (P5.20).
 *
 *   GET  /api/settings/slack-webhooks      → list all webhook subscriptions for the workspace
 *   POST /api/settings/slack-webhooks      → create a new webhook subscription
 *
 * The workspace is resolved via `ensureBaseRecords()` (single-workspace mode today). The
 * per-event-kind filter is stored as a JSON array of `DocumentEventKind` strings.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";

const VALID_EVENTS = [
  "DOC_SHARED",
  "DOC_VIEWED",
  "DOC_SENT",
  "DOC_SIGNED",
  "DOC_COMPLETED",
  "DOC_DECLINED",
  "COMMENT_ADDED",
] as const;

const createSchema = z.object({
  label: z.string().min(1).max(120),
  webhookUrl: z.string().url().max(2000).refine((u) => /^https:\/\/hooks\.slack\.com\//.test(u), {
    message: "Webhook URL must start with https://hooks.slack.com/",
  }),
  eventKinds: z.array(z.enum(VALID_EVENTS)).min(1),
  enabled: z.boolean().optional(),
});

export async function GET() {
  try {
    const { workspace } = await ensureBaseRecords();
    const subs = await prisma.slackWebhookSubscription.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
    });
    return apiOk({
      subscriptions: subs.map((s) => ({
        id: s.id,
        label: s.label,
        // Mask the webhook URL — only the last 6 chars are visible to confirm identity.
        webhookUrlPreview: s.webhookUrl.slice(0, 28) + "…" + s.webhookUrl.slice(-6),
        eventKinds: s.eventKinds,
        enabled: s.enabled,
        createdAt: s.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { workspace } = await ensureBaseRecords();
    const body = createSchema.parse(await request.json());

    const created = await prisma.slackWebhookSubscription.create({
      data: {
        workspaceId: workspace.id,
        label: body.label,
        webhookUrl: body.webhookUrl,
        eventKinds: body.eventKinds,
        enabled: body.enabled ?? true,
      },
    });

    return apiOk(
      {
        subscription: {
          id: created.id,
          label: created.label,
          webhookUrlPreview:
            created.webhookUrl.slice(0, 28) + "…" + created.webhookUrl.slice(-6),
          eventKinds: created.eventKinds,
          enabled: created.enabled,
          createdAt: created.createdAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(error.issues.map((i) => i.message).join(", "), 400);
    }
    return fromError(error);
  }
}
