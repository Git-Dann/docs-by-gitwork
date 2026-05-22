
import { prisma } from "@/lib/prisma";
import { ensureInitialAdmin } from "@/server/bootstrap";
import { apiOk, apiError } from "@/lib/api-response";

// One-time admin repair: deletes any malformed user records (where the password
// was accidentally stored as the email) and recreates the admin from env vars.
// Gated by API_KEY via middleware — safe to leave deployed.
export async function POST() {
  const email = process.env.INITIAL_ADMIN_EMAIL;
  const password = process.env.INITIAL_ADMIN_PASSWORD;

  if (!email || !password) {
    return apiError("INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD must be set", 400);
  }

  // Delete any user records that look like a leaked password (email contains no @,
  // or matches the known bad value). Also catches the specific Foxglove record.
  const deleted = await prisma.user.deleteMany({
    where: {
      AND: [
        { email: { not: email } },
        {
          OR: [
            { email: { not: { contains: "@" } } },
            { email: { equals: password } },
          ],
        },
      ],
    },
  });

  await ensureInitialAdmin();

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, passwordHash: true },
  });

  if (!user?.passwordHash) {
    return apiError("Admin user was not created — check env vars and redeploy", 500);
  }

  return apiOk({
    purgedRecords: deleted.count,
    admin: { id: user.id, email: user.email, name: user.name },
  });
}
