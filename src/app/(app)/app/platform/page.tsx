import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { PlatformConsole } from "@/components/platform/platform-console";
import { isPlatformAdminUserId } from "@/server/platform/admin";

export const dynamic = "force-dynamic";

export default async function PlatformPage() {
  // Live DB check, never the session token. 404 rather than 403 so the console's
  // existence isn't advertised to anyone who can't use it.
  const session = await auth();
  if (!(await isPlatformAdminUserId(session?.user?.id))) notFound();

  return (
    <AppShell title="Platform" subtitle="Every business on Foundry, and what each one has.">
      <PlatformConsole />
    </AppShell>
  );
}
