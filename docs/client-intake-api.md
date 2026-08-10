# Client intake API

Lets a **client's own system** push bugs, feedback and feature requests into their
Foundry wiki's **Requests** section, and keep status in sync — no re-typing.

Works for **any client**, not a per-client integration: every client wiki has its
own intake token, and the API is the same for all of them.

---

## 1. Give the client a token (internal, one minute)

**Portal → the client → Wiki → Settings → `02 // API INTAKE`.**

Everything is there: the toggle that mints the token, the token itself, every
endpoint with the token already substituted (so they paste and run), a worked
`curl` example, and **Rotate**. Present for every client — nothing to set up
per-client beyond flipping it on.

Turning it **off** nulls the token, which stops their pushes immediately.
**Rotate** replaces it — their integration breaks until they update it, so use it
when a token has been shared too widely.

The same endpoint is scriptable if you need it
(`GET`/`POST /api/clients/<slug>/wiki/course-requests/ingest-token` — named for
the Wedge course feed, which shares this credential).

Send the client the token only — everything below needs nothing else.

> ⚠️ **Never give a client the workspace `API_KEY`.** It authorises every `/api/`
> route for the whole workspace — every other client's documents, tasks, rates and
> support history. The intake token authorises one thing: writing requests for
> **one** client. It also *identifies* the client, so there is no way to express
> "write to a different client's wiki", and a leaked token can't be repointed.

**Prerequisite:** the client's wiki must have the **Requests** section enabled
(Portal → client → Wiki → the Requests page). With it off, the API returns 404 —
that's the off switch.

---

## 2. What the client sends

Base URL: `https://foundry.gitwork.co.uk/api/public/wiki-items/<token>`

### Check the token works

```bash
curl https://foundry.gitwork.co.uk/api/public/wiki-items/<token>
# → { "ok": true, "client": { "id": "...", "slug": "wedge", "name": "Wedge" } }
```

### Create an item

```bash
curl -X POST https://foundry.gitwork.co.uk/api/public/wiki-items/<token> \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Scorecard totals wrong on 9-hole rounds",
    "description": "Front-9 total double-counts hole 9. Repro: play 9 holes, submit.",
    "type": "Bug",
    "priority": "High",
    "status": "New",
    "requestedBy": "Luke McFarland",
    "externalRef": "BWG-1421",
    "externalUrl": "https://tracker.example.com/issues/BWG-1421",
    "attachmentUrls": ["https://tracker.example.com/files/scorecard.png"]
  }'
```

### Fields

| Field | Required | Notes |
|---|---|---|
| `title` | ✅ | Max 180 chars |
| `description` | | Max 10,000 chars |
| `type` | | `Bug` · `Feedback` · `Feature request` · `Design` (also accepts Issue, Defect, Enhancement, Task, Comment, Design change/edit, UI, UX). Default `Feedback` |
| `priority` | | `Low` · `Medium` · `High` (also `P1`/`P2`/`P3`, `Urgent`, `Critical`, `Minor`). Default `Medium` |
| `status` | | `New` · `Triaged` · `In progress` · `Closed` (also `Open`, `Accepted`, `Done`, `Resolved`, `Rejected`, `Won't fix`) |
| `label` | | `Backend` · `Frontend` · `UI/UX` · `Research` · `Design` (also `API`, `UI`, `UX`). Carried onto the task when the request is promoted, so it lands already categorised |
| `categoryId` | | One of **this client's own** category ids, when they've been given a custom set (e.g. `quick-design-fix-v1`). It decides `type`, so send one or the other — not both. Ask your Gitwork contact for the list |
| `requestedBy` | | Who raised it their side |
| `externalRef` | **strongly advised** | The item's id in their system. See idempotency below |
| `externalUrl` | | Deep link back to the item — the team clicks through to the source |
| `attachmentUrls` | | Up to 10 `http(s)` links (screenshots etc.) |

Case and spacing don't matter: `"feature request"`, `"FEATURE_REQUEST"` and
`"Feature Request"` all work. Anything unrecognised is a 400 rather than being
silently coerced.

### Batch

```json
{ "items": [ { "title": "…" }, { "title": "…" } ] }
```

Up to 200 per call.

### Update an item

```bash
curl -X PATCH https://foundry.gitwork.co.uk/api/public/wiki-items/<token>/BWG-1421 \
  -H "Content-Type: application/json" \
  -d '{ "status": "Closed", "priority": "Low" }'
```

The path segment is **either** their `externalRef` **or** our item `id`, so they
never need to store our ids. Only the fields sent are changed.

### Attach a real screenshot

`attachmentUrls` is fine when the client hosts the file publicly — but a link into
their private tracker will often 403 for us, so they can upload the bytes instead.
Create the item first, take the `id` from the response, then:

```bash
curl -X POST "https://foundry.gitwork.co.uk/api/wiki/<token>/intake-items/<id>/image" \
  -F "file=@screenshot.png"
```

Same token. PNG / JPEG / WebP / GIF / HEIC, up to 8MB — HEIC is transcoded and a
thumbnail is generated. One image per item (a second upload replaces it); use
`attachmentUrls` for additional files. Note this path is `/api/wiki/...`, not
`/api/public/wiki-items/...` — a historical split, not a different credential.

### List what we hold (to reconcile)

