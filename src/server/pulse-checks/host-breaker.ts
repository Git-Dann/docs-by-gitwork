/**
 * Stops a scan waiting on a host that has stopped answering.
 *
 * A URL scan makes ~25 sequential requests to the host it was given (robots.txt,
 * security.txt, legal pages, exposure probes…), each allowed 10 seconds. Some hosts answer
 * the homepage and hang on every other path: danclindsay.co.uk redirects / instantly and
 * holds /robots.txt open until the client gives up, which made its free scan take nearly
 * five minutes with nothing on screen.
 *
 * So: after TRIP_AFTER timeouts on a host, further requests to it fail at once for
 * OPEN_FOR_MS, and the checks that needed them report "did not complete", which they
 * already treat as not established rather than as a failure. Keyed by host, so one slow
 * site never affects another.
 *
 * ⚠️ An answer does NOT reset the count. The hosts this exists for answer SOME paths fast
 * (the homepage redirect) and hang on the rest; resetting on every quick answer kept the
 * breaker from ever tripping, because those answers interleave with the timeouts.
 */

export const TRIP_AFTER = 2;
// Longer than a scan takes, short enough that a site fixed or briefly slow is rescanned
// properly a couple of minutes later.
export const OPEN_FOR_MS = 2 * 60 * 1000;

type State = { timeouts: number; openUntil: number };
const hosts = new Map<string, State>();

export class HostNotRespondingError extends Error {
  constructor(host: string) {
    super(`${host} stopped responding; skipped`);
    this.name = "HostNotRespondingError";
  }
}

function hostOf(url: string): string | null {
  try { return new URL(url).host.toLowerCase(); } catch { return null; }
}

/** Throws when this host has tripped the breaker and should not be asked again yet. */
export function assertHostResponding(url: string, now = Date.now()): void {
  const host = hostOf(url);
  if (!host) return;
  const s = hosts.get(host);
  if (s && s.openUntil > now) throw new HostNotRespondingError(host);
}

export function recordTimeout(url: string, now = Date.now()): void {
  const host = hostOf(url);
  if (!host) return;
  const s = hosts.get(host) ?? { timeouts: 0, openUntil: 0 };
  s.timeouts += 1;
  if (s.timeouts >= TRIP_AFTER) s.openUntil = now + OPEN_FOR_MS;
  hosts.set(host, s);
  // Bounded: this only ever holds hosts that timed out recently.
  if (hosts.size > 500) {
    for (const [k, v] of hosts) if (v.openUntil <= now) hosts.delete(k);
  }
}

/** Tests only. */
export function resetHostBreaker(): void {
  hosts.clear();
}
