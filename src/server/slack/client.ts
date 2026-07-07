/**
 * Thin Slack Web API wrappers — one place to call `https://slack.com/api/...` from.
 *
 * Every call returns the parsed JSON body (`SlackResponse<T>`); we never throw on a
 * Slack-level error (those come back as `{ ok: false, error: "..." }`), since
 * callers want to surface the verbatim error to the user / log. Network failures
 * still reject — wrap callers in `try` or rely on the existing fire-and-forget
 * pattern used by notifications.
 *
 * Token reads go through `getSlackBotToken(workspace)`: the encrypted column wins
 * over the legacy plaintext `slackBotToken`. The plaintext column is kept until
 * Phase 4 so deploys can roll forward / back without losing the token.
 */

import { decryptNullable } from "@/lib/encryption";

const SLACK_API = "https://slack.com/api";

export interface SlackResponse<T = Record<string, unknown>> {
  ok: boolean;
  error?: string;
  warning?: string;
  response_metadata?: { next_cursor?: string; messages?: string[] };
  // Slack fields vary per call — spread the rest as a typed payload.
  data: T;
}

interface WorkspaceSlackFields {
  slackBotToken?: string | null;
  slackBotTokenEncrypted?: string | null;
}

/**
 * Resolve the workspace's Slack bot token. Reads the encrypted column first,
 * falls back to the legacy plaintext one. Returns `null` if neither is set.
 *
 * IMPORTANT: never log or surface the returned token — pass it straight to the
 * Authorization header.
 */
export function getSlackBotToken(workspace: WorkspaceSlackFields | null | undefined): string | null {
  if (!workspace) return null;
  const decrypted = decryptNullable(workspace.slackBotTokenEncrypted ?? null);
  if (decrypted && decrypted.trim()) return decrypted.trim();
  const legacy = workspace.slackBotToken?.trim();
  return legacy && legacy.length > 0 ? legacy : null;
}

