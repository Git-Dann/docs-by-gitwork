// Consent screen for the OAuth authorization-code flow.
//
// Reached via redirect from GET /api/oauth/authorize after parameter validation.
// Re-validates everything here so a forged direct hit on this URL can't issue
// codes against a malicious payload.
//
// Bare-bones for Sitting 1 — UI polish (logos, scope rationale, branding) is
// part of Sitting 3 alongside the Settings → Integrations panel.

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { findClientById, isAllowedRedirectUri, parseScope } from "@/server/oauth";
import { resolveEffectiveUserById } from "@/server/mcp/auth";
import { canConnectMcp } from "@/server/auth/effective-user";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type SearchParams = { [key: string]: string | string[] | undefined };

function asString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const responseType = asString(sp.response_type);
  const clientId = asString(sp.client_id);
  const redirectUri = asString(sp.redirect_uri);
  const scope = asString(sp.scope);
  const state = asString(sp.state);
  const codeChallenge = asString(sp.code_challenge);
  const codeChallengeMethod = asString(sp.code_challenge_method);

  // Sign-in gate: bounce through NextAuth, come back here.
  const session = await auth();
  if (!session?.user?.id) {
    const url = new URL("/oauth/consent", "http://localhost"); // base ignored by redirect()
    Object.entries(sp).forEach(([k, v]) => {
      if (v !== undefined) url.searchParams.set(k, asString(v));
    });
    const signInUrl = new URL("/api/auth/signin", "http://localhost");
    signInUrl.searchParams.set("callbackUrl", url.pathname + url.search);
    redirect(signInUrl.pathname + signInUrl.search);
  }

  if (!clientId || !redirectUri) {
    return (
      <ErrorScreen
        title="Missing parameters"
        body="This authorization link is malformed."
      />
    );
  }

  const client = await findClientById(clientId);
  if (!client) {
    return <ErrorScreen title="Unknown client" body="This OAuth client is not registered." />;
  }
  if (!isAllowedRedirectUri(client, redirectUri)) {
    return (
      <ErrorScreen
        title="redirect_uri mismatch"
        body="The redirect URL does not match any registered for this client."
      />
    );
  }

  // Check the workspace toggle here too so the user sees a friendly message
  // rather than a 503 from the POST.
  const live = await prisma.workspace.findFirst({
    where: { mcpEnabled: true },
    select: { id: true },
  });
  if (!live) {
    return (
      <ErrorScreen
        title="MCP is disabled"
        body="A Super Admin needs to enable MCP in Settings → MCP before Claude can connect."
      />
    );
  }

  // Permission gate — the user must hold mcp.connect (Admins by default;
  // Staff/Developers via the matrix). Show a friendly message rather than
  // letting them approve and hit an access_denied on the POST.
  const actor = await resolveEffectiveUserById(session.user.id);
  if (!actor || !canConnectMcp(actor)) {
    return (
      <ErrorScreen
        title="Not permitted"
        body="Your Foundry account isn't permitted to connect Claude. Ask an admin to grant you the 'Connect Claude (MCP)' permission in Settings → People & access."
      />
    );
  }

  const scopes = parseScope(scope);

  return (
    <div className="mx-auto my-16 max-w-xl px-6">
      <div className="app-card p-8">
        <div className="flex items-start gap-4">
          {client.logoUri ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={client.logoUri}
              alt=""
              className="h-10 w-10 rounded"
              width={40}
              height={40}
            />
          ) : (
            <div className="h-10 w-10 rounded bg-[var(--surface-2)]" />
          )}
          <div className="flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-3)]">
              Authorize connection
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-[var(--text-1)]">
              Connect {client.clientName} to Foundry
            </h1>
            <p className="mt-2 text-sm text-[var(--text-2)]">
              {client.clientName} is asking to act in Foundry on your behalf as{" "}
              <strong>{session.user.email ?? session.user.name ?? "this account"}</strong>.
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-md border border-[var(--border-1)] bg-[var(--surface-2)] p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-3)]">
            What this connection can do
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-[var(--text-1)]">
            {scopes.includes("mcp") && (
              <li>
                <strong>Use Foundry MCP tools</strong> — list and create clients, tasks, and
                related records, subject to your own Foundry permissions. Nothing this
                connection does will exceed what you can do signed in.
              </li>
            )}
          </ul>
          <p className="mt-3 text-xs text-[var(--text-3)]">
            You can revoke this connection at any time from{" "}
            <strong>Settings → MCP</strong>.
          </p>
        </div>

        {client.clientUri && (
          <p className="mt-4 text-xs text-[var(--text-3)]">
            Client homepage:{" "}
            <a
              href={client.clientUri}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              {client.clientUri}
            </a>
          </p>
        )}

        <form
          method="POST"
          action="/api/oauth/authorize"
          className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-end"
        >
          <input type="hidden" name="response_type" value={responseType} />
          <input type="hidden" name="client_id" value={clientId} />
          <input type="hidden" name="redirect_uri" value={redirectUri} />
          <input type="hidden" name="scope" value={scope} />
          <input type="hidden" name="state" value={state} />
          <input type="hidden" name="code_challenge" value={codeChallenge} />
          <input type="hidden" name="code_challenge_method" value={codeChallengeMethod} />

          <button
            type="submit"
            name="decision"
            value="deny"
            className="rounded-md border border-[var(--border-1)] bg-[var(--surface-1)] px-4 py-2 text-sm font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            name="decision"
            value="approve"
            className="rounded-md bg-[var(--text-1)] px-4 py-2 text-sm font-medium text-[var(--surface-1)] hover:opacity-90"
          >
            Allow {client.clientName}
          </button>
        </form>
      </div>
    </div>
  );
}

function ErrorScreen({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto my-16 max-w-xl px-6">
      <div className="app-card border-[var(--accent-danger)] p-8">
        <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--accent-danger)]">
          Authorization failed
        </p>
        <h1 className="mt-1 text-xl font-semibold text-[var(--text-1)]">{title}</h1>
        <p className="mt-2 text-sm text-[var(--text-2)]">{body}</p>
      </div>
    </div>
  );
}
