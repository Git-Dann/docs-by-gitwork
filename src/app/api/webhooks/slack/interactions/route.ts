/**
 * Slack interactivity webhook.
 *
 * Slack POSTs here when a user clicks a Block Kit button, submits a modal, or
 * triggers a shortcut. The endpoint must:
 *   1. read the raw body (signature is computed over byte-exact content)
 *   2. verify X-Slack-Signature against the workspace's signing secret
 *   3. respond 200 within 3s — AND, for any modal-opening action, the
 *      `views.open` call must complete before that 3s window closes, because
 *      `trigger_id`s expire 3 seconds after issue. Using `after()` to defer
 *      the work pushed the openView past the trigger_id expiry in some cases
 *      (Notes worked when fast, Comment didn't), so the handler now runs
 *      SYNCHRONOUSLY before the 200 response.
 *
 * Mirrors src/app/api/webhooks/github/[monitorId]/route.ts otherwise.
 *
 * Single-workspace shortcut: this app currently runs against one Workspace row,
 * so we look up the first Workspace whose signing secret is set. If/when we
 * multi-tenant this, switch to looking up by `payload.team.id` against
 * `Workspace.slackTeamId`.
 */

import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/api-response";
import { decryptNullable } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";
import { verifySlackSignature } from "@/server/slack/signature";
import { handleInteraction, parseInteractionBody } from "@/server/slack/interactions";

export const dynamic = "force-dynamic";
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

  // 3. Run the handler SYNCHRONOUSLY so views.open finishes before the
  //    trigger_id expires (Slack: 3-second window). Errors are swallowed
  //    inside handleInteraction itself; the route always 200s so Slack
  //    doesn't surface a "something went wrong" toast to the operator.
  try {
    await handleInteraction(peeked);
  } catch (err) {
    console.warn("[slack] interaction dispatch failed", err);
  }
  return apiOk({ status: "received" });
}