async function call<T = Record<string, unknown>>(
  token: string,
  method: string,
  body: object,
): Promise<SlackResponse<T>> {
  const res = await fetch(`${SLACK_API}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  // Slack always returns JSON, even for HTTP-level errors. Surface the parse
  // failure as a Slack-style error so callers have a uniform shape to handle.
  let parsed: Record<string, unknown>;
  try {
    parsed = (await res.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, error: `non-json-response (${res.status})`, data: {} as T };
  }
  const ok = parsed.ok === true;
  const error = typeof parsed.error === "string" ? parsed.error : undefined;
  const warning = typeof parsed.warning === "string" ? parsed.warning : undefined;
  return {
    ok,
    error,
    warning,
    response_metadata: parsed.response_metadata as SlackResponse["response_metadata"],
    data: parsed as T,
  };
}

// ─── Auth ───────────────────────────────────────────────────────────────────

export interface SlackAuthTest {
  ok: boolean;
  url?: string;
  team?: string;
  team_id?: string;
  user?: string;
  user_id?: string;
  bot_id?: string;
  enterprise_id?: string;
}

export function authTest(token: string): Promise<SlackResponse<SlackAuthTest>> {
  return call<SlackAuthTest>(token, "auth.test", {});
}

// ─── chat.* ─────────────────────────────────────────────────────────────────

export interface PostMessageInput {
  channel: string;
  text?: string;
  blocks?: unknown[];
  thread_ts?: string;
  unfurl_links?: boolean;
  unfurl_media?: boolean;
  /** Override the bot avatar per message — works without re-uploading the
   *  app icon at api.slack.com/apps. Lets every Foundry post show the brand
   *  even before the workspace admin updates the app's display image. */
  icon_url?: string;
  username?: string;
}

export interface PostMessageResponse {
  channel?: string;
  ts?: string;
  message?: Record<string, unknown>;
}

/** Square Foundry avatar served from the public site — Slack fetches it per-message
 *  when icon_url is set on chat.postMessage, and renders it in a SQUARE frame.
 *  It's the "F." mark (serif F + indigo dot on white), 512×512, so it reads at
 *  avatar size. NOTE: Slack caches the avatar by URL — changing the *content* of
 *  an already-fetched URL won't refresh it, so this points at a fresh filename
 *  (`foundry-mark.png`) to force Slack to refetch. Bump the filename again if the
 *  mark ever changes. Falls back to the app's display image if unreachable. */
const DEFAULT_ICON_URL = "https://foundry.gitwork.co.uk/foundry-mark.png";

export function postMessage(token: string, input: PostMessageInput): Promise<SlackResponse<PostMessageResponse>> {
  return call<PostMessageResponse>(token, "chat.postMessage", {
    unfurl_links: false,
    unfurl_media: false,
    icon_url: DEFAULT_ICON_URL,
    username: "Foundry",
    ...input,
  });
}

export interface UpdateMessageInput {
  channel: string;
  ts: string;
  text?: string;
  blocks?: unknown[];
}

export function updateMessage(token: string, input: UpdateMessageInput): Promise<SlackResponse<PostMessageResponse>> {
  return call<PostMessageResponse>(token, "chat.update", input);
}

export interface DeleteMessageInput {
  channel: string;
  ts: string;
}

/** chat.delete — remove a message the bot posted (used to retract a sent update). */
export function deleteMessage(token: string, input: DeleteMessageInput): Promise<SlackResponse> {
  return call(token, "chat.delete", { channel: input.channel, ts: input.ts });
}

// ─── views.* (modals) ───────────────────────────────────────────────────────

export interface OpenViewInput {
  trigger_id: string;
  view: Record<string, unknown>;
}

export function openView(token: string, input: OpenViewInput): Promise<SlackResponse> {
  return call(token, "views.open", input);
}

export interface UpdateViewInput {
  view_id?: string;
  external_id?: string;
  view: Record<string, unknown>;
  hash?: string;
}

export function updateView(token: string, input: UpdateViewInput): Promise<SlackResponse> {
  return call(token, "views.update", input);
}

// ─── conversations.* ────────────────────────────────────────────────────────

export interface ListConversationsInput {
  types?: string; // e.g. "public_channel,private_channel"
  exclude_archived?: boolean;
  limit?: number;
  cursor?: string;
}

export interface SlackChannel {
  id: string;
  name: string;
  is_private?: boolean;
  is_archived?: boolean;
  is_shared?: boolean;
  is_ext_shared?: boolean;
}

export function listConversations(
  token: string,
  input: ListConversationsInput = {},
): Promise<SlackResponse<{ channels?: SlackChannel[] }>> {
  return call<{ channels?: SlackChannel[] }>(token, "conversations.list", {
    types: "public_channel,private_channel",
    exclude_archived: true,
    limit: 200,
    ...input,
  });
}

export interface CreateConversationInput {
  name: string;
  is_private?: boolean;
  /** Slack Connect — set when creating a shared channel with an external workspace. */
  team_id?: string;
}

export function createConversation(
  token: string,
  input: CreateConversationInput,
): Promise<SlackResponse<{ channel?: SlackChannel }>> {
  return call<{ channel?: SlackChannel }>(token, "conversations.create", input);
}

export interface SetTopicInput {
  channel: string;
  topic: string;
}

export function setConversationTopic(token: string, input: SetTopicInput): Promise<SlackResponse> {
  return call(token, "conversations.setTopic", input);
}

// ─── conversations.connect.* (Slack Connect / shared channels) ──────────────
//
// These two endpoints require admin-tier scopes (`conversations.connect:write`
// and `conversations.connect:manage`) granted at app install. The Foundry Slack
// app's manifest lists them — surface `missing_scope` errors verbatim when they
// come back so the operator knows the install needs re-approval.

export interface ConnectInviteInput {
  channel_id: string;
  emails?: string[];
  user_ids?: string[];
  external_limited?: boolean;
}

export function connectInvite(token: string, input: ConnectInviteInput): Promise<SlackResponse> {
  return call(token, "conversations.inviteShared", input);
}
