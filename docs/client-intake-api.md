# Client intake API

Lets a **client's own system** push bugs, feedback and feature requests into their
Foundry wiki's **Requests** section, and keep status in sync — no re-typing.

Works for **any client**, not a per-client integration: every client wiki has its
own intake token, and the API is the same for all of them.

---

## 1. Give the client a token (internal, one minute)

The token is the credential their system authenticates with. Reveal or rotate it:

```bash
# reveal (mints on first call)
curl -H "Authorization: Bearer $API_KEY" \
  https://foundry.gitwork.co.uk/api/clients/<client-slug>/wiki/intake-token

# rotate — invalidates the old token immediately
curl -X POST -H "Authorization: Bearer $API_KEY" \
  https://foundry.gitwork.co.uk/api/clients/<client-slug>/wiki/intake-token
```

Requires **manage-clients** permission. Send the client the token only —
everything below needs nothing else.

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
| `type` | | `Bug` · `Feedback` · `Feature request` (also accepts Issue, Defect, Enhancement, Task, Comment). Default `Feedback` |
| `priority` | | `Low` · `Medium` · `High` (also `P1`/`P2`/`P3`, `Urgent`, `Critical`, `Minor`). Default `Medium` |
| `status` | | `New` · `Triaged` · `In progress` · `Closed` (also `Open`, `Accepted`, `Done`, `Resolved`, `Rejected`, `Won't fix`) |
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

## 6. Known limits

- **Links, not uploads.** Screenshots come in as URLs the client hosts. Binary
  upload is a UI-only path today.
- **One token per client**, rotatable but not per-integrator — you can't revoke
  one system's access while keeping another's. Fine for one integration per
  client; revisit if a client wants several.
- **No webhooks out.** The client polls `?items=1` to see our side; we don't call
  them when a status changes here.
- **No rate limit** on these endpoints yet. The token is the only gate, so rotate
  it if a client's system misbehaves.
