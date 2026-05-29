/**
 * GET  /api/notifications/preferences → current signed-in user's notification preferences
 * PATCH /api/notifications/preferences → merge-update preferences
 *
 * One row per user (lazy-created on first read). Reflects channel toggles, per-event routing,
 * digest cadence, and quiet hours.
 */

import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/auth";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import type {
  NotificationChannel,
  NotificationEvent,
} from "@/server/notification-events";

export const dynamic = "force-dynamic";

interface NotificationPreferences {
  emailEnabled: boolean;
  pushEnabled: boolean;
  slackEnabled: boolean;
  inAppEnabled: boolean;
  events: Partial<Record<NotificationEvent, NotificationChannel[]>>;
  digestCadence: "OFF" | "DAILY" | "WEEKLY";
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  timezone: string | null;
}

const DEFAULTS: NotificationPreferences = {
  emailEnabled: true,
  pushEnabled: true,
  slackEnabled: false,
  inAppEnabled: true,
  events: {
    "pulse.scan_failed": ["email", "push"],
    "pulse.monitor_drift": ["email"],
    "study.report_ready": ["email", "inApp"],
    "care.ticket_created": ["inApp"],
    "care.ticket_escalated": ["email", "push"],
    "docs.viewed_by_client": ["inApp"],
    "docs.signed": ["email", "inApp"],
    "team.member_added": ["inApp"],
  },
  digestCadence: "OFF",
  quietHoursStart: null,
  quietHoursEnd: null,
  timezone: null,
};

function shape(record: {
  emailEnabled: boolean;
  pushEnabled: boolean;
  slackEnabled: boolean;
  inAppEnabled: boolean;
  events: Prisma.JsonValue;
  digestCadence: string;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  timezone: string | null;
}): NotificationPreferences {
  const events =
    record.events && typeof record.events === "object" && !Array.isArray(record.events)
      ? (record.events as Partial<Record<NotificationEvent, NotificationChannel[]>>)
      : {};
  const cadence = ["OFF", "DAILY", "WEEKLY"].includes(record.digestCadence)
    ? (record.digestCadence as "OFF" | "DAILY" | "WEEKLY")
    : "OFF";
  return {
    emailEnabled: record.emailEnabled,
    pushEnabled: record.pushEnabled,
    slackEnabled: record.slackEnabled,
    inAppEnabled: record.inAppEnabled,
    events,
    digestCadence: cadence,
    quietHoursStart: record.quietHoursStart,
    quietHoursEnd: record.quietHoursEnd,
    timezone: record.timezone,
  };
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) return apiError("Not authenticated", 401);

    const existing = await prisma.notificationPreference.findUnique({
      where: { userId: session.user.id },
    });

    if (!existing) {
      // Lazy-create with defaults so the UI always has something concrete to render.
      const created = await prisma.notificationPreference.create({
        data: {
          userId: session.user.id,
          events: DEFAULTS.events as unknown as Prisma.InputJsonValue,
        },
      });
      return apiOk({ preferences: shape(created) });
    }

    return apiOk({ preferences: shape(existing) });
  } catch (error) {
    return fromError(error);
  }
}

const channelSchema = z.enum(["email", "push", "slack", "inApp"]);

const patchSchema = z.object({
  emailEnabled: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  slackEnabled: z.boolean().optional(),
  inAppEnabled: z.boolean().optional(),
  events: z.record(z.string(), z.array(channelSchema)).optional(),
  digestCadence: z.enum(["OFF", "DAILY", "WEEKLY"]).optional(),
  quietHoursStart: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable()
    .optional(),
  quietHoursEnd: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable()
    .optional(),
  timezone: z.string().max(64).nullable().optional(),
});

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return apiError("Not authenticated", 401);

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return apiError("Invalid JSON body", 400);

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.issues.map((issue) => issue.message).join(", "), 400);
    }

    const data: Prisma.NotificationPreferenceUpdateInput = {};
    if (parsed.data.emailEnabled !== undefined) data.emailEnabled = parsed.data.emailEnabled;
    if (parsed.data.pushEnabled !== undefined) data.pushEnabled = parsed.data.pushEnabled;
    if (parsed.data.slackEnabled !== undefined) data.slackEnabled = parsed.data.slackEnabled;
    if (parsed.data.inAppEnabled !== undefined) data.inAppEnabled = parsed.data.inAppEnabled;
    if (parsed.data.events !== undefined) {
      data.events = parsed.data.events as unknown as Prisma.InputJsonValue;
    }
    if (parsed.data.digestCadence !== undefined) data.digestCadence = parsed.data.digestCadence;
    if (parsed.data.quietHoursStart !== undefined) {
      data.quietHoursStart = parsed.data.quietHoursStart;
    }
    if (parsed.data.quietHoursEnd !== undefined) data.quietHoursEnd = parsed.data.quietHoursEnd;
    if (parsed.data.timezone !== undefined) data.timezone = parsed.data.timezone;

    const updated = await prisma.notificationPreference.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        events: (parsed.data.events ?? DEFAULTS.events) as unknown as Prisma.InputJsonValue,
        emailEnabled: parsed.data.emailEnabled ?? DEFAULTS.emailEnabled,
        pushEnabled: parsed.data.pushEnabled ?? DEFAULTS.pushEnabled,
        slackEnabled: parsed.data.slackEnabled ?? DEFAULTS.slackEnabled,
        inAppEnabled: parsed.data.inAppEnabled ?? DEFAULTS.inAppEnabled,
        digestCadence: parsed.data.digestCadence ?? DEFAULTS.digestCadence,
        quietHoursStart: parsed.data.quietHoursStart ?? null,
        quietHoursEnd: parsed.data.quietHoursEnd ?? null,
        timezone: parsed.data.timezone ?? null,
      },
      update: data,
    });

    return apiOk({ preferences: shape(updated) });
  } catch (error) {
    return fromError(error);
  }
}
