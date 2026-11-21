import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertAtLeastAdmin, requireAuthedUser } from "@/server/auth/effective-user";
import { prisma } from "@/lib/prisma";
import { TECH_STACK_OPTIONS } from "@/types/codeclear";
import { techStackCreateSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

/**
 * Tech-stack catalogue. The legacy hard-coded TECH_STACK_OPTIONS array still
 * exists in src/types/codeclear.ts as a seed source and offline fallback —
 * but new stacks added here surface in the UI without a deploy.
 *
 * GET seeds the table on first call (idempotent) so the front-end always
 * gets a populated list even on a fresh DB.
 */

async function ensureSeed() {
  const count = await prisma.techStack.count();
  if (count > 0) return;
  await prisma.techStack.createMany({
    data: TECH_STACK_OPTIONS.map((name) => ({ name })),
    skipDuplicates: true,
  });
}

export async function GET() {
  try {
    await ensureSeed();
    const stacks = await prisma.techStack.findMany({
      orderBy: { name: "asc" },
    });
    return apiOk({
      stacks: stacks.map((stack) => ({
        id: stack.id,
        name: stack.name,
        category: stack.category,
        color: stack.color,
        createdAt: stack.createdAt.toISOString(),
        updatedAt: stack.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    return fromError(error);
  }
}

// ⚠️ Admin is read from the DATABASE, not from `session.user.role`, which carries the role
// the token was minted with. The FOURTH byte-identical copy of the same local helper.
// ⚠️ TechStack is a GLOBAL catalogue — no workspaceId, and `name` is @unique — so a
// workspace admin adds to a list every business shares. Left as it is: making it
// per-workspace means replacing that unique index, which `prisma db push` treats as
// data-losing and would skip the whole schema sync (§2). It holds no customer data.

export async function POST(request: NextRequest) {
  try {
    assertAtLeastAdmin(await requireAuthedUser(request));

    const body = techStackCreateSchema.parse(await request.json());
    const stack = await prisma.techStack.create({
      data: {
        name: body.name,
        category: body.category ?? null,
        color: body.color ?? null,
      },
    });

    return apiOk(
      {
        stack: {
          id: stack.id,
          name: stack.name,
          category: stack.category,
          color: stack.color,
          createdAt: stack.createdAt.toISOString(),
          updatedAt: stack.updatedAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return fromError(error);
  }
}
