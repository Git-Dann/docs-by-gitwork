import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { serializeRateCardPerson } from "@/server/rate-card";
import { rateCardPersonUpdateSchema } from "@/server/validators";
import { assertAtLeastAdmin, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { workspaceIdForRequest } from "@/server/workspaces/scope";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const workspaceId = await workspaceIdForRequest(request);

    const person = await prisma.rateCardPerson.findFirst({
      where: {
        id,
        workspaceId,
      },
    });

    if (!person) {
      return apiError("Rate-card person not found", 404);
    }

    return apiOk({ person: serializeRateCardPerson(person) });
  } catch (error) {
    return fromError(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    assertAtLeastAdmin(await getEffectiveUserOrNull(request));
    const { id } = await context.params;
    const payload = rateCardPersonUpdateSchema.parse(await request.json());
    const workspaceId = await workspaceIdForRequest(request);

    const existing = await prisma.rateCardPerson.findFirst({
      where: {
        id,
        workspaceId,
      },
    });

    if (!existing) {
      return apiError("Rate-card person not found", 404);
    }

    const person = await prisma.rateCardPerson.update({
      where: {
        id,
      },
      data: {
        ...(payload.name !== undefined ? { name: payload.name } : {}),
        ...(payload.area !== undefined ? { area: payload.area } : {}),
        ...(payload.sourceRate !== undefined
          ? { sourceRate: new Prisma.Decimal(payload.sourceRate) }
          : {}),
        ...(payload.sourceCurrencyCode !== undefined
          ? { sourceCurrencyCode: payload.sourceCurrencyCode }
          : {}),
        ...(payload.billingPeriod !== undefined
          ? { billingPeriod: payload.billingPeriod }
          : {}),
      },
    });

    return apiOk({ person: serializeRateCardPerson(person) });
  } catch (error) {
    return fromError(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    assertAtLeastAdmin(await getEffectiveUserOrNull(request));
    const { id } = await context.params;
    const workspaceId = await workspaceIdForRequest(request);

    const existing = await prisma.rateCardPerson.findFirst({
      where: {
        id,
        workspaceId,
      },
    });

    if (!existing) {
      return apiError("Rate-card person not found", 404);
    }

    const person = await prisma.rateCardPerson.update({
      where: {
        id,
      },
      data: {
        archivedAt: new Date(),
      },
    });

    return apiOk({ person: serializeRateCardPerson(person) });
  } catch (error) {
    return fromError(error);
  }
}
