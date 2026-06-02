import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { serializeRateCardPerson } from "@/server/rate-card";
import { rateCardPersonCreateSchema } from "@/server/validators";
import { canViewRateCard, getEffectiveUserOrNull } from "@/server/auth/effective-user";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { workspace } = await ensureBaseRecords();

    // Field gate: users without `rateCard.view` get no rate-card people (this also
    // blanks the day-rate options pulled into proposal costing). API_KEY-only → full.
    const user = await getEffectiveUserOrNull(request);
    if (user && !canViewRateCard(user)) {
      return apiOk({ people: [] });
    }

    const search = request.nextUrl.searchParams.get("search")?.trim();
    const includeArchived = request.nextUrl.searchParams.get("includeArchived") === "true";

    const where: Prisma.RateCardPersonWhereInput = {
      workspaceId: workspace.id,
      ...(includeArchived ? {} : { archivedAt: null }),
      ...(search
        ? {
            OR: [
              {
                name: {
                  contains: search,
                  mode: "insensitive",
                },
              },
              {
                area: {
                  contains: search,
                  mode: "insensitive",
                },
              },
              {
                sourceCurrencyCode: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            ],
          }
        : {}),
    };

    const people = await prisma.rateCardPerson.findMany({
      where,
      orderBy: [{ archivedAt: "asc" }, { name: "asc" }],
    });

    return apiOk({
      people: people.map((person) => serializeRateCardPerson(person)),
    });
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = rateCardPersonCreateSchema.parse(await request.json());
    const { workspace } = await ensureBaseRecords();

    const person = await prisma.rateCardPerson.create({
      data: {
        workspaceId: workspace.id,
        name: body.name,
        area: body.area,
        sourceRate: new Prisma.Decimal(body.sourceRate),
        sourceCurrencyCode: body.sourceCurrencyCode,
        billingPeriod: body.billingPeriod,
      },
    });

    return apiOk({ person: serializeRateCardPerson(person) }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
