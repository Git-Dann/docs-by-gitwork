/**
 * Slack Events API webhook — where Dispatch is spoken to.
 *
 * Slack POSTs here on `app_mention` and on DMs to the bot. Two hard requirements:
 *   1. Ack within 3 seconds, or Slack re-delivers (up to 3×) and eventually disables the
 *      subscription. Composing an answer takes longer than that, so the handler runs in
 *      `after()` — the response is already on the wire before any work starts. Unlike the
 *      interactions route (which must finish `views.open` inside the 3s `trigger_id` window),
 *      nothing here expires, so deferring is not just safe but correct.
 *   2. Verify the signature over the RAW bytes. `/api/webhooks/slack` is a public path in
 *      middleware — the HMAC is the only auth this endpoint has.
 *
 * The `url_verification` handshake is answered BEFORE signature verification is required to
 * have a configured workspace, because Slack sends it while the app is being set up; it is
 * still signature-checked, and it echoes only the challenge Slack itself sent.
 */

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { apiError, apiOk } from "@/lib/api-response";
import { decryptNullable } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";
import { getSlackBotToken } from "@/server/slack/client";
import { handleSlackEvent, parseEventBody } from "@/server/slack/events";
import { verifySlackSignature } from "@/server/slack/signature";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const WS_SELECT = {
  id: true,
  slackSigningSecretEncrypted: true,
  slackBotToken: true,
  slackBotTokenEncrypted: true,
  slackBotUserId: true,
} as const;

/**
 * Resolve the workspace this event belongs to. `Workspace.slackTeamId` is not reliably
 * populated (see the commands route), so fall back to the single-tenant "any workspace with a
 * signing secret" — the same shortcut the other two Slack endpoints take.
 */
async function resolveWorkspace(teamId: string | undefined) {
  const byTeam = teamId
    ? await prisma.workspace.findFirst({ where: { slackTeamId: teamId }, select: WS_SELECT })
    : null;
  if (byTeam?.slackSigningSecretEncrypted) return byTeam;
  return prisma.workspace.findFirst({
    where: { slackSigningSecretEncrypted: { not: null } },
    select: WS_SELECT,
  });
}

export async function POST(request: NextRequest) {
  // 1. Raw bytes BEFORE any parse — the signature is computed over them.
  const rawBody = await request.text();
  const signature = request.headers.get("x-slack-signature");
  const timestamp = request.headers.get("x-slack-request-timestamp");

  const envelope = parseEventBody(rawBody);
  if (!envelope) return apiError("Malformed Slack event payload.", 400);

  const ws = await resolveWorkspace(envelope.team_id);
  if (!ws?.slackSigningSecretEncrypted) {
    return apiError("Slack integration is not configured.", 503);
  }

  let signingSecret: string | null = null;
  try {
    signingSecret = decryptNullable(ws.slackSigningSecretEncrypted);
  } catch {
    signingSecret = null;
  }
  if (!signingSecret) return apiError("Slack signing secret is unreadable.", 503);

  const verdict = verifySlackSignature({ rawBody, signature, timestamp, signingSecret });
  if (!verdict.ok) return apiError(`Invalid Slack signature (${verdict.reason}).`, 401);

  // 2. Setup handshake — Slack expects the bare challenge string echoed at the top level,
  //    not wrapped in our apiOk envelope.
  if (envelope.type === "url_verification") {
    return NextResponse.json({ challenge: envelope.challenge ?? "" });
  }

  if (envelope.type !== "event_callback") {
    return apiOk({ status: "ignored" });
  }

  // 3. Ack now, work after. Everything downstream is best-effort and self-logging; a throw in
  //    here must never turn into a Slack retry storm.
  const botToken = getSlackBotToken(ws);
  after(async () => {
    try {
      await handleSlackEvent({
        envelope,
        workspaceId: ws.id,
        botToken,
        botUserId: ws.slackBotUserId ?? null,
      });
    } catch (err) {
      console.warn("[slack] event handling failed", err);
    }
  });

  return apiOk({ status: "received" });
}
