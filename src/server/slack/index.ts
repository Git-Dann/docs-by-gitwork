/**
 * Public surface of the Slack server module. Re-exports so callers can do
 *   `import { getSlackBotToken, postMessage } from "@/server/slack";`
 * instead of reaching into the sub-files. The submodules stay separate so
 * each is small and testable.
 */

export {
  authTest,
  connectInvite,
  createConversation,
  getSlackBotToken,
  listConversations,
  openView,
  postMessage,
  setConversationTopic,
  updateMessage,
  updateView,
} from "./client";
export type {
  PostMessageInput,
  PostMessageResponse,
  SlackAuthTest,
  SlackChannel,
  SlackResponse,
} from "./client";

export { verifySlackSignature } from "./signature";
export type { SlackSignatureCheckInput, SlackSignatureResult } from "./signature";

export {
  SLACK_ACTIONS,
  decodeActionValue,
  encodeActionValue,
} from "./blocks";
export type { SlackActionId, SlackBlock, SlackView } from "./blocks";

export {
  handleInteraction,
  parseInteractionBody,
} from "./interactions";
export type { SlackInteractionPayload } from "./interactions";
