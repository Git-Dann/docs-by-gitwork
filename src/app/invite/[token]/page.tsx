import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { getInviteByToken, acceptInvite } from "@/server/team";
import { HOME_WORKSPACE_SLUG } from "@/lib/platform-rules";
import { INVITE_REFUSAL_MESSAGE, inviteRefusal } from "@/lib/invite-rules";
import { AuthCard, authButtonClass } from "@/components/auth/auth-card";
import AcceptButton from "./accept-button";
import PasswordSignup from "./password-signup";

/**
 * An invite link. Gitwork's own invites are accepted with a Gitwork Google account, as
 * before. An invite to another business is accepted by creating an account with a password
 * (multi-tenant Phase 3). Someone already signed in accepts straight away.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await getInviteByToken(token);

  if (!invite || invite.status === "REVOKED") {
    return (
      <AuthCard title="Invite not found" subtitle="This invite link isn't valid, or it was withdrawn.">
        <Link href="/login" className={`block ${authButtonClass}`}>Go to sign in</Link>
      </AuthCard>
    );
  }

  const session = await auth();
  if (session?.user?.id) {
    if (invite.status === "ACCEPTED") redirect("/app");
    const result = await acceptInvite(token, session.user.id);
    if (result.ok) redirect("/app");
    const message = result.reason === "not_found" ? "This invite link isn't valid." : INVITE_REFUSAL_MESSAGE[result.reason];
    return (
      <AuthCard title="Can't use this invite" subtitle={message}>
        <p className="text-sm text-[var(--text-3)]">
          You&rsquo;re signed in as <strong>{session.user.email}</strong>.
        </p>
        <Link href="/app" className={`mt-6 block ${authButtonClass}`}>Go to Foundry</Link>
      </AuthCard>
    );
  }

  const refusal = inviteRefusal(invite, invite.email);
  if (refusal) {
    return (
      <AuthCard title="Can't use this invite" subtitle={INVITE_REFUSAL_MESSAGE[refusal]}>
        <Link href="/login" className={`block ${authButtonClass}`}>Go to sign in</Link>
      </AuthCard>
    );
  }

  const isGitwork = invite.workspace.slug === HOME_WORKSPACE_SLUG;
  return (
    <AuthCard
      title={`Join ${invite.workspace.name}`}
      subtitle={
        isGitwork ? (
          <>Sign in with your <strong>@gitwork.co.uk</strong> Google account to join Foundry.</>
        ) : (
          <>Create your Foundry account to join {invite.workspace.name}.</>
        )
      }
    >
      {invite.label ? (
        <p className="mb-4 rounded-[6px] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-3)]">{invite.label}</p>
      ) : null}
      {isGitwork ? <AcceptButton token={token} /> : <PasswordSignup token={token} lockedEmail={invite.email} />}
      {!isGitwork ? (
        <p className="mt-4 text-center text-xs text-[var(--text-4)]">
          Already have an account?{" "}
          <Link href={`/login?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`} className="hover:text-[var(--text-2)]">
            Sign in first
          </Link>
        </p>
      ) : null}
    </AuthCard>
  );
}
