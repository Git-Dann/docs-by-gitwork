// The Monday Brief — a daily editorial digest that "peeks" from On Your Desk and
// expands to a full-page read. It is a pure *aggregator view*, like the Desk: it
// maps data other modules already own (tasks, standups, calendar, Slack, Scribe)
// into one narrative shape. The shape mirrors Dia's morning-brief JSON so the
// layout reads the same — but every value comes from live Foundry data.
//
// Nothing here is persisted. The brief is rebuilt on the client each time it opens
// (see `buildBrief` in src/lib/brief/build-brief.ts). The only per-user state that
// survives is the checkbox ticks (localStorage, keyed by date) and the "dismissed
// for today" flag on the peek.

export type BriefLabelStyle = "active" | "outline";

/** The single most important thing to push forward today (the yellow-star card in Dia). */
export interface BriefPushForward {
  /** The thing itself — a task title, usually. */
  title: string;
  /** Narrative "why this, why now". */
  body: string;
  /** Deep-link the CTA opens (e.g. the client's task board). */
  href?: string;
  /** CTA label inside the scalloped stamp, e.g. "Open board". */
  ctaLabel: string;
}

/** A checkable to-do (localStorage tick only — the board stays the source of truth). */
export interface BriefTodo {
  id: string;
  title: string;
  body: string;
  label?: string;
  labelStyle?: BriefLabelStyle;
  /** Opens the underlying item (task board, client page). */
  href?: string;
}

export type BriefUpdateSource = "slack" | "scribe" | "calendar";

/** A numbered "new update" — something that happened (Slack chatter, meeting notes). */
export interface BriefUpdate {
  id: string;
  title: string;
  body: string;
  label?: string;
  labelStyle?: BriefLabelStyle;
  href?: string;
  source: BriefUpdateSource;
}

/** One calendar event on today's timeline. */
export interface BriefEvent {
  id: string;
  /** "10:00 AM" */
  time: string;
  /** "5:00 PM" */
  endTime?: string;
  title: string;
  /** Location / attendee summary shown in the detail panel. */
  note?: string;
  attendees: string[];
  joinUrl?: string;
  section: "morning" | "afternoon";
  /** True for the next-upcoming (or in-progress) event — drives the default selection. */
  isNext?: boolean;
  /** True while the event is currently happening. */
  isNow?: boolean;
}

export interface BriefPainting {
  /** Remote (or local) image URL. Falls back to a gradient if it fails to load. */
  src: string;
  /** "Lake Lucerne, Albert Bierstadt, 1858" */
  caption: string;
}

/** The full assembled brief. */
export interface Brief {
  /** ISO date the brief is for. */
  dateISO: string;
  /** "Monday" — names the hero ("The Monday Brief"). */
  weekday: string;
  /** Editorial one-liner under the painting. */
  greeting: string;
  pushForward: BriefPushForward | null;
  todos: BriefTodo[];
  updates: BriefUpdate[];
  events: BriefEvent[];
  /** Which connected sources fed this brief — rendered in the footer credit. */
  sources: string[];
  painting: BriefPainting;
}
