"use client";

/**
 * "What the team is saying" — the client's Slack channel, on the wiki overview,
 * so the wiki is the one place to look for everything about a client.
 *
 * ⚠️ TEAM AUDIENCE ONLY. The route behind this prefers the client's INTERNAL
 * Slack channel, which carries Gitwork's own chatter — standup pushes, things
 * that are broken, scheduling. `WikiDashboard` renders this only for
 * `audience === "team"`, and the hook is `enabled`-gated so the client's share
 * link never even issues the request. Do not render it unconditionally.
 */

import { ArrowPathIcon, ChatBubbleLeftRightIcon } from "@heroicons/react/24/outline";
import { useClientSlackActivity, usePublicWikiSlack } from "@/hooks/use-proposals";
import {
  describeSlackState,
  formatUpdateAge,
  groupUpdatesByDev,
  isUnresolvedAuthor,
  type SlackActivityPayload,
} from "@/lib/wiki-slack-updates";
import { cn } from "@/lib/format";

const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";

/** How many devs to list before deferring to Slack itself. */
const MAX_DEVS = 6;

/**
 * `source` decides which channel is read, and it is the safety boundary:
 *
 *   team   — the client's INTERNAL channel, via the authed route.
 *   client — the Slack Connect channel the client is already a member of, via a
 *            token route that cannot be asked for any other channel.
 *
 * Exactly one hook runs: the other is `enabled: false`, so the client's share
 * link never issues a request for the internal channel even to be refused.
 */
export function WikiSlackCard({
  source,
  slug,
  token,
  numeral,
}: {
  source: "team" | "client";
  slug?: string;
  token?: string;
  numeral: string;
}) {
  const internal = useClientSlackActivity(slug ?? "", source === "team" && Boolean(slug));
  const shared = usePublicWikiSlack(token ?? "", source === "client" && Boolean(token));
  const activity = source === "team" ? internal : shared;
  const data = activity.data as SlackActivityPayload | undefined;
  const state = describeSlackState(data, activity.isPending);

  // ⚠️ Render nothing rather than an explanation the client cannot act on. A
  // card reading "the Foundry bot has not been invited" on a client's own wiki
  // advertises our configuration as though it were their problem.
  if (source === "client" && state.kind === "needs-setup") return null;

  const updates = groupUpdatesByDev(data?.messages, new Date());
  const shown = updates.slice(0, MAX_DEVS);
  const hidden = updates.length - shown.length;

  const digest = (data?.summary ?? "")
    .split("\n")
    .map((l) => l.trim().replace(/^[•\-*]\s*/, "").replace(/\*\*([^*]+)\*\*/g, "$1"))
    .filter(Boolean);

  return (
    <section className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label" style={{ fontFamily: MONO }}>
          <span className="widget-header__label--number">{numeral}</span>
          {source === "team" ? " // TEAM UPDATES" : " // PROJECT CHANNEL"}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {data?.channelName && (
            <span
              className="widget-header__status inline-flex items-center gap-1"
              style={{ fontFamily: MONO }}
            >
              <ChatBubbleLeftRightIcon className="h-3 w-3" />
              {data.channelName}
            </span>
          )}
          <button
            type="button"
            onClick={() => void activity.refetch()}
            disabled={activity.isFetching}
            aria-label="Refresh Slack updates"
            className="app-button app-button-utility app-button-icon-sm"
          >
            <ArrowPathIcon className={cn("h-3.5 w-3.5", activity.isFetching && "animate-spin")} />
          </button>
        </span>
      </div>

      <div className="p-5">
        {/* ⚠️ Which channel this is, stated on the card and not only in the
            code. The team card reads the internal channel, so anyone
            screenshotting the overview for a client needs to see that. */}
        <p
          className="mb-3 text-[10px] tracking-[0.1em] text-[var(--text-4)] uppercase"
          style={{ fontFamily: MONO }}
        >
          {source === "team"
            ? "Internal channel · the client sees their shared channel instead"
            : "From our shared Slack channel"}
        </p>

        {state.kind === "loading" && (
          <p className="text-[13px] text-[var(--text-4)]">Loading Slack updates…</p>
        )}

        {state.kind === "empty" && (
          <p className="text-[13px] text-[var(--text-3)]">{state.message}</p>
        )}

        {/* ⚠️ A setup problem is OURS. The team card names it so it can be fixed;
            the client card says nothing, because "no Slack bot token is
            configured for the workspace" is an internal detail and an instruction
            they cannot act on. The card renders nothing at all for them — see
            `WikiDashboard`, which drops it entirely when it is not configured. */}
        {state.kind === "needs-setup" && source === "team" && (
          <p className="text-[13px] text-[var(--text-3)]">{state.message}</p>
        )}

        {state.kind === "ready" && (
          <>
            {digest.length > 0 && (
              <ul className="mb-4 space-y-1.5 border-b border-[var(--border-1)] pb-4">
                {digest.map((line, i) => (
                  <li key={i} className="flex gap-2 text-[13px] leading-5 text-[var(--text-2)]">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[var(--brand-600)]" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            )}

            <ul className="space-y-3">
              {shown.map((u) => (
                <li key={u.author} className="min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span
                      className={cn(
                        "truncate text-[11px] tracking-[0.08em] uppercase",
                        isUnresolvedAuthor(u.author)
                          ? "text-[var(--text-4)]"
                          : "text-[var(--text-2)]",
                      )}
                      style={{ fontFamily: MONO }}
                      title={u.author}
                    >
                      {isUnresolvedAuthor(u.author) ? `${u.author} (unattributed)` : u.author}
                    </span>
                    <span
                      className="shrink-0 text-[10px] text-[var(--text-4)]"
                      style={{ fontFamily: MONO }}
                    >
                      {formatUpdateAge(u.hoursAgo)}
                      {u.count > 1 ? ` · ${u.count}` : ""}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-[var(--text-2)]">
                    {u.latest.text}
                  </p>
                </li>
              ))}
            </ul>

            {hidden > 0 && (
              <p className="mt-3 text-[11px] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
                +{hidden} more {hidden === 1 ? "person" : "people"} in Slack
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
