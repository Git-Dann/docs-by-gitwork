import { NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  email: z.string().email(),
  recoveryKey: z.string().min(1),
  newPassword: z.string().min(8),
});

export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json());

    const recoveryKey = process.env.INITIAL_ADMIN_PASSWORD;
    if (!recoveryKey) {
      return apiError("Password recovery is not configured on this instance.", 422);
    }

    if (body.recoveryKey !== recoveryKey) {
      return apiError("Recovery key incorrect.", 401);
    }

    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user) {
      // Return same message to avoid user enumeration
      return apiError("Recovery key incorrect.", 401);
    }

    const passwordHash = await bcrypt.hash(body.newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

    return apiOk({ ok: true });
  } catch (error) {
    return fromError(error);
  }
}
