import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { isAtLeast } from "@/types/auth";
import { recomputeMember } from "@/server/permissions";

const CreateMemberSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "STAFF", "DEVELOPER"]),
  permissions: z.array(z.string()).default([]),
});

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return null;
  if (!isAtLeast(session.user.role, "ADMIN")) return null;
  return session;
}

export async function GET() {
  const session = await requireAdmin();
  if (!session) return apiError("Forbidden", 403);

  const workspace = await prisma.workspace.findUnique({
    where: { slug: DEFAULT_WORKSPACE_SLUG },
    include: {
      members: {
        include: { user: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!workspace) return apiError("Workspace not found", 404);

  const members = workspace.members.map((m) => ({
    userId: m.userId,
    memberId: m.id,
    name: m.user.name,
    email: m.user.email,
    role: m.role,
    permissions: (m.permissions as string[]) ?? [],
    createdAt: m.createdAt,
  }));

  return apiOk({ members });
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return apiError("Forbidden", 403);

  try {
    const body = CreateMemberSchema.parse(await req.json());

    const workspace = await prisma.workspace.findUnique({
      where: { slug: DEFAULT_WORKSPACE_SLUG },
    });
    if (!workspace) return apiError("Workspace not found", 404);

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) return apiError("A user with that email already exists", 409);

    const passwordHash = await bcrypt.hash(body.password, 12);

    const user = await prisma.user.create({
      data: { email: body.email, name: body.name, passwordHash },
    });

    const member = await prisma.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        role: body.role,
        permissions: body.permissions,
      },
    });
    // Resolve the cached effective permissions from the role matrix (new member →
    // empty overrides → role defaults). Keeps `permissions` consistent with the model.
    await recomputeMember(member.id);

    return apiOk({
      userId: user.id,
      memberId: member.id,
      name: user.name,
      email: user.email,
      role: member.role,
      permissions: (member.permissions as string[]) ?? [],
    }, { status: 201 });
  } catch (err) {
    return fromError(err);
  }
}
