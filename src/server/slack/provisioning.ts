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
  inviteToConversation,
  lookupUserByEmail,
  postMessage,
  setConversationTopic,
} from "./client";
import { clientTeam } from "@/server/client-team";

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
  /** Who was added to the new internal channel, and who couldn't be (no Slack account found). */
  invited?: string[];
  notInvited?: string[];
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
      // The client's team is invited straight away (§168), so the channel isn't just Foundry.
      // Best effort: a person with no Slack account is named in the welcome, never a failure.
      const team = await inviteClientTeam(token, client.workspaceId, clientId, channelId);
      result.invited = team.invited;
      result.notInvited = team.notInvited;
      // Best-effort welcome — failures here don't roll back the provisioning.
      await postMessage(token, {
        channel: channelId,
        text: welcomeText(client.name, team),
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

/**
 * Invite a client's team (client-team.ts) into a channel, matching each person to Slack by email.
 * Never throws: who couldn't be added is returned so the welcome message can say so.
 */
export async function inviteClientTeam(
  token: string,
  workspaceId: string,
  clientId: string,
  channelId: string,
): Promise<{ invited: string[]; notInvited: string[]; error?: string }> {
  const team = await clientTeam(workspaceId, clientId);
  const found: { name: string; slackId: string }[] = [];
  const notInvited: string[] = [];
  for (const person of team) {
    if (!person.email) {
      notInvited.push(person.name);
      continue;
    }
    const hit = await lookupUserByEmail(token, person.email);
    if (hit.ok && hit.data.user?.id && !hit.data.user.is_bot) found.push({ name: person.name, slackId: hit.data.user.id });
    else notInvited.push(person.name);
  }
  if (!found.length) return { invited: [], notInvited };
  const res = await inviteToConversation(token, { channel: channelId, users: found.map((f) => f.slackId) });
  // already_in_channel is fine; anything else means nobody was added.
  if (!res.ok && res.error !== "already_in_channel") {
    return { invited: [], notInvited: [...found.map((f) => f.name), ...notInvited], error: res.error };
  }
  return { invited: found.map((f) => f.name), notInvited };
}

/** The first message in a new internal channel: what it is, who's here, who to add by hand. */
export function welcomeText(clientName: string, team: { invited: string[]; notInvited: string[]; error?: string }): string {
  const lines = [`:wave: This channel is linked to *${clientName}* in Foundry. Mention @Foundry here to ask about the project.`];
  if (team.invited.length) lines.push(`I've added the team: ${team.invited.join(", ")}.`);
  if (team.error) lines.push(`I couldn't add the team (Slack said \`${team.error}\`), so they'll need adding by hand.`);
  if (team.notInvited.length && !team.error) {
    lines.push(`I couldn't find ${team.notInvited.join(", ")} in Slack by their email, so please add them by hand.`);
  }
  return lines.join("\n");
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
