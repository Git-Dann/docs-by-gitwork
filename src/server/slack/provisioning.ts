/**
 * Client channel provisioning.
 *
 * Called via `after()` from createClientRecord (and from the per-client retry
 * route /api/clients/[slug]/provision-slack-channels). MUST be best-effort —
 * Slack failure cannot block client creation. Failures get stamped onto
 * `WorkspaceClient.slackProvisionError` so the Edit-client modal can surface
 * a retry button.
 *
 * Two channel kinds:
 *  - internal — Gitwork-only, typically private. Bot needs `groups:write`.
 *  - external — Slack Connect channel shared with the client's workspace via
 *               `conversations.inviteShared` (admin-tier scopes required:
 *               `conversations.connect:write` + `:manage`).
 */

import { prisma } from "@/lib/prisma";
import {
  connectInvite,
  createConversation,
  getSlackBotToken,
  postMessage,
  setConversationTopic,
} from "./client";

export interface ProvisionRequest {
  /** Create the internal #client-{slug}-internal channel (private). */
  createInternal?: boolean;
  /** Create the external (Slack Connect) #client-{slug} channel. */
  createExternal?: boolean;
  /** Email of the external invitee for Slack Connect (their Slack workspace). */
  externalInviteeEmail?: string;
  /** Override the auto-generated channel name (no leading `#`). */
  customInternalName?: string;
  customExternalName?: string;
}

export interface ProvisionResult {
  ok: boolean;
  errors: string[];
  internal?: { id: string; name: string };
  external?: { id: string; name: string };
}

/** Slack channel names must be 1-80 chars, lowercase, no spaces, dashes/underscores ok. */
function slackChannelName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export async function provisionClientChannels(
  clientId: string,
  opts: ProvisionRequest,
): Promise<ProvisionResult> {
  const result: ProvisionResult = { ok: true, errors: [] };

  const client = await prisma.workspaceClient.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, slug: true, workspaceId: true },
  });
  if (!client) {
    return { ok: false, errors: ["Client not found."] };
  }

  const ws = await prisma.workspace.findUnique({
    where: { id: client.workspaceId },
    select: { slackBotToken: true, slackBotTokenEncrypted: true },
  });
  const token = getSlackBotToken(ws);
  if (!token) {
    const msg = "Slack isn't connected — connect it in Settings → Integrations first.";
    await stampError(clientId, msg);
    return { ok: false, errors: [msg] };
  }

  // ─── Internal channel (private) ──────────────────────────────────────────
  if (opts.createInternal) {
    const name = slackChannelName(opts.customInternalName ?? `client-${client.slug}-internal`);
    const created = await createConversation(token, { name, is_private: true });
    if (created.ok && created.data.channel?.id) {
      const channelId = created.data.channel.id;
      const channelName = created.data.channel.name ?? name;
      result.internal = { id: channelId, name: channelName };
      await prisma.workspaceClient.update({
        where: { id: clientId },
        data: { slackInternalChannelId: channelId, slackInternalChannelName: channelName },
      });
      // Best-effort welcome — failures here don't roll back the provisioning.
      await postMessage(token, {
        channel: channelId,
        text: `:wave: This channel is linked to *${client.name}* in Foundry.`,
      });
      await setConversationTopic(token, {
        channel: channelId,
        topic: `Linked to ${client.name} in Foundry`,
      });
    } else {
      const err = `Internal channel: ${created.error ?? "unknown error"}`;
      result.ok = false;
      result.errors.push(err);
    }
  }

  // ─── External (Slack Connect) channel ────────────────────────────────────
  if (opts.createExternal) {
    if (!opts.externalInviteeEmail?.trim()) {
      const err = "External channel: invitee email is required for Slack Connect.";
      result.ok = false;
      result.errors.push(err);
    } else {
      const name = slackChannelName(opts.customExternalName ?? `client-${client.slug}`);
      const created = await createConversation(token, { name, is_private: false });
      if (created.ok && created.data.channel?.id) {
        const channelId = created.data.channel.id;
        const channelName = created.data.channel.name ?? name;
        const invited = await connectInvite(token, {
          channel_id: channelId,
          emails: [opts.externalInviteeEmail.trim()],
          external_limited: false,
        });
        if (invited.ok) {
          result.external = { id: channelId, name: channelName };
          await prisma.workspaceClient.update({
            where: { id: clientId },
            data: { slackExternalChannelId: channelId, slackExternalChannelName: channelName },
          });
          await postMessage(token, {
            channel: channelId,
            text: `:wave: Welcome — this Slack Connect channel is linked to *${client.name}* in Foundry.`,
          });
        } else {
          const err = `External invite: ${invited.error ?? "unknown error"}`;
          result.ok = false;
          result.errors.push(err);
          // Leave the channel created (the admin can invite manually) but record
          // the failure so the retry button surfaces it.
        }
      } else {
        const err = `External channel: ${created.error ?? "unknown error"}`;
        result.ok = false;
        result.errors.push(err);
      }
    }
  }

  // Stamp / clear the sticky error so the UI knows whether to show "retry".
  await prisma.workspaceClient.update({
    where: { id: clientId },
    data: { slackProvisionError: result.ok ? null : result.errors.join(" · ") },
  });

  return result;
}

async function stampError(clientId: string, message: string): Promise<void> {
  await prisma.workspaceClient
    .update({ where: { id: clientId }, data: { slackProvisionError: message } })
    .catch(() => undefined);
}

/** Helper for effective-channel resolution — prefer the new dual-channel field. */
export function effectiveInternalChannel(client: {
  slackInternalChannelId?: string | null;
  slackChannelId?: string | null;
}): string | null {
  return client.slackInternalChannelId ?? client.slackChannelId ?? null;
}
