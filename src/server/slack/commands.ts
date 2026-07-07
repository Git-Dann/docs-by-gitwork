/**
 * Slack slash-command handler — `/desk <who> <what>` adds a reminder to a
 * teammate's On Your Desk list.
 *
 * Resolution order for "who":
 *   1. An escaped Slack mention `<@U123|label>` (Slack sends this when the command
 *      has "Escape channels, users & links" on) → users.info → email → Foundry user.
 *      Most robust; disambiguates people who share a first name (Syed, Ali).
 *   2. A typed name — longest leading match (3→1 tokens) against the roster's
 *      canonical names / aliases, then a unique-first-name fallback ("@harry",
 *      "dan"). Ambiguous first names (Syed, Ali) fall through to usage help.
 *
 * Read-only against Slack (users.info); the only write is a DeskReminder on the
 * target. Returns the ephemeral reply text for the caller.
 */

import { prisma } from "@/lib/prisma";
import { createReminderForUser } from "@/server/desk";
import { TEAM_ROSTER, normalizeRosterName, findRosterByName } from "@/lib/team-roster-aliases";
import type { RosterEntry } from "@/lib/team-roster-aliases";

const SLACK_API = "https://slack.com/api";
const USAGE = "Try: `/desk @harry chase the DPA` — start with a teammate, then what to do.";

// Unique first-name → roster entry (ambiguous first names map to null so we don't
// guess between e.g. the two Syeds — those need an @mention or a fuller name).
const FIRST_NAME_INDEX: Map<string, RosterEntry | null> = (() => {
  const m = new Map<string, RosterEntry | null>();
  for (const entry of TEAM_ROSTER) {
    const first = normalizeRosterName(entry.name).split(" ")[0];
    if (!first) continue;
    m.set(first, m.has(first) ? null : entry);
  }
  return m;
})();

export async function handleDeskCommand(args: {
  workspaceId: string;
  text: string | null;
  callerName: string;
  botToken: string | null;
}): Promise<string> {
  const trimmed = (args.text ?? "").trim();
  if (!trimmed) return USAGE;

  let targetEmail: string | null = null;
  let body = "";

  // 1. Escaped Slack mention at the start.
  const mention = trimmed.match(/^<@([A-Z0-9]+)(?:\|[^>]*)?>\s*([\s\S]*)$/);
  if (mention) {
    body = mention[2].trim();
    targetEmail = args.botToken ? await slackUserEmail(args.botToken, mention[1]) : null;
    if (!targetEmail) return "Couldn't match that person to a Foundry account.";
  } else {
    // 2. Typed name — longest leading match, then unique-first-name fallback.
    const tokens = trimmed.split(/\s+/);
    let entry: RosterEntry | null = null;
    let consumed = 0;
    for (const n of [3, 2, 1]) {
      if (tokens.length < n + 1) continue; // leave at least one token for the body
      const cand = findRosterByName(tokens.slice(0, n).join(" "));
      if (cand) {
        entry = cand;
        consumed = n;
        break;
      }
    }
    if (!entry && tokens.length >= 2) {
      const byFirst = FIRST_NAME_INDEX.get(normalizeRosterName(tokens[0]));
      if (byFirst) {
        entry = byFirst;
        consumed = 1;
      }
    }
    if (!entry) return `Couldn't find a teammate called "${tokens[0]}". ${USAGE}`;
    targetEmail = entry.email;
    body = tokens.slice(consumed).join(" ").trim();
  }

  if (!body) return `Add what to do, e.g. \`/desk @harry chase the DPA\`.`;

  const target = await prisma.user.findFirst({
    where: {
      email: { equals: targetEmail, mode: "insensitive" },
      memberships: { some: { workspaceId: args.workspaceId } },
    },
    select: { id: true, name: true },
  });
  if (!target) {
    const label = findRosterByName(targetEmail)?.name ?? targetEmail;
    return `${label} isn't set up in Foundry yet.`;
  }

  const note = `${body} — via Slack (@${args.callerName})`;
  await createReminderForUser({ workspaceId: args.workspaceId, userId: target.id, body: note });

  const first = (target.name ?? "their").trim().split(/\s+/)[0] || "their";
  return `✓ Added to ${first}'s list: “${body}”`;
}

/** Resolve a Slack user id → email via users.info (needs the users:read.email scope,
 *  already granted for the mentions feature). Null on any failure. */
async function slackUserEmail(botToken: string, slackUserId: string): Promise<string | null> {
  try {
    const res = await fetch(`${SLACK_API}/users.info?user=${encodeURIComponent(slackUserId)}`, {
      headers: { Authorization: `Bearer ${botToken}` },
    });
    const data = (await res.json()) as { ok: boolean; user?: { profile?: { email?: string } } };
    return data.ok ? (data.user?.profile?.email ?? null) : null;
  } catch {
    return null;
  }
}
