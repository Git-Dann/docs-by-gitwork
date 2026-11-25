/**
 * Every API handler is accounted for: it asserts authority itself, or it hands the caller to
 * a server module that does, or it is listed below with the reason it needs neither.
 *
 * CLAUDE.md §57.6 item 2 has recorded "routes that know who you are and never ask what you may
 * do" since October. §135 fixed 37 writes under /api/clients/[slug]; §42.16 fixed eleven in
 * Care. This is the gate that stops the rest growing back.
 *
 * ⚠️ SCOPING IS NOT AUTHORITY, and keeping them apart is the whole point. `workspaceIdForRequest`
 * answers *whose data*; it never answers *may you*. Fold the two together and
 * /api/retention/purge reads as gated — it resolves a caller, checks a role and returns 403 —
 * while deleting another business's cold archives by id. That is exactly how it hid.
 *
 * ⚠️ The accept-list must EXCLUDE the throughput asserts (assertWithinRateLimit,
 * assertBoardWriteRate, assertValidTurnstileToken, assertScannableUrl …). They match
 * /assert\w+\(/ and assert validity, never authority.
 *
 * ⚠️ Assert per handler, never per file: plenty of route files export more than one, so a
 * file-level grep lets a gated POST vouch for an ungated GET.
 */
import { describe, expect, it } from "vitest";

import { handlers, preamble, readSource, routeFiles, sawFiles } from "@/testing/source";

const API = "src/app/api";

