# Care — the operator runbook

Care is Gitwork's support desk: one UI at **`/app/care`**, one client at a time. It pulls a
client's mail and messages in from their own channels, tells you who is waiting on a reply, and
lets you answer without leaving Foundry.

This is the page to read before changing how it behaves. For the history of how it got here, see
CLAUDE.md §42.

---

## 1. The one question Care answers

**Is a customer waiting on us?** Everything else on the screen is in service of that.

A conversation is in one of three **reply states**, and they are **derived on every read, never
stored**:

| State | Means |
|---|---|
| **Needs reply** | The customer wrote last. |
| **Replied** | We wrote last. |
| **Sent by us** | Nobody has written in. A thread we started, or one rebuilt from a Sent folder. |

⚠️ **Derived, not stored, on purpose.** A `repliedAt` column can only be right if every reply goes
through Care, and they demonstrably do not — people answer from Gmail, from Apple Mail, from their
phone. A flag nobody updated reads exactly like a conversation nobody answered. Deriving it means
a reply sent from *anywhere* flips the state the moment a sync sees it, so the board self-heals
instead of drifting (§42.2).

⚠️ **"Replied" needs our message to be strictly newer than theirs.** An exact tie reads as *needs
reply*. The two errors are not symmetric: a false "replied" hides a customer who is actually
waiting, which is the thing this exists to prevent. **Never relax that to `>=`.**

---

## 2. Connecting a client

**Care → a client → Channels & settings → Channels → Add connector.**

Gmail, IMAP/SMTP, Discord, Reddit, App Store/Play reviews, an Analytics API, or a webhook.

### "Only read mail from"

A **floor**, not a window. Every adapter already has a rolling `lookbackDays`; the window start is
the **later** of the two.

That distinction matters: a plain rolling window silently skips anything older than N days any
time the sync has not run for N days. The floor means setting a start date gives a clean desk
*and* a sync that has been down for a fortnight still catches everything since it last ran.

⚠️ **It must survive "Re-sync history".** That button nulls `lastSyncedAt` deliberately, which
drops the window start to `now − lookbackDays`. Without the floor, one press of the button an
operator reaches for when a board looks wrong pulls the whole backlog straight back in.

**New connectors default it to today**, so connecting a client starts their desk empty rather than
30 days deep. Existing connectors are untouched; blank means "read whatever the mailbox holds".

### Connector health

A connector goes **red after two consecutive failed runs**. One failed run is a blip — a provider
hiccup, a DNS wobble, a deploy restarting the box mid-sync — and saying "this is broken" on one of
those trains people to ignore the badge.

⚠️ **A red connector is still synced and still sendable.** The cron keeps retrying it on a slower
cadence (30 minutes, doubling, capped at 6 hours), "Sync now" always tries whatever the health,
and a reply is attempted and fails with the *provider's own reason*. Excluding a red connector
would strand it: it could never be synced, never be replied through, and therefore never prove
itself healthy again. Only **Needs setup** — a connector nobody finished configuring — genuinely
cannot send.

---

## 3. Ingest only

Some clients' mail we harvest without answering: Big Wedge's course-request pipeline creates a
conversation per email on its way into their wiki, and none of those is a customer waiting on a
reply.

Switch it on at **a client → Channels & settings → Mode**. The client then:

- leaves Care home, the totals, the HQ tile and the digest;
- keeps every connector running, so their mail still lands and the pipeline still works;
- shows a quiet "Ingest only" line at the foot of Care home, which opens its settings.

`courseRequestOnly` implies it, so a client already on the course-request pipeline needs no change.

---

## 4. Clearing a backlog

**A client → Clear the backlog** (needs *Connect channels and edit workflow rules*).

Closes everything a customer has not touched since a date you pick. Use it when a desk has
accumulated a backlog nobody was ever going to work — a mailbox connected 30 days deep, a client
inherited mid-flight.

