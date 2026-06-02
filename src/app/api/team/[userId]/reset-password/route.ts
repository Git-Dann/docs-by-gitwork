import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { isAtLeast } from "@/types/auth";

const ResetPasswordSchema = z.object({
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const session = await auth();
  if (!session?.user) return apiError("Unauthorized", 401);
  if (!isAtLeast(session.user.role, "ADMIN")) return apiError("Forbidden", 403);

  try {
    const { userId } = await params;
    const { newPassword } = ResetPasswordSchema.parse(await req.json());

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

    return apiOk({ ok: true });
  } catch (err) {
    return fromError(err);
  }
}