/** Answers WHO the caller is. Never, on its own, what they may do. */
const IDENTITY =
  /\b(requireAuthedUser|requireAuthedUserOrDefault|getRequestUser|getEffectiveUserOrNull|requestActor|resolveMcpActor|commitmentsUser|getUserGoogleAuth)\s*\(|\bawait auth\(\)/;

/** Answers WHAT they may do. */
const AUTHORITY =
  /\b(assertCan|assertAtLeast\w+|assertSuperAdmin\w*|assertInternal|assertCanApprove\w+|assertCanPublish\w+|requireTeamAdmin|requirePlatformAdmin|requireSupport\w+|requireDocumentInWorkspace|requireRowOf\w+|assertClient\w+|requireClientIdForSlug|requireWorkspaceClientInWorkspace|requireScanAccess|assertPulseScanAccess|assertMonitorWriter|resolveInternal\w+|resolveBoardWriter|resolveLaunchpadWriter|resolveCourseRequestAccess|resolveChangelogApprover|resolveWikiAccessUser|resolveWikiDriveAccess|requireForgeImporter|assertEntryInWiki|assertCron|assertMcpEnabled|can[A-Z]\w+|profileAccess)\s*\(/;

/**
 * Narrows to a workspace or a client. Necessary, never sufficient — listed only so the
 * failure message can tell "scoped but ungated" from "nothing at all".
 */
const SCOPE = /\b(workspaceIdForRequest|requestWorkspaceId|clientIdForSlug|docsWorkspaceId)\s*\(/;

/**
 * `isAtLeast(user.role, "ADMIN")` IS authority — but only on a user the request just read
 * from the database. On `session.user.role` it is the role the token was minted with, which
 * is §88's defect and is what let a demoted Super Admin keep /api/roles/permissions.
 *
 * ⚠️ So this is deliberately anchored on `user.` / `actor.`, never on `session.`, and it only
 * counts when the handler also resolves an identity. A regex that accepted plain `isAtLeast(`
 * would have called every one of those routes gated.
 */
const ROLE_ON_DB_USER = /\b(isAtLeast|isSuperAdmin)\s*\(\s*(user|actor|caller)[.)]/;

/** Calls that are plumbing, not a server module reached with the caller's authority. */
const PLUMBING =
  /^(apiOk|apiError|fromError|NextResponse|Response|JSON|Number|String|Boolean|Array|Object|Date|Math|console|parse\w*|safeParse|trim|slice|split|replace|toLowerCase|toUpperCase|toISOString|toLocaleDateString|test|map|filter|join|push|includes|startsWith|endsWith|get|set|has|from|keys|values|entries|stringify|now|error|warn|log|json|text|formData|headers|searchParams|Uint8Array|Buffer|URL|URLSearchParams|redirect|Promise|all|allSettled|catch|then|toString|concat|find|some|every|sort|reduce|forEach|match|encodeURIComponent|decodeURIComponent|isFinite|round|after|revalidateTag|revalidatePath|cookies|clientIpFrom|assert\w+|require\w+|resolve\w+|get[A-Z]\w*Auth|auth|commitmentsUser|workspaceIdForRequest|requestWorkspaceId|requestActor|getEffectiveUserOrNull|getRequestUser|ensureBaseRecords|isPlatformAdminUserId)$/;

/** The caller, or something derived from them, reached this call. */
const CARRIES_CALLER =
  /\buser\b|\bactor\b|\bworkspaceId\b|\bwsId\b|\bcaller\b|requireAuthedUser|commitmentsUser|getEffectiveUserOrNull|getRequestUser|requestActor/;

type Handler = { key: string; file: string; method: string; body: string };

function allHandlers(): Handler[] {
  const out: Handler[] = [];
  for (const f of routeFiles(API)) {
    const rel = f.slice(f.indexOf(API) + API.length + 1);
    const src = readSource(f);
    // A guard can live at module scope (a local `resolveClientId` helper above the exports).
    const pre = preamble(src);
    for (const h of handlers(src)) {
      const body = AUTHORITY.test(pre) || IDENTITY.test(pre) ? `${h.body}\n${pre}` : h.body;
      out.push({ key: `${h.method} ${rel}`, file: rel, method: h.method, body });
    }
  }
  return out;
}

function unscopedCalls(body: string): string[] {
  const bare: string[] = [];
  const re = /\bawait\s+([a-z][A-Za-z0-9_]*)\s*\(([^)]{0,160})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const [, fn, args] = m;
    if (PLUMBING.test(fn)) continue;
    if (!CARRIES_CALLER.test(args)) bare.push(fn);
  }
  return [...new Set(bare)];
}


/**
 * Families whose credential is in the URL or the signature, not in a session.
 *
 * ⚠️ A family entry is only honoured when `src/middleware.ts` really treats that prefix as
 * public. The claim and the policy are checked against each other below, so "this family is
 * public" can never be an assertion made only here — which is how `/api/support/discord/channels`
 * sat in an exemption list for months describing its job instead of its safety (§42.16).
 */
const PUBLIC_FAMILIES: Array<{ prefix: string; api: string; why: string; proof: RegExp }> = [
  {
    prefix: "wiki/",
    api: "/api/wiki",
    why: "A client's wiki share link. The token in the URL is the credential, and a write additionally needs a wiki sign-in or this client's own team (resolveBoardWriter / resolveLaunchpadWriter / verifyWikiAccessCookie).",
    proof: /resolvePublicWiki|resolveWikiAccessUser|resolveWikiDriveAccess|resolveLaunchpadWriter|resolveBoardWriter|resolveCourseRequestAccess|resolveChangelogApprover|resolveWikiIdByPublicToken|verifyWikiAccessCookie|ByToken\(|\btoken\b|\bkey\b/,
  },
  {
    prefix: "vet/",
    api: "/api/vet",
    why: "A candidate's vetting link. The token identifies the session and is the only credential a candidate has; every handler passes it into the domain call that loads their row.",
    proof: /\btoken\b/,
  },
  {
    prefix: "docs/",
    api: "/api/docs",
    why: "A document share link. resolveSharedDocId resolves the token to one document, and nothing else about the workspace is reachable from it.",
    proof: /resolveSharedDoc|\btoken\b/,
  },
  {
    prefix: "onboarding/",
    api: "/api/onboarding",
    why: "A client onboarding link. getOnboardingByTokenPublic resolves the token to the one session it was minted for.",
    proof: /getOnboardingByTokenPublic|\btoken\b/,
  },
  {
    prefix: "sign/",
    api: "/api/sign",
    why: "An e-signature link. findSignerByToken resolves the token to one signer on one document.",
    proof: /findSignerByToken|\btoken\b/,
  },
  {
    prefix: "report/",
    api: "/api/report",
    why: "A shared Pulse report. The scan is looked up by shareToken AND isShared, so unsharing revokes the link rather than leaving it resolvable.",
    proof: /shareToken/,
  },
  {
    prefix: "badge/",
    api: "/api/badge",
    why: "A public badge image. It is keyed on the same share token as the report it links to and shows strictly less, so it can never outlive the thing it attests.",
    proof: /ByToken|loadBadgeScan|\btoken\b/,
  },
  {
    prefix: "u/",
    api: "/api/u",
    why: "A public profile page. Served only while the person has published it — publicAvatarUserId returns nothing for a profile that is off or archived.",
    proof: /publicAvatarUserId|profileSlug|\bslug\b/,
  },
  // ⚠️ NOT a blanket "public/" family. Middleware lists four specific sub-paths, so a new
  // route under src/app/api/public/ is NOT public to it — it is session-gated like anything
  // else, and claiming the whole folder here would have said otherwise. The cross-check below
  // is what caught that.
  {
    prefix: "public/pulse/",
    api: "/api/public/pulse",
    why: "The anonymous Pulse embed. Email is required up front, then a honeypot, Turnstile, one lifetime scan per email, the SSRF guard and a Postgres rate limiter — in that order (§18).",
    proof: /getPulseEmbedWorkspaceConfig|honeypotTripped|assertWithinRateLimit|assertScannableUrl|PulseEmbedDisabled|renderPulseReportPdf|\btoken\b/,
  },
  {
    prefix: "public/wiki-items/",
    api: "/api/public/wiki-items",
    why: "The client intake API. The per-client token in the URL both authenticates and names the client, so there is no way to express 'write to a different client's wiki' (§40.1).",
    proof: /resolvePresentedIntakeToken|wikiIntakeTokenState|\btoken\b/,
  },
  {
    prefix: "public/course-requests/",
    api: "/api/public/course-requests",
    why: "Big Wedge's own course-request feed, on the same per-client intake token as the wiki-items API above.",
    proof: /courseIngestToken|ingestCourseRequestsByToken|\btoken\b/,
  },
  {
    prefix: "public/heartbeat/",
    api: "/api/public/heartbeat",
    why: "A heartbeat monitor's ping URL. The URL IS the credential, and forPublic strips it from the client's copy of the wiki so a share link never carries it (§106).",
    proof: /\btoken\b/,
  },
  {
    prefix: "apply/",
    api: "/api/apply",
    why: "Gitwork's own careers page. The access cookie gates the content and there is no workspace data behind it.",
    proof: /isAccessCookieValid|assertWithinRateLimit/,
  },
  {
    prefix: "auth/",
    api: "/api/auth",
    why: "Sign-in itself. By definition there is no caller to authorise yet; each path proves possession of something instead — a Google ID token, a password, a single-use reset or invite token — and is rate limited.",
    proof: /verifyGoogleIdToken|verifyPassword|requestPasswordReset|completePasswordReset|acceptInviteWithPassword|assertWithinRateLimit|findHomeMembership/,
  },
  // ⚠️ Not a blanket "webhooks/" family either — middleware lists github and slack, and NOT
  // docuseal, which therefore gets its own verdict below rather than a free pass from a
  // neighbouring folder.
  {
    prefix: "webhooks/github/",
    api: "/api/webhooks/github",
    why: "Inbound from GitHub. The HMAC over the raw body is the credential and is verified before anything is read or written.",
    proof: /verifyGithubSignature|verifySignature|resolveSigningSecret/,
  },
  {
    prefix: "webhooks/slack/",
    api: "/api/webhooks/slack",
    why: "Inbound from Slack. verifySlackSignature checks the HMAC over the raw bytes first, which is the only auth this path has (§36).",
    proof: /verifySlackSignature/,
  },
  {
    prefix: "support/webhook/",
    api: "/api/support/webhook",
    why: "A Care channel's inbound hook. The token in the URL resolves the one connection it belongs to; no API key is required and none would help.",
    proof: /\btoken\b/,
  },
];

/**
 * The rest, one by one. ⚠️ Each line says why the handler is safe WITHOUT a gate — never what
 * it does. An exemption that describes the job is how /api/support/discord/channels sat
 * ungated for months with a note beside it (§42.16).
 */
const VERDICTS: Record<string, string> = {
  // --- Authorised by middleware alone: no session, but no workspace data either. ---
  "GET health/route.ts":
    "Liveness. Returns a commit sha and, with ?deep=1, whether Postgres answers. No workspace data and nothing to scope — deploy/health-check.sh polls it before a release is kept (§143).",
  "GET proof/health/route.ts":
    "The same, for the Proof worker. A status word and nothing read from the database.",
  "GET fx/usd-gbp/route.ts":
    "One public ECB rate from Frankfurter, cached. Nothing about the workspace reaches it and nothing identifies the caller.",
  "GET push/public-key/route.ts":
    "The VAPID PUBLIC key. It is published by definition — a browser needs it to subscribe, and it authorises nothing on its own.",
  "GET og-preview/route.ts":
    "Renders a share-card image from the query string alone. It reads no row, so there is nothing a caller could be scoped to.",
  "GET internal/resolve-host/route.ts":
    "Resolves a hostname for the custom-domain setup check. It takes a name and returns DNS, reading nothing from the database.",
  "POST monitor-probe/route.ts":
    "The second check location (§107). Authorised by MONITOR_PROBE_SECRET, not a session — it 404s without the secret and reads no database at all.",
  "GET study/personas/route.ts":
    "The eight built-in research personas, a static in-code catalogue. §26 kept this one open deliberately when every other Study route was closed to admins.",
  "POST portal/login/route.ts":
    "A client user signing in to their own wiki. There is no caller to authorise yet; it proves a password and is rate limited.",
  "POST oauth/revoke/route.ts":
    "Revokes a token by presenting it. Possession of the token is the only credential that could apply, and revoking is the safe direction.",
  "GET mcp/route.ts":
    "The MCP transport. validateMcpBearer resolves the bearer to an McpConnection and the workspace it was approved in, which is the gate (§88).",
  "GET integrations/gmail/callback/route.ts":
    "Google's OAuth redirect back to us. It carries Google's own code and the state we minted; there is no Foundry caller on the hop by design.",

  // --- A credential that is not a session. ---
  "POST webhooks/docuseal/route.ts":
    "Inbound from DocuSeal, with an HMAC over the raw body when DOCUSEAL_WEBHOOK_SECRET is set. ⚠️ Unlike github and slack it is NOT in PUBLIC_API_PATHS, so middleware also requires a credential — see the note in the PR, because that means either DocuSeal sends one or these deliveries are being refused.",
  "GET golf/clubs/route.ts":
    "An export endpoint Big Wedge's own developers call with the workspace API key, which middleware verifies. A user-permission gate would refuse the integration it exists for.",
  "GET golf/clubs/openapi/route.ts":
    "The OpenAPI document for the endpoint above. It describes the shape and returns no data.",
  "POST agents/pulse-scan/route.ts":
    "Runs a lite scan of a public URL for an AI coding tool, behind middleware's workspace API key or OAuth bearer. It is SSRF-guarded, AI-free and persists nothing, so there is no workspace row to scope it to.",
  "GET agents/status/route.ts":
    "An ephemeral in-memory agent-state beacon, scoped to the caller's workspace and never persisted. Reading it tells you which of your own sessions is busy.",
  "POST agents/status/route.ts":
    "The write half of the same beacon. In-memory, workspace-scoped, dropped on restart — there is no stored state for a permission to protect.",

  // --- The caller travels inside a scope object. ---
  "POST dispatch/chat/route.ts":
    "runTurn is handed the scope openScope built from the signed-in caller after assertAssistantAvailable, and every tool it runs re-checks assertClientInScope against scope.user, so the caller is carried even though the argument isn't named user.",

  // --- Any member may read their own workspace's own settings. ---
  "GET workspace/branding/route.ts":
    "The workspace's own logo and colours, scoped to the caller's workspace. ⚠️ Deliberately NOT gated: the document cover renders it, including on a client's share link, so a session gate here would break the page the client sees.",
  "GET workspace/defaults/route.ts":
    "The workspace's document defaults (preparedBy, confidentiality). Scoped to the caller's workspace, and every member writing a document needs them.",
  "GET workspace/pulse-embed/route.ts":
    "Reads the embed's own configuration for the caller's workspace. The PATCH beside it is Admin-gated; reading which checks the public widget shows is not a secret.",
  "GET workspace/pulse-pricing/route.ts":
    "The same, for the embed's pricing copy. Scoped to the caller's workspace; the PATCH is gated.",
  "GET codeclear/tech-stacks/route.ts":
    "A global technology-name catalogue (React, Swift). No workspaceId on the model, no customer data in it, and the POST beside it is Admin-gated.",
};

describe("every API handler is accounted for", () => {
  const hs = sawFiles(allHandlers(), 800, "API handlers");

  it("asserts authority, hands the caller on, or has a verdict", () => {
    const unaccounted: string[] = [];
    for (const h of hs) {
      if (AUTHORITY.test(h.body)) continue;
      if (IDENTITY.test(h.body) && ROLE_ON_DB_USER.test(h.body)) continue;
      if (VERDICTS[h.key] || VERDICTS[h.file]) continue;
      const fam = PUBLIC_FAMILIES.find((f) => h.file.startsWith(f.prefix));
      if (fam && fam.proof.test(h.body)) continue;
      if (IDENTITY.test(h.body) && unscopedCalls(h.body).length === 0) continue;
      const why = IDENTITY.test(h.body)
        ? `calls ${unscopedCalls(h.body).join(", ")} without the caller`
        : SCOPE.test(h.body)
          ? "scoped to a workspace but never gated"
          : "no identity, no authority";
      unaccounted.push(`${h.key}  — ${why}`);
    }
    expect(unaccounted, `handlers with no gate and no verdict:\n${unaccounted.join("\n")}`).toEqual([]);
  });

  it("every public family is one middleware really treats as public", () => {
    const middleware = readSource("src/middleware.ts");
    const block = /const PUBLIC_API_PATHS[\s\S]*?\n\]/.exec(middleware);
    expect(block, "PUBLIC_API_PATHS is gone from middleware.ts").not.toBeNull();
    for (const f of PUBLIC_FAMILIES) {
      expect(block![0], `${f.prefix} is claimed public here but middleware does not list ${f.api}`).toContain(
        `"${f.api}"`,
      );
    }
  });

  it("every family still matches at least one route, and every reason is an argument", () => {
    const files = new Set(allHandlers().map((h) => h.file));
    for (const f of PUBLIC_FAMILIES) {
      expect([...files].some((x) => x.startsWith(f.prefix)), `${f.prefix} matches no route`).toBe(true);
      expect(f.why.length, `${f.prefix}: the reason is too short to be an argument`).toBeGreaterThan(60);
    }
  });

  it("every verdict names a handler that still exists, with a reason", () => {
    const keys = new Set(allHandlers().map((h) => h.key));
    const files = new Set(allHandlers().map((h) => h.file));
    for (const [k, why] of Object.entries(VERDICTS)) {
      expect(keys.has(k) || files.has(k), `the verdict names "${k}", which is not a handler`).toBe(true);
      expect(why.length, `${k}: "${why}" is too short to be an argument`).toBeGreaterThan(40);
    }
  });
});
