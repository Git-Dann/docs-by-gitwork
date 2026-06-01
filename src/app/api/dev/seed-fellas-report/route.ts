import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const MAY_2026_PAYLOAD = {
  author: "Dan Lindsay",
  periodStart: "2026-05-01",
  periodEnd: "2026-05-31",
  overviewText:
    "May 2026 saw the Fellas Loaded support desk handle 35 customer support tickets, the majority of which were cancellation and subscription-related enquiries. Cancellations accounted for the largest volume of activity this month, consistent with patterns from previous periods. The team maintained strong response times throughout, with most tickets addressed within 24 hours. A technical issue relating to Firestick device compatibility was reported by a customer and resolved the following business day following internal escalation.",
  totalTickets: 35,
  catCancellations: 28,
  catAccountQueries: 3,
  catRefunds: 28,
  catTechIssues: 2,
  catOther: 4,
  prioUrgent: 0,
  prioHigh: 0,
  prioMedium: 0,
  prioLow: 0,
  performanceText:
    "The majority of support tickets were responded to within 24 hours, in line with our agreed service standards. A Firestick compatibility issue was raised and required overnight escalation before a full resolution was communicated to the customer the following day — an acceptable turnaround given the technical complexity. No significant backlog was recorded during May.",
  refundRequests: 28,
  refundsProcessed: 28,
  refundTotalValue: 0,
  refundNotes: "",
  usageTotalUsers: 0,
  usageVerifiedUsers: 0,
  usageActiveSubscriptions: 0,
  usageSubIosMonthly: 0,
  usageSubIosYearly: 0,
  usageSubAndroidMonthly: 0,
  usageSubAndroidYearly: 0,
  usageSubStripeMonthly: 0,
  usageSubStripeYearly: 0,
  usageEventsTotal: 0,
  usageEventsRenewals: 0,
  usageEventsNew: 0,
  usageIosTotal: 0,
  usageIosNew: 0,
  usageAndroidTotal: 0,
  usageAndroidNew: 0,
  usageStripeTotal: 0,
  usageStripeNew: 0,
  summaryText:
    "May 2026 continued to see cancellations as the primary driver of support activity. Response times were strong throughout and the team handled the volume effectively. The Firestick issue is worth monitoring for potential recurrence as the device base grows. Looking ahead to June, continued focus on subscriber retention — particularly around renewal communications — is recommended to help reduce cancellation volumes.",
};

export async function POST() {
  try {
    const client = await prisma.supportClient.findFirst({
      where: { name: { contains: "Fellas", mode: "insensitive" } },
    });
    if (!client) return apiError("Fellas Loaded support client not found", 404);

    const existing = await prisma.supportReport.findFirst({
      where: { clientId: client.id, period: "May 2026" },
    });
    if (existing) {
      return apiOk({ message: "Report already exists", reportId: existing.id });
    }

    const report = await prisma.supportReport.create({
      data: {
        clientId: client.id,
        period: "May 2026",
        payload: MAY_2026_PAYLOAD as unknown as Prisma.InputJsonValue,
        createdBy: "Dan Lindsay",
      },
    });

    return apiOk({ message: "Report created", reportId: report.id });
  } catch (error) {
    return fromError(error);
  }
}
