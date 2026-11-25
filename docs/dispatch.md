# Dispatch — the Slack-resident coordinator

Mention `@Foundry` in a Slack channel, or DM the bot, and ask a delivery question:

> `@Foundry where are we with the ElectricFire onboarding?`
> `@Foundry what has Howard done on Big Wedge Golf?`
> `@Foundry is anything at risk?`

Dispatch answers from Foundry's own records — tasks, feature blocks, milestones, Scribe notes,
documents/signatures, onboarding state, and the findings Foreman already raised — and it always
states what it could **not** confirm.

This is Phase 1: **Foreman with a mouth.** It reads Foundry, not Slack. See
[Deliberate limits](#deliberate-limits).

---

## Why it exists

The answer to "where are we with X?" already lived in Foundry — on the Desk drawer, in the
Monday Brief, in the Foreman digest. But you had to go and look, and you couldn't ask a
follow-up. Dispatch puts the answer where the conversation already is and makes it
interrogable, which is the whole difference.

## The design rule that matters

**Dispatch may only state what it gathered, and it says out loud what it couldn't confirm.**

A coordinator that smooths over a gap ("looks like that's done") is worse than no coordinator,
because a human then stops checking. So the pipeline is deliberately split:

```
question
  → deterministic subject resolution   (resolve.ts — pure, no DB)
  → deterministic evidence pack        (evidence.ts — Prisma only, no AI)
  → ONE light-tier LLM call            (answer.ts — may only rephrase the pack)
```

The LLM never queries, never infers, and never decides what is true. It is a writer, not a
researcher. Three structural consequences:

1. **The `unverified` list is not the model's to write.** It is derived from the evidence pack's
   blind spots and merged in afterwards. The model may only *add* caveats, never remove one.
2. **There is a no-AI floor.** `composeDeterministicAnswer()` is a pure function over the
   evidence pack. If no API key is set, or the AI call fails, or it returns junk, Dispatch still
   answers — just plainly. It never goes silent and never guesses.
3. **"Nothing overdue" is never allowed to mean "on track"** unless tasks actually have due
   dates. That distinction is computed in `deriveBlindSpots()`, not left to the model's mood.

### Blind spots

Each one names a question the evidence *cannot* answer, and is surfaced rather than papered over:

| Kind | Means |
|---|---|
| `NO_TASKS` | Nothing tracked for this subject — progress can't be judged from the board |
| `NO_DUE_DATES` | ≥ half of open tasks are undated → "on time?" is unanswerable for those |
| `NO_TIMELINE` | No dated feature block → slippage can't be measured against a plan |
| `NO_COMPLETION_STAMPS` | Tasks marked done with no `completedAt` → *when* is unknown |
| `NO_RECENT_ACTIVITY` | Open work exists but none of it moved in the window |
| `NOT_IN_FOUNDRY` | Named in Slack, no Foundry record to report from |
| `SLACK_NOT_READ` | Added only when the board has gone quiet — see below |

`SLACK_NOT_READ` is deliberately conditional. Stating "I don't read Slack" on every answer is
noise; stating it when the board is silent is the one moment a reader would otherwise conclude
nothing happened.

---

## Setup

### 1. Reinstall the Slack app (required — new scopes)

Slack does **not** grant new scopes to an existing token. Dispatch adds `app_mentions:read`,
`im:history`, `im:read`, `im:write`.

1. Open the app at <https://api.slack.com/apps> → **App Manifest**.
2. Paste `docs/slack-app-manifest.json` (minus the `_comment` key — Slack rejects unknown
   top-level keys) and save. This sets the Events request URL to
   `https://foundry.gitwork.co.uk/api/webhooks/slack/events` and subscribes `app_mention` +
   `message.im`.
3. Slack immediately sends a `url_verification` challenge to that URL. It must go green — the
   endpoint answers it (signature-checked) before anything else.
4. **Reinstall to workspace**, then re-save the bot token in **Settings → Integrations**.
5. Invite the bot to the channels you want it in: `/invite @Foundry`.

### 2. Set `slackBotUserId`

The loop guard uses `Workspace.slackBotUserId` to ignore the bot's own messages. `auth.test`
returns it (`user_id`) and the Integrations panel stores it. **If it's unset Dispatch still
won't loop** — `bot_id` is present on every bot-authored message and is checked independently —
but set it anyway; it's the primary guard and the cheaper one.

### 3. Config — `Workspace.dispatchConfig`

No Settings UI yet (deferred); flip the JSON directly.

| Key | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Master switch. Off → the endpoint acks and does nothing. |
| `recentDays` | `7` | Window: reaches **back** for completed work, **forward** for due dates. |
| `maxEvidenceItems` | `12` | Cap per evidence list. Exceeded → the answer says "capped". |
| `perChannelPerHour` | `20` | Question budget per channel per rolling hour. |

A stored `allowExternalChannels` is ignored. It used to open Slack Connect channels; there is no
longer any switch for that (below).

### Who Dispatch answers, and where (November 2026)

Dispatch answers **as the person asking**, never as the workspace. The rules are pure, in
`src/server/dispatch/access.ts`, and tested in `__tests__/access.test.ts`.

- **The asker must be a Foundry member.** Their Slack profile email is matched to an active
  membership in this workspace and resolved with their live role and permissions
  (`resolveEffectiveUserById`). No match, an archived member, or a failed lookup → Dispatch
  declines and says why.
- **They need Portal** (`clients`). Dispatch's evidence is Portal data.
- **Only their clients.** Someone without "Every client" can ask only about clients they can open
  (`assignedClientIds`, the same rule as the task board). Clients they can't open aren't even
  candidates for matching, so a question about one reads like an unknown name: Dispatch never
  confirms a client it won't discuss exists. Questions about a person, or across every client,
  are refused to them, because both span every client.
- **Documents follow Docs' rule.** A developer isn't told that a proposal or contract exists.
- **Where the answer goes.** In a DM, or in the client's own internal channel
  (`slackInternalChannelId` / legacy `slackChannelId`), the answer is posted in the thread.
  Anywhere else the people reading may not share the asker's access, so the answer goes to the
  asker by DM and the thread gets a one-line note.
- **Slack Connect channels are never answered.** They contain the client. Dispatch fails closed:
  if `conversations.info` errors or the channel can't be classified, it is treated as external.

Before November 2026 Dispatch matched the asker only for the audit row, so anyone in Gitwork's
Slack could ask about any client.

---

## The assistant (November 2026, §154)

Behind `dispatchConfig.assistantEnabled` (default **off**; Super Admins can use it before that).
With it on, a person with `dispatch.use` gets the assistant both in the app (the right-hand panel)
and in Slack; everyone else, and anything that isn't about one client, keeps the answer above.

All of this is set in **Settings → Dispatch** (Super Admins), stored in `dispatchConfig`:

| Key | Default | Meaning |
|---|---|---|
| `assistantEnabled` | `false` | Only a literal `true` switches it on. |
| `budgetUsd` | `200` | The AI budget alerts are measured against (every AI feature on the Anthropic key). |
| `budgetSince` | none | `YYYY-MM-DD` to count a one-off pot from; empty means each calendar month. |

The Figma token is on the same page (stored encrypted in `Workspace.figmaToken`).

**Switching it on:**

1. Reinstall the Slack app from `docs/slack-app-manifest.json` (it now asks for
   `channels:history` and `groups:history`) and re-save the bot token in Settings → Integrations.
2. Check the workspace has an Anthropic key in Settings → Integrations. Dispatch uses
   that key, whatever the workspace's own model setting says: Claude Haiku 5.5 for most chats,
   Claude Sonnet 5.5 for code and design-against-build chats (see Cost below).
3. For code questions, the server's `GITHUB_TOKEN` must be able to read the clients' repos.
   For design questions, add a Figma token in Settings → Dispatch from an account that can see
   the clients' files.
4. Switch it on in Settings → Dispatch.

To try it as a particular developer first, use view-as (Super Admins): Dispatch works in the
preview while the switch is off, with exactly that person's access. Chats made while previewing
are saved as theirs, so delete test chats afterwards.

**What it can read** (§156), always only for the client the chat is about:

- Foundry's own records: tasks, releases, meetings, wiki, documents, the linked Drive folder
  (with the asker's own Google account) and the internal Slack channel.
- **Code:** the repositories on the client's platforms. Secret files are never opened.
- **Designs:** the Figma files linked as the client's designs, and pictures of their frames.
- **What was built:** screenshots of the client's own sites (production or staging), and
  screenshots people attach or paste in the panel (at most four per question).

**Where the spend comes from (§159).** With an Anthropic Admin key (Settings → Dispatch → 04
Anthropic billing), Anthropic's own billed spend for the whole organisation, plus Foundry's
estimate for today, since Anthropic reports a day behind. Without one, Foundry's estimate from
list prices. The sidebar's AI spend card and the alerts use the same figure. The budget amount is
always the one set here: Anthropic has no API for the credit balance.

**Budget alerts.** Hourly from the `jobs` worker. Super Admins are told once at 50%, 80% and 95%
of the budget per period, in Foundry and on the ops Slack webhook. Nothing is switched off at
100%. Spend is estimated from list prices (Analytics → AI usage shows it beside the provider's
billed figure when an admin key is set).

**Chats are deleted after 90 days unused**, nightly, with any proposal never carried out.
Carried-out proposals stay as the record of what Dispatch changed.

**A DM to Foundry is a conversation.** Follow-ups carry on from the last question for 3 hours,
until you name another client. If Foundry doesn't know which client you mean, it names yours and
asks. Replies come at the top level of the DM, not in a thread under each message.

**Where you can ask in Slack.** @Foundry in a channel Foundry is a member of (invite it with
`/invite @Foundry`), or a direct message to Foundry itself (App Home → Messages tab, switched on
in the manifest). Slack never shows an app a DM between people, so @Foundry there goes nowhere.

**Where a Slack answer goes.** A DM, or the client's own internal channel: in the thread. Anywhere
else: to the asker by DM, with a note in the thread. An answer posted in a channel never shows
figures or admin-only document types, whoever asked (`forChannel` in `assistant/scope.ts`).

**Confirm and Cancel.** Proposed changes arrive with buttons. A press is honoured only for the
Foundry member the pressing Slack account resolves to, and only if the proposal was theirs; anyone
else gets a private "only the person who asked" note. The work runs after Slack's 3-second ack.

**What is stored.** The chat (`DispatchConversation`, `DispatchMessage`) is private to its owner.
Proposals and what happened to them are `DispatchAction` rows: the audit trail of every change
Dispatch made. The Slack row (`DispatchExchange`) records who, which client and the outcome, not
the text.

**Cost.** Every model call is in Analytics → AI usage under module `DISPATCH`, with cache reads.
Expect a few cents a question; the second question within five minutes is cheaper because the
system prompt and tools are read from the cache.

---

## What gets recorded

One `DispatchExchange` row per question, written **before** the answer is composed:

- `slackEventId` is **unique** — that's the Slack retry-dedupe guard. Slack re-delivers an event
  up to 3× when an ack is slow; the second delivery loses the insert race and stops. If an
  earlier attempt died before inserting, a retry legitimately proceeds.
- `status` distinguishes a real answer from the honest refusals: `answered` · `no_subject` ·
  `rate_limited` · `no_ai` · `error`. Those are outcomes worth seeing, not silent failures.
- `unverified`, `evidence` (counts + blind-spot kinds only — not a second copy of client data),
  `aiModel`, `cached`, `latencyMs`.

## Cost

**The assistant (§157).** Each chat is answered by one model, chosen from its first question
(`src/lib/dispatch/model.ts`) and kept for the chat:

| Chats about | Model | Price per million tokens (in / out) |
|---|---|---|
| Everything else: tasks, calls, plans, stand-ups, replies, release notes, subtasks | Claude Haiku 5.5, thinking off | $0.10 / $0.50 |
| Code (repo, PRs, commits, impact analysis), design against build, or with screenshots attached | Claude Sonnet 5.5, brief thinking | $2 / $10 |

**Measured (25 Nov 2026, §158):** ten real Wedge questions cost $0.035 in all. A Haiku question
costs well under a tenth of a cent; a Sonnet code question about 3 cents. 84% of the prompt came
from the cache.

Other limits (`src/lib/dispatch/limits.ts`): 5 rounds of lookups, 2,500 output tokens, results cut
at ~1,100 tokens (code ~1,500), 3 pictures a question, and a chat closes for new questions at 24
messages or ~30k tokens. The last one matters most after the model: every follow-up resends the
whole chat, so Dispatch asks for a new chat rather than letting one grow.

**The older Slack status answer** keeps the Foreman narrative's discipline:

- **One** `tier: "light"` (Haiku) call per question, 900 max tokens.
- The stable system prompt is `cache_control: ephemeral`, so it's prompt-cached.
- The whole call is wrapped in `AiResponseCache`. The **cache key** carries the subject + the
  question; the **inputs hash** carries the evidence. Re-asking the same question against an
  unchanged board is **£0**.
- Attributed to `AiModule.SLACK`, so it shows up in Super-Admin → Analytics → AI usage.
- Per-channel rate limit counts **every** exchange, including unanswerable ones — a flood of junk
  questions still costs DB work and Slack calls.

---

## Deliberate limits

- **It does not read Slack conversation.** No `channels:history` / `groups:history` scope is
  requested — least privilege, and it keeps the answer's provenance honest. When the board is
  quiet Dispatch says so explicitly rather than implying nothing happened. Reading and
  reconciling channel history is Phase 3.
- **There is no mission object yet.** Nothing in Foundry represents "the ElectricFire
  onboarding" as a durable thing with an owner, a completion target and an evidence log —
  `ClientOnboarding` is a form-fill session with a `currentStep`. Dispatch answers from
  *derived* state. That's Phase 2, and it's the real product work.
- **It answers, it doesn't act.** No task creation, no status changes, no messages on your
  behalf. Read-only by construction.
- **Replies are always in-thread.** The point is to reduce Slack noise, so a bot answering into
  the channel body would be self-defeating.
- **No Settings UI, no panel.** Config is JSON on the workspace; exchanges are queryable but
  not yet rendered anywhere.

## Also in this slice: the `slack` notification channel

`dispatchNotification` previously no-op'd on `slack`. It now posts **once** per dispatch to
`Workspace.channelRoutes[event]`, gated on the event's **default** routing containing `slack`.

Deliberately *not* per-recipient: the other channels deliver to a person, so a person's
preference governs them. A channel post is a workspace broadcast — routing it per-recipient
would post N copies of one digest to one channel and would let an individual's mute change what
a shared channel sees. It also runs independently of the recipient set, so a digest routed to a
channel still lands there even if every individual has muted it.

`foreman.digest` now routes `["inApp", "push", "slack"]`. Set
`channelRoutes["foreman.digest"] = "C…"` in **Settings → Integrations** and the morning delivery
picture lands in that channel. No route configured → silent no-op, so declaring `slack` on an
event before a channel is picked is safe.

---

## Verifying after deploy

The app is auth-gated with no local DB, so this is post-deploy work:

1. `POST /api/webhooks/slack/events` with a bad signature → **401**. (The HMAC is this
   endpoint's only auth; `/api/webhooks/slack` is a public path in middleware.)
2. Slack's **Event Subscriptions** page shows the request URL **Verified**.
3. In an internal channel: `@Foundry where are we with <a real client>?` → a threaded answer
   card with a **Not confirmed** block.
4. Ask the *same* question again → footer reads `cached` (proves the £0 path).
5. Ask something unresolvable (`@Foundry sort that out`) → the "name a client" notice, and a
   `DispatchExchange` row with `status: "no_subject"`.
6. In a **Slack Connect** channel → the declines-to-post notice, not an answer.
7. Check `DispatchExchange` rows carry `latencyMs`, `aiModel` and the blind-spot kinds.
8. `GET /api/cron/foreman` with `CRON_SECRET`, then confirm the digest lands in
   `channelRoutes["foreman.digest"]` (once, not per admin).
