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

  // Distinct, actionable messages so a single test pinpoints the gate.
  if (!ws) {
    return ephemeral("No workspace found. (reason: no-workspace)");
  }
  if (!ws.slackSigningSecretEncrypted) {
    return ephemeral("No Slack signing secret is saved in Foundry. (reason: no-secret)");
  }
  let signingSecret: string | null = null;
  try {
    signingSecret = decryptNullable(ws.slackSigningSecretEncrypted);
  } catch {
    signingSecret = null;
  }
  if (!signingSecret) {
    return ephemeral(
      "Couldn't read the saved Slack signing secret — re-paste it in Settings → Integrations and Save. (reason: decrypt)",
    );
  }

  const verdict = verifySlackSignature({ rawBody, signature, timestamp, signingSecret });
  if (!verdict.ok) {
    // Surface to the caller (ephemeral) instead of a bare 401 so it's debuggable.
    // No action is taken on a bad signature, so this stays safe.
    return ephemeral(
      `Slack signature check failed (reason: ${verdict.reason}). If you just re-saved the secret, confirm it matches Slack → Basic Information → Signing Secret.`,
    );
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
