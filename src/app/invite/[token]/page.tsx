import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getInviteByToken, acceptInvite } from "@/server/team";
import Image from "next/image";
import Link from "next/link";
import AcceptButton from "./accept-button";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await getInviteByToken(token);

  if (!invite || invite.status === "REVOKED") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface-1)] px-4">
        <div className="w-full max-w-[400px] text-center">
          <div className="mb-6 flex justify-center">
            <Image src="/foundry-logo.png" alt="Foundry" width={100} height={30} className="h-8 w-auto" />
          </div>
          <h1 className="text-xl font-semibold text-[var(--text-1)]">Invite not found</h1>
          <p className="mt-2 text-sm text-[var(--text-3)]">
            This invite link is invalid or has been revoked.
          </p>
          <Link href="/login" className="mt-6 inline-block text-sm text-[var(--brand-700)] hover:underline">
            Go to sign in →
          </Link>
        </div>
      </div>
    );
  }

  // Already accepted — just redirect into the app
  const session = await auth();
  if (session?.user?.id && invite.status === "PENDING") {
    await acceptInvite(token, session.user.id);
    redirect("/app");
  }
  if (session?.user?.id && invite.status === "ACCEPTED") {
    redirect("/app");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface-1)] px-4">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex justify-center">
          <Image src="/foundry-logo.png" alt="Foundry" width={120} height={36} className="h-9 w-auto" />
        </div>

        <div className="rounded-[10px] border border-[var(--border-2)] bg-white p-8 shadow-[var(--shadow-sm)]">
          <h1
            className="text-2xl font-normal tracking-[-0.02em] text-[var(--text-1)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            You&rsquo;re invited
          </h1>
          <p className="mt-1.5 text-sm text-[var(--text-3)]">
            Sign in with your <strong>@gitwork.co.uk</strong> Google account to join Foundry.
          </p>

          {invite.label && (
            <p className="mt-3 rounded-[6px] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-3)]">
              {invite.label}
            </p>
          )}

          <AcceptButton token={token} />
        </div>

        <p className="mt-6 text-center text-xs text-[var(--text-4)]">
          Foundry by Gitwork — internal platform
        </p>
      </div>
    </div>
  );
}
