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
| `allowExternalChannels` | `false` | **See below. Leave off.** |

### `allowExternalChannels` is a disclosure decision

Per-client Slack Connect channels contain **the client**. Foundry's internal delivery state —
overdue counts, developer workload, unassigned work, Foreman risk flags — is not client-facing.

Default is `false`, and Dispatch **fails closed**: if `conversations.info` errors or the channel
can't be classified, it treats the channel as external and declines. `resolveDispatchConfig`
only accepts a literal boolean `true`, so a stray `"yes"` or `1` in the JSON cannot open it.

Turning this on is a considered disclosure choice, not a convenience toggle.

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

Same discipline as the Foreman narrative:

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