```bash
curl "https://foundry.gitwork.co.uk/api/public/wiki-items/<token>?items=1&status=New&limit=50"
```

---

## 3. Idempotency — why `externalRef` matters

Integrations retry. A network blip that duplicated every bug report would make the
Requests page useless, so pushes are **deduped**:

- same `externalRef` → skipped, not duplicated
- same title as an existing **open** item → skipped

The response reports both: `{ "created": [...], "skipped": 2, "count": 1 }`.
**`skipped` is not an error** — it means the item was already there. Safe to
re-send the same payload on a retry, or on a schedule.

To *change* an existing item, use `PATCH` (above) rather than re-POSTing.

---

## 4. Responses

| Code | Meaning |
|---|---|
| `201` | Created (check `created` / `skipped`) |
| `200` | PATCH / GET succeeded |
| `400` | Validation failed — the message names the field |
| `404` | Bad or rotated token, Requests section disabled, or (on PATCH) no such item for this token |
| `429` | Rate limit — see below. Existing items are unaffected |

An item that isn't this client's is indistinguishable from one that doesn't
exist — deliberately, so the endpoint can't be used to probe for ids.

---

## 5. What happens on our side

A created request lands in the client's wiki **Requests** section and notifies the
devs assigned to that client (the same alert as a request submitted through the
wiki UI — an API push is not silent). From there the team triages it and can
promote it to a task on the client's board.

`externalUrl` and `attachmentUrls` are stored as **links** and rendered as links.
We never fetch them: an API that retrieved a caller-supplied URL would be an SSRF
vector against our own network. Only `http(s)` links are stored.

---

## 6. Status webhook — us → them (optional)

By default the client polls `?items=1` to see changes on our side. If they'd
rather be told, set a webhook: **Wiki → Settings → `02 // API INTAKE` → Status
webhook**.

We then `POST` to their URL whenever a request changes here:

| Event | Fires when |
|---|---|
| `request.promoted` | We turned it into a task — usually the one they care about |
| `request.closed` | Marked dealt with |
| `request.updated` | Any other change (type, priority, title, triaged) |
| `request.deleted` | The request was removed |

Body:

```json
{
  "event": "request.promoted",
  "client": "wedge",
  "externalRef": "BWG-1421",
  "id": "cms…",
  "title": "Scorecard totals wrong on 9-hole rounds",
  "type": "BUG",
  "status": "PROMOTED",
  "priority": "HIGH",
  "promotedToTask": true,
  "sentAt": "2026-08-05T09:12:03.000Z"
}
```

`externalRef` is theirs, so they can match it without storing our ids.

**They must verify the signature.** Each delivery carries
`X-Foundry-Signature: sha256=<hmac>` — HMAC-SHA256 over the raw body using the
secret shown once when the webhook is saved. Anyone who learns the URL could
otherwise post fake status changes into their tracker.

```js
const expected = "sha256=" + crypto.createHmac("sha256", SECRET)
  .update(rawBody, "utf8").digest("hex");
// compare with timingSafeEqual against the X-Foundry-Signature header
```

Operational notes, stated plainly:

- **https only**, and the host must resolve publicly. The host is re-checked on
  every delivery, not just at save time — a hostname can be repointed at an
  internal address afterwards.
- **One attempt, 4-second timeout, no retries.** Delivery must never slow or fail
  the Gitwork user who just closed a request, so a failure is logged and dropped.
  Treat the webhook as a nudge, not a guaranteed ledger — `?items=1` remains the
  source of truth if they need certainty.
- A client's own `PATCH` does **not** fire a webhook back at them; that would loop.

---

## 7. Named keys — one per integrator (optional)

Use these when a client has **more than one system** pushing, or when you want to
be able to cut one integration off without breaking the rest. The shared token in
§1 keeps working; these are additive.

Mint one at **Portal → client → Wiki → Settings → `02 // API INTAKE` → Integrator
keys**: give it a name (`Jira`, `Zendesk`, `Luke's script`), and the key is shown
**once**. Only a hash is stored, so it cannot be revealed again — a lost key is
revoked and replaced.

A named key looks like `fdy_ik_…` and is used in **exactly the same place** as the
token, so nothing about the integration changes:

```
POST https://foundry.gitwork.co.uk/api/public/wiki-items/fdy_ik_XXXXXXXX
```

Every endpoint in this document accepts either. The list shows each key's name,
when it was **last used**, and Revoke. Revoking takes effect immediately and is
not reversible; the key stays listed so there's a record of who had access when.

⚠️ **Don't mint one key and give it to several systems** — that's the shared
token again with extra steps, and it defeats the point: you can no longer tell
which system is pushing or cut one off on its own.

## 8. Known limits

- **The shared client token is also used by other feeds.** For Wedge it
  authenticates the golf-course request feed too, so rotating it affects both.
  If a client has more than one system pushing, mint them a **named key each**
  (§7) instead — then you can revoke one without touching the others.
- **Rate limit: 300 new requests/hour, 1000/day per client.** Generous enough for
  a real backfill (a full 200-item batch passes), tight enough to stop a looping
  integration burying the page. It counts items actually CREATED, so deduped
  retries cost nothing, and a `?dryRun` connectivity check is never billed.
  Requests filed by hand in the wiki UI are never blocked by a client's
  integration. A `429` leaves existing items untouched — don't re-send
  everything on seeing one.
