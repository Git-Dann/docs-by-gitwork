"use client";

import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import { SourceIcon, SOURCE_LABEL } from "./care-constants";
import type { Conversation, Connection } from "@/types/support";

/**
 * The cockpit has no reply composer — replies happen natively. This is the primary
 * action: deep-link out to the conversation's thread in its channel. Falls back to a
 * channel-level link derived from the connector config when no per-item URL exists
 * (older rows), and to a disabled hint when even that isn't possible.
 */
function channelLevelUrl(conv: Conversation, connection?: Connection): string | undefined {
  const cfg = connection?.scraperConfig;
  switch (conv.source) {
    case "gmail":
      return "https://mail.google.com/mail/u/0/#all";
    case "discord":
      return cfg?.guildId ? `https://discord.com/channels/${cfg.guildId}` : "https://discord.com/channels/@me";
    case "reddit":
      return cfg?.subreddit ? `https://www.reddit.com/r/${cfg.subreddit}` : undefined;
    case "app_reviews":
      return cfg?.store === "play_store"
        ? "https://play.google.com/console"
        : "https://appstoreconnect.apple.com";
    default:
      return undefined;
  }
}

export function OpenInChannelButton({
  conversation,
  connection,
}: {
  conversation: Conversation;
  connection?: Connection;
}) {
  const label = SOURCE_LABEL[conversation.source];
  const href = conversation.externalUrl ?? channelLevelUrl(conversation, connection);
  const exact = Boolean(conversation.externalUrl);

  if (!href) {
    return (
      <span
        className="inline-flex cursor-not-allowed items-center gap-2 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3.5 py-2 text-sm text-[var(--text-4)]"
        title={`No direct link for this ${label} item — open ${label} manually.`}
      >
        <SourceIcon source={conversation.source} />
        Open {label} manually
      </span>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={exact ? `Open this thread in ${label}` : `No direct link — opens ${label}`}
      className="inline-flex items-center gap-2 rounded-[6px] bg-[var(--brand-600)] px-3.5 py-2 text-sm font-medium text-white transition hover:bg-[var(--brand-700)]"
    >
      <SourceIcon source={conversation.source} className="text-white" />
      Open in {label}
      <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5 opacity-80" />
    </a>
  );
}
