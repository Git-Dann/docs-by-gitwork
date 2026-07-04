// The Desk — internal "what's on your desk today" drawer.
//
// The Desk is a pure *aggregator*: it reads data other modules already own (tasks,
// standups, meetings, calendar, mail) and presents it per-current-user. The only
// Desk-specific shape is the action-item readout below; everything else reuses the
// existing task / calendar / gmail DTOs.

/** One open Scribe action item relevant to the current user (attended the meeting,
 *  or it's linked to a task assigned to them). */
export type DeskActionItemDTO = {
  id: string;
  /** Short imperative title (AI) when present, else the fuller text. */
  title: string;
  text: string;
  meetingId: string;
  meetingTitle: string;
  meetingStartedAt: string | null;
  /** Client the meeting was attributed to — powers the deep-link. Null if unattributed. */
  clientSlug: string | null;
  clientName: string | null;
  /** True once this item has been turned into a board task. */
  hasTask: boolean;
};

/** One recent Slack message from a client channel the user has access to. */
export type DeskSlackMessage = {
  id: string;
  author: string;
  text: string;
  ts: string; // ISO
  clientName: string;
  clientSlug: string;
};

export type DeskSlackReason = "ok" | "no_token" | "no_channels" | "empty";

export type DeskSlackResult = {
  /** False only when the workspace has no Slack bot token at all. */
  configured: boolean;
  reason: DeskSlackReason;
  messages: DeskSlackMessage[];
};

/** The next upcoming public/bank holiday for a country (null if none found). */
export type NextHoliday = { name: string; date: string; inDays: number } | null;

/** Next UK + Pakistan holidays for the "Around the team" strip. */
export type DeskHolidays = { gb: NextHoliday; pk: NextHoliday };

export const DESK_TABS = ["TODAY", "TASKS", "MEETINGS", "INBOX", "ALERTS"] as const;
export type DeskTab = (typeof DESK_TABS)[number];

export const DESK_TAB_LABELS: Record<DeskTab, string> = {
  TODAY: "Today",
  TASKS: "Tasks",
  MEETINGS: "Meetings",
  INBOX: "Inbox",
  ALERTS: "Alerts",
};
