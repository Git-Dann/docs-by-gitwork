/**
 * Which server errors to post to the ops Slack channel (CLAUDE.md §144). Pure, so tested.
 *
 * One post per distinct error (same route + error type + first line) per hour, and at most
 * MAX_PER_HOUR posts an hour in all, so a broken page under load posts once, not a thousand
 * times. Only what's needed to find the error in the logs is posted: the route's template
 * (`/api/clients/[slug]`, never the real path), the method, the error's type and code, and its
 * first line with email addresses and long numbers taken out.
 */

export const REPEAT_AFTER_MS = 60 * 60_000;
export const MAX_PER_HOUR = 10;

export interface ErrorFacts {
  routePath: string;
  method: string;
  name: string;
  code?: string;
  message: string;
  digest?: string;
}

export function scrubMessage(message: string): string {
  const first = message.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  return first
    .replace(/[^\s@<>"'()]+@[^\s@<>"'()]+\.[a-z]{2,}/gi, "[email]")
    .replace(/\b\d{6,}\b/g, "[number]")
    .slice(0, 160);
}

export function errorSignature(f: Pick<ErrorFacts, "routePath" | "name" | "code" | "message">): string {
  return [f.routePath, f.name, f.code ?? "", scrubMessage(f.message)].join("|");
}

export interface AlertWindow {
  lastSent: Map<string, number>;
  sentTimes: number[];
}

/** Whether to post this error now. Records the post when it says yes. */
export function shouldPostError(state: AlertWindow, signature: string, now: number): boolean {
  state.sentTimes = state.sentTimes.filter((t) => now - t < REPEAT_AFTER_MS);
  const last = state.lastSent.get(signature);
  if (last !== undefined && now - last < REPEAT_AFTER_MS) return false;
  if (state.sentTimes.length >= MAX_PER_HOUR) return false;
  state.lastSent.set(signature, now);
  state.sentTimes.push(now);
  if (state.lastSent.size > 500) {
    for (const [k, t] of state.lastSent) if (now - t >= REPEAT_AFTER_MS) state.lastSent.delete(k);
  }
  return true;
}

export function errorAlertText(f: ErrorFacts): string {
  const code = f.code ? ` (${f.code})` : "";
  const digest = f.digest ? `\nDigest ${f.digest}: search the app's logs for it.` : "";
  return `🔴 *Server error on Foundry*\n\`${f.method} ${f.routePath}\`\n${f.name}${code}: ${scrubMessage(f.message)}${digest}`;
}
