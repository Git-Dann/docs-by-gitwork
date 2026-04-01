import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { proposalInclude, serializeProposal } from "@/server/proposals";
import { proposalCostingSchema } from "@/server/validators";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const payload = proposalCostingSchema.parse(await request.json());

    const existing = await prisma.document.findUnique({ where: { id } });
    if (!existing) {
      return apiError("Proposal not found", 404);
    }

    await prisma.$transaction(async (tx) => {
      await tx.costLineItem.deleteMany({ where: { documentId: id } });
      await tx.costLineItem.createMany({
        data: payload.costLineItems.map((item, index) => ({
          id: item.id,
          documentId: id,
          category: item.category,
          itemName: item.itemName,
          description: item.description,
          quantity: new Prisma.Decimal(item.quantity),
          unitCost: new Prisma.Decimal(item.unitCost),
          subtotal: new Prisma.Decimal(item.subtotal ?? item.quantity * item.unitCost),
          costKind: item.costKind,
          sortOrder: item.sortOrder ?? index,
        })),
      });

      const costingSection = await tx.documentSection.findFirst({
        where: {
          documentId: id,
          key: "costing",
        },
        orderBy: {
          sortOrder: "asc",
        },
      });

      if (costingSection) {
        const currentData = (costingSection.data as Record<string, unknown>) ?? {};
        await tx.documentSection.update({
          where: {
            id: costingSection.id,
          },
          data: {
            data: {
              ...currentData,
              ...(payload.currency ? { currency: payload.currency } : {}),
              ...(payload.discount !== undefined ? { discount: payload.discount } : {}),
              ...(payload.taxRate !== undefined ? { taxRate: payload.taxRate } : {}),
              ...(payload.monthlyCostSummary !== undefined
                ? { monthlyCostSummary: payload.monthlyCostSummary }
                : {}),
              ...(payload.durationSummary !== undefined ? { durationSummary: payload.durationSummary } : {}),
              ...(payload.totalCostLabel !== undefined ? { totalCostLabel: payload.totalCostLabel } : {}),
              ...(payload.supportingNarrative !== undefined
                ? { supportingNarrative: payload.supportingNarrative }
                : {}),
              ...(payload.paymentScheduleIntro !== undefined
                ? { paymentScheduleIntro: payload.paymentScheduleIntro }
                : {}),
              ...(payload.paymentTerms !== undefined ? { paymentTerms: payload.paymentTerms } : {}),
              ...(payload.vatNotice !== undefined ? { vatNotice: payload.vatNotice } : {}),
              ...(payload.ipTransferNotice !== undefined
                ? { ipTransferNotice: payload.ipTransferNotice }
                : {}),
              ...(payload.teamAllocations !== undefined ? { teamAllocations: payload.teamAllocations } : {}),
              ...(payload.paymentSchedule !== undefined ? { paymentSchedule: payload.paymentSchedule } : {}),
              ...(payload.additionalNotes !== undefined ? { additionalNotes: payload.additionalNotes } : {}),
              ...(payload.assignmentTimelineMode !== undefined
                ? { assignmentTimelineMode: payload.assignmentTimelineMode }
                : {}),
            },
          },
        });
      }
    });

    const updated = await prisma.document.findFirst({
      where: {
        id,
      },
      include: proposalInclude,
    });

    if (!updated) {
      return apiError("Proposal not found", 404);
    }

    return apiOk({ proposal: serializeProposal(updated) });
  } catch (error) {
    return fromError(error);
  }
}
