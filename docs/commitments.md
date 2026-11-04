# Commitments

One person's list of promises, in Backstage → Commitments (`/app/backstage?area=commitments`) and
in Foundry for Mac. Typed in by hand, or **suggested** from:

| Source | What is read | Default |
|---|---|---|
| Sent Gmail | Email the person sent in the read window, only the part they wrote (quoted replies and signatures stripped) | Off (opt-in) |
| Slack | The person's own messages in client channels they can see | Off (opt-in) |
| Meeting notes | Open Scribe action items from meetings they attended, or linked to their tasks | On |
| Calendar | A follow-up after a meeting with someone outside Gitwork that ended in the last 3 days | On |

A suggestion never joins the list until the person accepts it, and Foundry never sends, replies or
books anything for them.

## Rules that keep it honest

- **The quote must be in the message.** Gmail/Slack suggestions come from one light-tier AI read.
  Each one must quote at least four words that are really in the message it cites
  (`quoteAppearsIn`, `src/lib/commitments.ts`). Otherwise it is dropped.
- **Nothing is stored from a message except the promise**: a title, a quote of at most 280
  characters, the subject or channel, a link and when. Bodies stay in memory for the read.
- **Private.** Only the owner can read or change their commitments. A Super Admin "viewing as"
  someone gets a 403.
- **A failed source doesn't move the window.** `lastSyncedAt` only advances when every enabled
  source was read, so the next read covers the gap (CLAUDE.md §35). Each source reports in words.
- **AI needs `ai.generate`.** Without it, Gmail/Slack report that the read was skipped and why.
  Meeting notes and Calendar need no AI.
- Dismissed suggestions are kept, so the next read recognises and doesn't re-suggest them.

## When it reads

- When the page opens and the last read is over 30 minutes old.
- **Check now** in the Suggested card.
- The every-minute `jobs` worker reads up to 4 people a tick who have Gmail or Slack switched on
  and haven't been read for 30 minutes (`syncDueCommitments`). Archived members are switched off.

## API (for Foundry for Mac and the web page)

All routes accept a NextAuth session or the mobile JWT (`Authorization: Bearer …`). They sit
under `/api/backstage`, so the workspace must have the Backstage module.

| Method + path | Body | Returns |
|---|---|---|
| `GET /api/backstage/commitments` | | `{ commitments: CommitmentDTO[], settings: CommitmentSettingsDTO }` |
| `POST /api/backstage/commitments` | `{ title, dueAt?, notes?, counterpart? }` | `{ commitment }` (201) |
| `PATCH /api/backstage/commitments/:id` | any of `title, notes, dueAt, counterpart, state, snoozedUntil` and the to-do fields below | `{ commitment, next }` |
| `DELETE /api/backstage/commitments/:id` | | `{ deleted: true }`; only for ones typed by hand |
| `POST /api/backstage/commitments/sync` | | `{ result: { status: "ok" \| "partial" \| "busy", added, sources } }` |
| `GET/PUT /api/backstage/commitments/settings` | `{ gmailEnabled?, slackEnabled?, meetingsEnabled?, calendarEnabled? }` | `{ settings }` |

Types: `src/types/commitments.ts`. Dates are ISO strings. `state` is
`suggested | open | done | dismissed`; accepting a suggestion is `PATCH { state: "open" }`, and
nothing can go back to `suggested`. `source` is `manual | gmail | slack | meeting | calendar`.
`GET` returns open and suggested ones, plus done/dismissed ones from the last 14 days.

⚠️ Keys are camelCase. The Mac app's encoder must not convert to snake_case (the iOS app hit this,
CLAUDE.md §54).

## Before Slack works

The Foundry Slack bot must be in the client channels and have `channels:history`,
`groups:history` and `users:read.email`. Someone whose Foundry email isn't on a Slack account
gets "Your Foundry email isn't on a Slack account".

## What gets suggested (November 2026)

The first version suggested 45 things in a day: every action item from every meeting you were in,
and a follow-up after every external meeting, stand-ups included. Now:

- **Meeting notes:** only items on a board task assigned to you, or whose owner in the notes is
  you (`actionItemIsMine`: your email, full name, or first name as a whole word).
- **Calendar:** no follow-up after a repeating event, and teammates and Staff developers on
  personal addresses count as our side (`teamEmails`).
