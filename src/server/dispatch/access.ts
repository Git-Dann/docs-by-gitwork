/**
 * Dispatch — who may ask, about what, and where the answer may be posted.
 *
 * Dispatch answers AS THE PERSON ASKING. It used to answer as the whole workspace: it matched the
 * Slack user to a Foundry account only for the audit row, so anyone in Gitwork's Slack could ask
 * about any client. These rules close that, and they are pure so every branch is tested.
 *
 *   1. Only a Foundry member with Portal (`clients`) may ask. Dispatch's evidence is the client
 *      board, meetings and documents — Portal data — so someone who can't open Portal can't get
 *      it from Slack either.
 *   2. A restricted member (no "Every client") may only ask about clients they can open, and not
 *      about a person or "everything": those answers range across every client.
 *   3. An answer about a client is posted in the thread only in a DM or in that client's own
 *      internal channel. Anywhere else the people reading the channel may not share the asker's
 *      access, so the answer goes to the asker by DM.
 *
 * Slack Connect channels are refused before any of this (see respond.ts): the client is in them.
 */

import { isSuperAdmin } from "@/types/auth";
import { allowedDocTypes } from "@/lib/templates";
import type { DocumentType } from "@/types/proposal";
import type { DispatchSubject } from "./types";

/** Minimal shape of the asker these rules need — kept separate from EffectiveUser so the module
 *  stays pure and testable without the auth stack. */
export interface DispatchAsker {
  role: string;
  permissions: readonly string[];
}

export interface AskerScope {
  /** Super Admin, or holds "Every client". */
  seeAll: boolean;
  /** Clients the asker can open. Ignored when `seeAll`. */
  clientIds: ReadonlySet<string>;
}

/** Rule 1: Portal is the data Dispatch reads, so Portal is the permission to ask. */
export function mayAskDispatch(asker: DispatchAsker): boolean {
  return isSuperAdmin(asker.role) || asker.permissions.includes("clients");
}

export function seesAllClients(asker: DispatchAsker): boolean {
  return isSuperAdmin(asker.role) || asker.permissions.includes("seeAllClients");
}

/** The document types the asker may be told about: the same rule as `allowedDocTypesForUser`
 *  (developers aren't shown proposals or contracts), kept here so this module stays pure. */
export function documentTypesFor(asker: DispatchAsker): DocumentType[] {
  return allowedDocTypes(isSuperAdmin(asker.role) || asker.permissions.includes("docs.viewAdminTypes"));
}

/** Rule 2. A subject outside the asker's access is refused, never answered partially. */
export function subjectAllowed(subject: DispatchSubject, scope: AskerScope): boolean {
  if (scope.seeAll) return true;
  if (subject.kind === "client") return scope.clientIds.has(subject.id);
  // A person's work and a workspace roll-up both span every client.
  return false;
}

export type Delivery = "thread" | "dm";

export interface DeliveryInput {
  /** Slack's channel_type: "im" for a DM with the bot. */
  channelType: string | undefined;
  channelId: string;
  subject: DispatchSubject | null;
  /** The subject client's internal channel ids (`slackInternalChannelId`, legacy `slackChannelId`). */
  subjectInternalChannelIds: readonly (string | null | undefined)[];
}

/** Rule 3: where an ANSWER may be posted. Notices that carry no client data can always go in
 *  the thread; this is only consulted for an answer. */
export function deliveryFor(input: DeliveryInput): Delivery {
  if (input.channelType === "im") return "thread";
  if (input.subject?.kind !== "client") return "dm";
  const own = input.subjectInternalChannelIds.filter((id): id is string => typeof id === "string" && id.length > 0);
  return own.includes(input.channelId) ? "thread" : "dm";
}
