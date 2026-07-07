/**
 * Slack slash-command webhook — `/desk <who> <what>` adds a reminder to a
 * teammate's On Your Desk list.
 *
 * Slack POSTs slash commands as `application/x-www-form-urlencoded`. We must:
 *   1. read the raw body (signature is computed over byte-exact content),
 *   2. verify X-Slack-Signature against the workspace's signing secret,
 *   3. respond 200 within 3s with an ephemeral JSON body.
 *
 * Mirrors src/app/api/webhooks/slack/interactions/route.ts. Public path
 * (`/api/webhooks/slack` in middleware); the HMAC signature is the auth.
 */

import { NextRequest, NextResponse } from "next/server";
import { decryptNullable } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";
import { verifySlackSignature } from "@/server/slack/signature";
import { getSlackBotToken } from "@/server/slack/client";
import { handleDeskCommand } from "@/server/slack/commands";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

function ephemeral(text: string) {
  // Slack shows this only to the caller. Top-level shape (not our apiOk envelope).
  return NextResponse.json({ response_type: "ephemeral", text });
}

export async function POST(request: NextRequest) {
  // 1. Raw bytes BEFORE parsing — the signature is computed over them.
  const rawBody = await request.text();
  const signature = request.headers.get("x-slack-signature");
  const timestamp = request.headers.get("x-slack-request-timestamp");

  const params = new URLSearchParams(rawBody);
  const teamId = params.get("team_id") ?? undefined;

  // 2. Resolve the workspace. Try the Slack team id first, but ALWAYS fall back to
  //    the single-tenant "any workspace with a signing secret" — `Workspace.slackTeamId`
  //    is not populated anywhere, so a team-id-only match would always miss for
  //    slash commands (which always send a team_id).
  const wsSelect = {
    id: true,
    slackSigningSecretEncrypted: true,
    slackBotToken: true,
    slackBotTokenEncrypted: true,
  } as const;
  let ws = teamId
    ? await prisma.workspace.findFirst({ where: { slackTeamId: teamId }, select: wsSelect })
    : null;
  if (!ws?.slackSigningSecretEncrypted) {
    ws = await prisma.workspace.findFirst({
      where: { slackSigningSecretEncrypted: { not: null } },
      select: wsSelect,
    });
  }

  let signingSecret: string | null = null;
  try {
    signingSecret = ws?.slackSigningSecretEncrypted
      ? decryptNullable(ws.slackSigningSecretEncrypted)
      : null;
  } catch {
    signingSecret = null;
  }
  if (!ws || !signingSecret) {
    return ephemeral("Slack isn't connected to Foundry yet.");
  }

  const verdict = verifySlackSignature({ rawBody, signature, timestamp, signingSecret });
  if (!verdict.ok) {
    return NextResponse.json({ error: `Invalid Slack signature (${verdict.reason}).` }, { status: 401 });
  }

  try {
    const reply = await handleDeskCommand({
      workspaceId: ws.id,
      text: params.get("text"),
      callerName: params.get("user_name") || "someone",
      callerSlackId: params.get("user_id"),
      botToken: getSlackBotToken(ws),
    });
    return ephemeral(reply);
  } catch (err) {
    console.warn("[slack] /desk command failed", err);
    return ephemeral("Something went wrong adding that — try again.");
  }
}