- **At most 5 new a day** (`MAX_SUGGESTIONS_PER_DAY`). What doesn't fit is picked up by a later read.
- **Let go after 7 days** (`SUGGESTION_TTL_DAYS`), and meeting or calendar suggestions the source no
  longer offers are let go on the next successful read of that source. Let-go means `dismissed`, so
  the same item is never suggested again.

## Mail for Foundry for Mac, and remembering "Not mine" (November 2026)

- `GET /api/backstage/mail/inbox?q=` returns the signed-in person's own Gmail: unread, primary,
  this week by default (`DEFAULT_INBOX_QUERY` in `src/lib/mail-inbox.ts`). It accepts the mobile
  JWT, refuses "view as", reads headers and Gmail's snippet only, and stores nothing. Each message
  carries a `link` that opens the thread in the right Google account.
- Pressing **Not mine** on a calendar follow-up now stops follow-ups with that person
  (`declinedFollowUps`). Suggestions Foundry lets go of itself are marked `LET_GO_REASON` so they
  never count as a person's choice; dismissals from before the marker existed are ignored.

## To-do fields, lists, order and repeating (November 2026)

Added so Foundry for Mac can be a full task tracker. All additive; existing rows read as
"no list, no tags, no priority, not planned".

**Fields on a commitment** (`POST` and `PATCH` accept all of them; on `PATCH`, `null` clears and
absent leaves):

| Field | Type | Rules |
|---|---|---|
| `listId` | `string \| null` | One of the caller's own, unarchived lists, else 400 |
| `tags` | `string[]` | ≤20, each 1–40 chars; trimmed, lowercased, `#` stripped, deduped |
| `priority` | `0 \| 1 \| 2 \| 3` | none · low · medium · high |
| `startAt` | ISO `\| null` | The day it's planned for ("when") |
| `evening` | `boolean` | This Evening |
| `someday` | `boolean` | `someday: true` clears `startAt` and `evening`; setting `startAt` clears `someday`. Both at once is a 400 |
| `remindAt` | ISO `\| null` | Stored only; nothing sends a reminder yet |
| `recurrence` | `string \| null` | `daily · weekdays · weekly · fortnightly · monthly · yearly · every:N:day\|week\|month` (N 1–365); anything else is a 400 with a sentence |
| `checklist` | `{id,text,done}[]` | ≤100 items, text ≤200, id ≤64 (generated when missing) |
| `orderKey` | `number` | Finite |

`GET /api/backstage/commitments` sorts by `orderKey` then newest, and now also returns `lists`.

**Lists** (`CommitmentList`, private to the owner):

| Route | Body | Returns |
|---|---|---|
| `GET /api/backstage/commitments/lists` | | `{ lists }` (unarchived, by `orderKey` then age) |
| `POST /api/backstage/commitments/lists` | `{ name, color?, symbol?, area?, orderKey? }` | `{ list }` (201) |
| `PATCH /api/backstage/commitments/lists/:id` | any of the above | `{ list }` |
| `DELETE /api/backstage/commitments/lists/:id` | | `{ archived: true }` |

`color` is one of `red orange yellow green mint teal cyan blue indigo purple pink brown gray`;
`symbol` an SF Symbol name (`[a-z0-9.]+`, ≤60); `area` free text ≤60. At most 200 lists a person.
Delete archives the list and sets `listId` to null on the owner's to-dos in it, in one transaction.
Another person's list id is a 404.

**Order:** `POST /api/backstage/commitments/reorder { ids }` (≤500, no repeats, every one the
caller's own, else 404) sets `orderKey` to each id's position in one transaction.

**Repeating** (`nextOccurrence` in `src/lib/commitments.ts`, pure). Days are UTC calendar days and
the time of day is kept. Monthly keeps the day of the month, clamped to a shorter month (31 Jan →
28/29 Feb); weekdays skips Saturday and Sunday. When a repeating to-do moves to `done`, the same
transaction:

- clears `recurrence` on the done one, so reopening it can't make a second copy;
- creates the next one, `open`, copying title, notes, counterpart, list, tags, priority, evening,
  repeat, order and the checklist with every item unticked;
- moves `dueAt`, `startAt` and `remindAt` on from their own old values (each only if set). With
  none set, `dueAt` is the next occurrence from now, at the current time of day.

The `PATCH` response is `{ commitment, next }`, where `next` is that new to-do or `null`.
