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

  const scopes = parseScope(scope);

  return (
    <div className="mx-auto my-16 max-w-xl px-6">
      <div className="rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">Connect {client.clientName} to Foundry</h1>
        <p className="mt-2 text-sm text-neutral-600">
          {client.clientName} is asking for permission to act in Foundry on your behalf,
          as <strong>{session.user.email ?? session.user.name ?? "this account"}</strong>.
        </p>

        <div className="mt-6 rounded-md border border-neutral-200 bg-neutral-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Permissions requested
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-neutral-800">
            {scopes.includes("mcp") && (
              <li>
                <strong>Use Foundry MCP tools.</strong> Read and modify clients, tasks,
                and other workspace data — subject to your own Foundry permissions.
                Nothing this connection does will exceed what you can do signed in.
              </li>
            )}
          </ul>
        </div>

        {client.clientUri && (
          <p className="mt-4 text-xs text-neutral-500">
            Learn more about this client:{" "}
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
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            name="decision"
            value="approve"
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
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
      <div className="rounded-lg border border-red-200 bg-red-50 p-8">
        <h1 className="text-xl font-semibold text-red-900">{title}</h1>
        <p className="mt-2 text-sm text-red-800">{body}</p>
      </div>
    </div>
  );
}