**Nothing is deleted.** The conversations keep their thread, messages, notes and audit trail, they
leave every open queue, and they come back if a customer writes again. One run is marked
`reset:<auditLogId>`, so that run and only that run can be undone from the toast.

⚠️ Three rules worth knowing before you use it:

- It selects on **last message**, never on when the conversation was created. An old thread
  someone replied to yesterday is not old.
- A conversation whose last-message time is **unknown** is never closed. That is *"we do not know
  how old this is"*, not *"it is old"*.
- **Snoozed rows are untouched.** A snooze is a decision with a wake date; closing it strands it.
- It deliberately does **not** stamp first-response times. These rows were never triaged, and
  stamping them would tell every past report we first answered an August thread in November.

---

## 5. What Care tells you, and when

| | Fires | Goes to |
|---|---|---|
| **A customer has waited too long** | Once per client, when its oldest unanswered message passes 24 hours. Clears when the desk catches up. | Whoever holds *Connect channels and edit workflow rules*, in-app and on their phone |
| **A channel has stopped delivering** | Once per outage, on the connector going red. Again when it recovers. | Admins, in-app, phone, and the Slack channel routed to `care.connector_failing` |
| **The morning digest** | 10:00 daily, per workspace | The Slack channel routed to `care.digest` |

**A clear morning is silent.** The digest says nothing when nobody is waiting and nothing is
broken. It reports **who is waiting**, the longest wait, anything past 24 hours, and any client
whose channel has stopped delivering — not "open conversations", which counts threads answered
yesterday and tells you nothing.

⚠️ **Each alert fires once per outage, not once per check.** A desk that pages someone every
minute it is behind gets muted, and a muted alert is worse than none because it looks like cover.

⚠️ An alert routed to Slack with no channel configured is a **silent no-op**, not an error. Set
the routes in the workspace's `channelRoutes`.

---

## 6. Permissions

| Permission | Covers |
|---|---|
| **`support`** — *Open Care and answer conversations* | Open, read, reply, **and triage**: close, snooze, assign, set status, add notes, mark read |
| **`support.manage`** — *Connect channels and edit workflow rules* | Connectors, workflow rules, AI agents, add and edit a client, clearing a backlog |

⚠️ Triage is on `support`, not `support.manage`. Before November 2026 it was the other way round,
so a developer could send a reply and then not close, assign or snooze the thread they had just
answered — and could not even mark it read, so their rows stayed bold for ever.

---

## 7. Things that are deliberately still there

**Dormant tables.** `SupportTicket`, `DraftSupportAction`, `CustomerIdentity`, `ChannelToken` and
`SupportClientMembership` are unreferenced by the UI. They stay because **dropping a table or an
enum value is a potentially data-losing change, and the guarded `prisma db push` then skips the
WHOLE sync** — one deletion here would silently stop every later migration reaching production
(CLAUDE.md §2). The Tickets tab was retired in November 2026; the write routes under
`/api/support/clients/[clientId]/tickets` stay live because an integration can still POST to them.

**Routes with no in-app caller**, kept as an API surface because a removed route is invisible to
every gate we run (§11): `conversations/[convId]/assign`, `connections/[connId]/purge` (destructive
— the reversible control an operator wants is *Clear the backlog*), and `draft-actions`.

---

## 8. If something looks wrong

| It looks like | Check |
|---|---|
| A quiet week | Whether a channel has gone red. An empty queue on a dead connector looks exactly like calm. |
| Every row says the same sender | A forwarder. The identity repair runs on every sync path; press **Sync now** once. |
| A thread reads "Sent by us" but has a customer message | Its activity stamps were never backfilled. **Sync now** runs the backfill. |
| A conversation is not classified | The AI could not run. The reason is in plain words on **Automation → Agent activity** — Care never invents a classification when the call failed. |
| Mail stopped arriving | `support-sync` runs at 08:00 and 13:00 UTC; "Auto-fetch" on the Channels screen only polls while that page is open. |
