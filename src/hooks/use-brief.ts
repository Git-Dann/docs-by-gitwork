"use client";

/**
 * The Monday Brief — composes the same light + Google/Slack-backed reads the Desk
 * already uses, and folds them into one `Brief` object via `buildBrief`.
 *
 * `useMyDay` / `useTaskAttention` are light DB reads (always on — shared cache with
 * the Desk dock, so the peek's summary is free). The Google/Slack queries are gated
 * on `enabled` so opening the full brief is what triggers the calendar/Slack/Scribe
 * fetches, not merely mounting the peek.
 */

import { useMemo } from "react";
import { useAccount } from "@/hooks/use-account";
import { useMyDay, useTaskAttention } from "@/hooks/use-tasks";
import { useDeskCalendar, useDeskActionItems, useDeskSlack } from "@/hooks/use-desk";
import { buildBrief } from "@/lib/brief/build-brief";
import type { Brief } from "@/types/brief";

export interface UseBriefResult {
  brief: Brief;
  /** True while the heavy (Google/Slack) reads for an opened brief are still loading. */
  isPending: boolean;
  /** False when the user hasn't connected Google (so the schedule can prompt). */
  calendarConnected: boolean | undefined;
}

export function useBrief(enabled: boolean): UseBriefResult {
  const account = useAccount();
  const myDay = useMyDay();
  const attention = useTaskAttention({ mine: true });
  const calendar = useDeskCalendar({ enabled });
  const slack = useDeskSlack({ enabled });
  const actionItems = useDeskActionItems({ enabled });

  // One stable "now" per mount — a brief is a snapshot, not a live clock.
  const now = useMemo(() => new Date(), []);
  const firstName = (account.data?.name ?? "").trim().split(" ")[0] || "there";

  const brief = useMemo(
    () =>
      buildBrief({
        now,
        firstName,
        myDay: myDay.data,
        attention: attention.data,
        calendar: calendar.data,
        slack: slack.data,
        actionItems: actionItems.data?.items,
      }),
    [now, firstName, myDay.data, attention.data, calendar.data, slack.data, actionItems.data],
  );

  const isPending = enabled && (calendar.isPending || slack.isPending || actionItems.isPending);

  return { brief, isPending, calendarConnected: calendar.data?.connected };
}
