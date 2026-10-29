/**
 * Which workspace a request belongs to — Phase 2 of docs/multi-tenant-roadmap.md, in
 * SHADOW MODE.
 *
 * Today every signed-in request is scoped by one lookup: the caller's membership of
 * Gitwork's workspace (DEFAULT_WORKSPACE_SLUG, in requireAuthedUser). Phase 2 replaces
 * that with the workspace the caller's token was issued for. Before anything is allowed
 * to depend on the new answer, both are computed on every request and compared, and only
 * the OLD one is used. The new one becomes real after a week of zero mismatches on
 * production (roadmap, "Rule one", step 3).
 *
 * Two rules this file must keep:
 *   - It never throws and never changes what a request gets. A bug here must cost a log
 *     line, never a request.
 *   - "The token carries no workspace" is counted separately from "the token disagrees".
 *     A token minted before the claim existed (a 30-day mobile token, a session not yet
 *     refreshed) is expected and harmless; a disagreement is the thing to investigate.
 */

export interface WorkspaceShadowStats {
  /** When this process started counting (stats reset on every deploy). */
  since: string;
  /** Requests compared. */
  checked: number;
  /** Requests whose token named a workspace. */
  withClaim: number;
  /** Requests whose token named none (issued before the claim existed). */
  withoutClaim: number;
  /** Requests whose token named a different workspace from the one they were served. */
  mismatches: number;
  /** The most recent disagreements, newest first (at most 20). Ids only. */
  recent: Array<{ at: string; userId: string; claimed: string; served: string; via: "session" | "mobile" }>;
}

const MAX_RECENT = 20;

function fresh(): WorkspaceShadowStats {
  return { since: new Date().toISOString(), checked: 0, withClaim: 0, withoutClaim: 0, mismatches: 0, recent: [] };
}

// One copy per server process, shared by every route module.
const g = globalThis as unknown as { __workspaceShadow?: WorkspaceShadowStats; __workspaceShadowLogged?: Set<string> };

function stats(): WorkspaceShadowStats {
  return (g.__workspaceShadow ??= fresh());
}

/** Pure: what the comparison says about one request. */
export function compareWorkspace(
  claimed: string | null | undefined,
  served: string,
): "no-claim" | "agrees" | "mismatch" {
  if (!claimed) return "no-claim";
  return claimed === served ? "agrees" : "mismatch";
}

/**
 * Records one request's comparison. `claimed` is the workspace in the caller's token,
 * `served` the one requireAuthedUser actually scoped the request to.
 */
export function recordWorkspaceShadow(input: {
  userId: string;
  claimed: string | null | undefined;
  served: string;
  via: "session" | "mobile";
}): void {
  try {
    const s = stats();
    s.checked += 1;
    const verdict = compareWorkspace(input.claimed, input.served);
    if (verdict === "no-claim") {
      s.withoutClaim += 1;
      return;
    }
    s.withClaim += 1;
    if (verdict === "agrees") return;
    s.mismatches += 1;
    s.recent.unshift({
      at: new Date().toISOString(),
      userId: input.userId,
      claimed: input.claimed!,
      served: input.served,
      via: input.via,
    });
    if (s.recent.length > MAX_RECENT) s.recent.length = MAX_RECENT;
    // Logged once per (user, claimed, served) per process, so one confused session
    // can't flood the log while it stays visible.
    const key = `${input.userId}|${input.claimed}|${input.served}`;
    const logged = (g.__workspaceShadowLogged ??= new Set());
    if (!logged.has(key)) {
      logged.add(key);
      console.warn(
        `[workspace-shadow] mismatch via ${input.via}: user ${input.userId} token says ${input.claimed}, served ${input.served}`,
      );
    }
  } catch {
    // Never let the shadow comparison affect a request.
  }
}

/** A copy of this process's counts, for the Platform console. */
export function workspaceShadowStats(): WorkspaceShadowStats {
  const s = stats();
  return { ...s, recent: s.recent.map((r) => ({ ...r })) };
}

/** Tests only. */
export function resetWorkspaceShadow(): void {
  g.__workspaceShadow = fresh();
  g.__workspaceShadowLogged = new Set();
}
