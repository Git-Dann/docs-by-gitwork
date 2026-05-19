import { apiOk } from "@/lib/api-response";
import { BUILT_IN_PERSONAS } from "@/config/study-personas";

export const dynamic = "force-dynamic";

export async function GET() {
  const personas = BUILT_IN_PERSONAS.map((p) => ({
    id: p.id,
    name: p.name,
    shortName: p.shortName,
    description: p.description,
    color: p.color,
    initials: p.initials,
    techComfort: p.techComfort,
    communicationStyle: p.communicationStyle,
  }));
  return apiOk({ personas });
}
