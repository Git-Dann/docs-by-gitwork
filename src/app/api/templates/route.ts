import { apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";

export async function GET() {
  try {
    await ensureBaseRecords();

    const templates = await prisma.documentTemplate.findMany({
      where: {
        documentType: "PROPOSAL",
      },
      orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
    });

    return apiOk({
      templates: templates.map((template) => ({
        id: template.id,
        name: template.name,
        slug: template.slug,
        description: template.description,
        documentType: template.documentType,
        isDefault: template.isDefault,
        sections: template.sections,
        metadata: template.metadata,
      })),
    });
  } catch (error) {
    return fromError(error);
  }
}
