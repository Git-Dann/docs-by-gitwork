/**
 * Which small icon a lifecycle milestone or history entry shows on the Portal client page
 * (client-lifecycle.tsx). Icons are neutral outline glyphs that say what kind of thing happened;
 * colour stays with the status dot. Decided from the event's id prefix (set in
 * src/lib/client-history.ts) and, for lifecycle steps, the server's label (src/server/clients.ts,
 * buildClientLifecycle), so a new kind of event falls back to a plain clock rather than a wrong
 * icon.
 */

export type HistoryIconKey =
  | "record"
  | "proposal"
  | "signed"
  | "signature"
  | "onboarding"
  | "active"
  | "plan"
  | "joined"
  | "left"
  | "scan"
  | "study"
  | "platform"
  | "design"
  | "link"
  | "call"
  | "email"
  | "meeting"
  | "note"
  | "message"
  | "other";

const LIFECYCLE_LABEL: Array<[RegExp, HistoryIconKey]> = [
  [/^client record$/i, "record"],
  [/^proposal drafted$/i, "proposal"],
  [/^commercial sign-off$/i, "signed"],
  [/^waiting signature$/i, "signature"],
  [/^onboarding/i, "onboarding"],
  [/^client active$/i, "active"],
  [/^delivery plan/i, "plan"],
];

const TOUCHPOINT: Array<[RegExp, HistoryIconKey]> = [
  [/^call\b/i, "call"],
  [/^email\b/i, "email"],
  [/^meeting\b/i, "meeting"],
  [/^note\b/i, "note"],
  [/^message\b/i, "message"],
];

export function historyIconKey(e: { id: string; label: string }): HistoryIconKey {
  const id = e.id;
  if (id.startsWith("placement:")) return id.endsWith(":end") ? "left" : "joined";
  if (id.startsWith("pulse:")) return "scan";
  if (id.startsWith("study:")) return "study";
  if (id.startsWith("Platform added:")) return "platform";
  if (id.startsWith("Design added:")) return "design";
  if (id.startsWith("Link added:")) return "link";
  if (id.startsWith("touchpoint:")) return TOUCHPOINT.find(([re]) => re.test(e.label))?.[1] ?? "other";
  // A lifecycle step: the timeline passes the server's raw step, the history its "lifecycle:" id.
  return LIFECYCLE_LABEL.find(([re]) => re.test(e.label))?.[1] ?? "other";
}
