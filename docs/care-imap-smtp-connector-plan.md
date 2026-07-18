# Care IMAP/SMTP mailbox connector — build plan

**Goal:** connect *any* client mailbox to Care for **read + reply-as**, using only
mailbox access — **no client Google admin, no domain-wide delegation, no Google
restricted-scope verification**. Each new client becomes a ~2-minute "paste host +
app password" setup. Turns Care into a true multi-tenant shared inbox (Front /
Missive / Help Scout pattern).

**Why now:** IMAP needs a long-lived socket — impossible on Vercel serverless, but
fine on the **Fasthosts VPS** (long-running containers). This is only viable
post-migration.

## Where this sits vs the existing Gmail connector

- Today's `GMAIL` connector = workspace **service account + domain-wide delegation**.
  Only reaches mailboxes inside `gitwork.co.uk`; any external client mailbox needs
  *their* Workspace admin to authorise our service account. Doesn't scale.
- New `IMAP` connector = **per-connection credentials** (IMAP read + SMTP send). Works
  for any provider/domain the operator can log into. This is the scalable path.
- Keep both. DWD stays for gitwork-domain inboxes; IMAP covers everyone else.

## Auth model

- Per-connection IMAP + SMTP credentials stored on `AccountConnection.scraperConfig`
  (encrypted at rest — see Security).
- Gmail/Workspace: **App Password** (requires 2FA + IMAP enabled on the account).
  Sending via the client's own SMTP means SPF/DKIM pass — legitimate, not spoofing.
- Generic: any host/port/username/password.

## Data model

- **Prisma:** add `IMAP` to the `SupportSource` enum (additive → applies via build
  `prisma db push`). Frontend `SupportSource` union += `"imap"`; add the lowercase
  mapper case (`mapSource`/`toDbSource` already do `.toLowerCase()`/`.toUpperCase()`,
  so no mapper edit needed — just the union type).
- **scraperConfig shape** (`AccountConnection.scraperConfig`, JSON):
  ```ts
  {
    imapHost: string; imapPort: number;   // e.g. imap.gmail.com : 993
    imapSecure: boolean;                   // TLS (true for 993)
    smtpHost: string; smtpPort: number;    // e.g. smtp.gmail.com : 465
    smtpSecure: boolean;                   // true=465/implicit TLS, false=587/STARTTLS
    username: string;                      // full email address
    password: string;                      // app password — SENSITIVE, encrypted
    fromName?: string;                     // display name on replies
    fromAddress?: string;                  // defaults to username
    folder?: string;                       // default "INBOX"
    lastUid?: number;                      // incremental fetch cursor
    syncIntervalMinutes?: number;          // reuse the per-connector gating (#245)
  }
  ```
- **Encryption:** add `"password"` to `SENSITIVE_SCRAPER_KEYS` in `support.ts` so it's
  AES-256-GCM encrypted via the existing `encryptScraperConfig`. `serializeConnection`
  already strips sensitive keys from UI payloads, and `updateConnection` now **merges**
  scraperConfig, so editing other fields won't wipe the stored password.

## Dependencies (new)

- `imapflow` — modern promise-based IMAP client (read).
- `nodemailer` — SMTP send.
- `mailparser` — parse RFC822 → { from, subject, date, messageId, references, text, html }.
- `html-to-text` (or reuse the Gmail body-extraction helper) for HTML→plaintext.

## Adapter — `src/server/support-channels/imap.ts`

```ts
export const imapAdapter: ChannelAdapter = {
  key: "IMAP",
  run: runImap,          // ingest (uses the run() escape hatch, like gmail.ts)
  sendReply: sendImapReply,
};
```

