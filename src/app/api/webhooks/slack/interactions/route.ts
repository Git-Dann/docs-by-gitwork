/**
 * Slack interactivity webhook.
 *
 * Slack POSTs here when a user clicks a Block Kit button, submits a modal, or
 * triggers a shortcut. The endpoint must:
 *   1. read the raw body (signature is computed over byte-exact content)
 *   2. verify X-Slack-Signature against the workspace's signing secret
 *   3. respond 200 within 3s (Slack times out otherwise)
 *   4. dispatch the real handler in the background via `after()`
 *
 * Mirrors src/app/api/webhooks/github/[monitorId]/route.ts.
 *
 * Single-workspace shortcut: this app currently runs against one Workspace row,
 * so we look up the first Workspace whose signing secret is set. If/when we
 * multi-tenant this, switch to looking up by `payload.team.id` against
 * `Workspace.slackTeamId`.
 */

import { after, NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/api-response";
import { decryptNullable } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";
import { verifySlackSignature } from "@/server/slack/signature";
import { handleInteraction, parseInteractionBody } from "@/server/slack/interactions";

export const dynamic = "force-dynamic";
// Slack times out interactivity calls at 3s. The real work runs in after().
export const maxDuration = 10;

async function resolveSigningSecret(teamId: string | undefined): Promise<string | null> {
  // Prefer a workspace whose Slack team id matches the payload; fall back to
  // any workspace with a configured signing secret (single-tenant deploys).
  const ws = teamId
    ? await prisma.workspace.findFirst({
        where: { slackTeamId: teamId },
        select: { slackSigningSecretEncrypted: true },
      })
    : await prisma.workspace.findFirst({
        where: { slackSigningSecretEncrypted: { not: null } },
        select: { slackSigningSecretEncrypted: true },
      });
  if (!ws?.slackSigningSecretEncrypted) return null;
  try {
    return decryptNullable(ws.slackSigningSecretEncrypted);
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  // 1. Capture raw bytes BEFORE any JSON parse — signature is computed over them.
  const rawBody = await request.text();
  const signature = request.headers.get("x-slack-signature");
  const timestamp = request.headers.get("x-slack-request-timestamp");

  // 2. Peek at the payload (without trusting it) to learn which team it claims
  //    to be from. The signature verification step below proves it's authentic.
  const peeked = parseInteractionBody(rawBody);
  const teamId = peeked?.team?.id;

  const signingSecret = await resolveSigningSecret(teamId);
  if (!signingSecret) {
    return apiError("Slack integration is not configured.", 503);
  }

  const verdict = verifySlackSignature({
    rawBody,
    signature,
    timestamp,
    signingSecret,
  });
  if (!verdict.ok) {
    return apiError(`Invalid Slack signature (${verdict.reason}).`, 401);
  }

  if (!peeked) {
    return apiError("Malformed Slack payload.", 400);
  }

  // 3. ACK immediately. 4. dispatch the real handler in the background.
  after(() => handleInteraction(peeked));
  return apiOk({ status: "received" });
}
