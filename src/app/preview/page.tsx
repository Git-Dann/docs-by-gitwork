export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function PreviewLandingPage() {
  const proposal = await prisma.document.findFirst({
    where: {
      documentType: "PROPOSAL",
    },
    orderBy: {
      updatedAt: "desc",
    },
    select: {
      id: true,
    },
  });

  if (!proposal) {
    redirect("/app/proposals");
  }

  redirect(`/preview/${proposal.id}`);
}