**`runImap(ctx)`** (ctx.connection.scraperConfig already decrypted by `buildSyncContext`):
1. Connect `ImapFlow({ host: imapHost, port: imapPort, secure: imapSecure, auth: { user: username, pass: password } })`.
2. Open `folder` (INBOX) — **use `BODY.PEEK` / mark-seen=false so reading never marks
   mail read** (the #202 lesson; matters even more on a client's live inbox).
3. Incremental fetch: messages with `UID > lastUid` (first run: last ~30 days / cap 200).
4. Parse each via `mailparser` → from, subject, date, `Message-ID`, `In-Reply-To`,
   `References`, text body (fallback html→text).
5. **Threading:** group by `References`/`In-Reply-To` root → `externalId` = root
   Message-ID; fallback = normalized subject. Mirrors the Gmail `threadId` behaviour.
6. Upsert conversation (`clientId+source+externalId`) + message (`externalId` =
   Message-ID, dedup). Direction: `outbound` if `from` == `fromAddress`/username, else
   `inbound`. (Optionally also read the Sent folder to reflect replies made outside Care.)
7. Persist `lastUid` back onto scraperConfig (merge-update).
8. Return `SyncResult { fetched, ingested, filtered, filterReasons, errors, newConversationIds }`.

**`sendImapReply(ctx, externalId, body)`**:
1. `nodemailer.createTransport({ host: smtpHost, port: smtpPort, secure: smtpSecure, auth: { user: username, pass: password } })`.
2. Resolve `To` from the conversation's `customerLabel`; subject `Re: …`.
3. Set `In-Reply-To` + `References` to the original Message-ID for correct threading.
4. `from: fromName <fromAddress||username>`; send. Optionally `APPEND` to Sent via IMAP.

## Wiring

- Register `imapAdapter` in `ADAPTERS` (`support-channels/index.ts`).
- `support-reply.ts`: add `case "IMAP"` → `getChannelAdapter("IMAP")?.sendReply(...)`
  (or a local `imapReply`), and add `"imap"` to `SENDABLE_SOURCES`.
- Cron: no change — reuse the per-connector `syncIntervalMinutes` gating already in
  `support-sync`. (v1 opens/closes a connection per run; IMAP IDLE/push is a v2.)

## Test-connection endpoint

`POST /api/support/clients/[clientId]/connections/test-imap` `{ config }` → attempts
`ImapFlow` login **and** `nodemailer.verify()`, returns `{ imap: ok|error, smtp: ok|error }`.
Surfaced as a "Test connection" button in the add/edit modal so operators get instant
feedback instead of a saved-but-broken connector.

## UI — `support-dashboard.tsx`

- `SupportSource` frontend union += `"imap"`; `SOURCE_LABEL.imap = "Email (IMAP/SMTP)"`;
  `SOURCE_TAGLINE.imap`; `SourceIcon` envelope glyph.
- `LIVE_SOURCES += "imap"`.
- `AddConnectorModal` IMAP form:
  - **Provider preset** dropdown (Gmail / Outlook / Custom) that prefills host/port/secure.
  - Fields: email (username), app password, from-name, "Advanced" (host/port/secure).
  - "Test connection" → the endpoint above before Save.
- Connector card `detailLine`: `username · imapHost`.

## Provider presets

| Provider | IMAP | SMTP | Notes |
|---|---|---|---|
| Gmail / Workspace | imap.gmail.com:993 (TLS) | smtp.gmail.com:465 (TLS) | Needs 2FA + **App Password** + IMAP enabled |
| Outlook / M365 | outlook.office365.com:993 | smtp.office365.com:587 (STARTTLS) | ⚠️ Many M365 tenants disable basic auth — may need OAuth (v2), not app password |
| Custom | user-entered | user-entered | — |

## Edge cases / notes

- **Never mark read** — `BODY.PEEK`/mark-seen=false.
- **Attachments:** v1 stores text only; note as `[attachment: name]`. Full handling = v2.
- **Dedup:** Message-ID unique per conversation; thread via References/In-Reply-To.
- **Caps:** ≤200 messages/run + `lastUid` cursor so a big backlog drains over runs.
- **Deliverability:** sending through the client's own SMTP = SPF/DKIM aligned, legit.
- **Credentials:** never logged; encrypted at rest; test endpoint returns booleans only.

## Rollout

1. **v1** — Gmail/app-password IMAP + SMTP (covers Wedge `app@bigwedgegolf.com` + most
   clients). Ships the connector, send path, test endpoint, UI, enum.
2. **v2** — Outlook/M365 (OAuth/modern auth), IMAP IDLE for near-real-time, attachments,
   Sent-folder sync.

## Effort estimate

Medium. New deps (imapflow/nodemailer/mailparser) + one adapter (~200 lines) + send
path + test endpoint + modal form + enum/type/encryption-key line. No new infra — the
VPS already runs long-lived containers. No client admin, no Google verification.
