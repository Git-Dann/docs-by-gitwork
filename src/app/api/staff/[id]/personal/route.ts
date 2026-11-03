/**
 * GET /api/staff/[id]/personal — the sensitive tier of a person record: date of birth,
 *     address, NI number, ID, right to work, emergency contacts. The person themselves, or
 *     `hr.viewSensitive`. A read by anyone else is written to the HR access log.
 * PUT /api/staff/[id]/personal — replace it (it is one encrypted value). The person, or
 *     `hr.manage` together with `hr.viewSensitive`. The log records which fields changed,
 *     never the values.
 *
 * Rules: src/lib/hr.ts (profileAccess, normaliseSensitive). Storage: src/server/hr/profile.ts.
 */

import { z } from "zod";
import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { getSensitive, updateSensitive } from "@/server/hr/profile";

export const dynamic = "force-dynamic";

const nullableText = z.string().max(2000).nullable().optional();
const schema = z
  .object({
    dateOfBirth: nullableText,
    homeAddress: nullableText,
    personalPhone: nullableText,
    personalEmail: nullableText,
    niNumber: nullableText,
    idDocumentNumber: nullableText,
    rightToWorkExpiry: nullableText,
    emergencyContacts: z
      .array(
        z
          .object({
            name: z.string().max(400).nullable().optional(),
            relationship: z.string().max(400).nullable().optional(),
            phone: z.string().max(400).nullable().optional(),
          })
          .strict(),
      )
      .max(10)
      .optional(),
  })
  .strict();

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(request);
    const { id } = await params;
    return apiOk(await getSensitive(user, id));
  } catch (error) {
    return fromError(error);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(request);
    const { id } = await params;
    const parsed = schema.parse(await request.json());
    return apiOk(
      await updateSensitive(user, id, {
        ...parsed,
        emergencyContacts: (parsed.emergencyContacts ?? []).map((c) => ({
          name: c.name ?? "",
          relationship: c.relationship ?? null,
          phone: c.phone ?? "",
        })),
      }),
    );
  } catch (error) {
    return fromError(error);
  }
}
