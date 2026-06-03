# Docs — Link Tracking & Analytics API (Phase 1)

Endpoint reference for the document engagement-tracking feature. Two groups:

- **Public tracking** (`/api/docs/[token]/*`) — no auth; the share token in the URL is the
  credential. Fired by the public `/docs/[token]` web page. Documented for completeness; the iOS
  app normally does **not** call these.
- **Operator analytics** (`/api/documents/*`) — the read APIs the **iOS app consumes**. Auth
  required (mobile JWT or workspace bearer).

All responses use the standard envelope: success is the JSON body shown below (HTTP 2xx); errors
are `{ "error": string, "details"?: unknown }` with a 4xx/5xx status.

---

## Auth

| Caller | Header |
|---|---|
| iOS app (per-user) | `Authorization: Bearer <Foundry mobile JWT>` |
| Server-to-server / scripts | `Authorization: Bearer <API_KEY>` |
| Public tracking endpoints | none — token in the path |

The analytics **read** endpoints are open to any caller with the Docs module (they expose no cost
data). They are mobile-JWT-aware via the shared middleware, same as every other `/api/**` route.

---

## Operator analytics (iOS-facing)

### `GET /api/documents/{id}/analytics`

Per-document engagement: visitors, time-to-open, the per-section dwell heatmap, device/geo splits,
conversion, and recent visits. Poll on the document-detail screen (web polls every 30s).

**Response** `{ "analytics": DocumentAnalytics }`

```ts
interface DocumentAnalytics {
  documentId: string;
  totalViews: number;          // all opens of the public link
  uniqueVisitors: number;      // distinct visitorId (falls back to IP)
  returningVisitors: number;   // visitors who opened more than once
  firstViewedAt: string | null;   // ISO
  lastViewedAt: string | null;    // ISO
  avgDurationMs: number | null;    // avg total visible time per visit
  totalDwellMs: number;            // summed section dwell across all visits
  status: "DRAFT" | "PRODUCT_SIGN_OFF" | "TECH_SIGN_OFF" | "IN_REVIEW"
        | "APPROVED" | "SENT" | "ACCEPTED" | "DECLINED" | "ARCHIVED";
  isShared: boolean;
  sharedAt: string | null;         // ISO — when the link was first minted
  acceptedAt: string | null;       // ISO — set when client accepts in-page
  declinedAt: string | null;       // ISO
  timeToFirstOpenMs: number | null; // firstViewedAt − sharedAt
  sections: Array<{                 // the dwell heatmap, sorted by dwell desc
    sectionKey: string;             // section type (cover, costing, timeline, …)
    sectionTitle: string | null;
    totalDwellMs: number;
    avgDwellMs: number;             // per viewer who saw it
    viewers: number;
    avgScrollPct: number | null;    // 0–100, how much of the section was seen
    sharePct: number;               // 0–100 share of total dwell (heatmap intensity)
  }>;
  devices: Array<{ key: string; count: number }>;   // "mobile" | "tablet" | "desktop" | "bot"
  browsers: Array<{ key: string; count: number }>;
  locations: Array<{ key: string; count: number }>; // "City, CC" or country code
  recentVisits: Array<{
    id: string;
    createdAt: string;              // ISO
    durationMs: number | null;
    visitorLabel: string;           // "London, GB" / IP / "Anonymous"
    device: string | null;
    browser: string | null;
    os: string | null;
    country: string | null;
    city: string | null;
    sectionsViewed: number;
  }>;
}
```

`404 { "error": "Document not found" }` if the id is unknown.

---

### `GET /api/documents/analytics`

Cross-document workspace rollup: the funnel, open/win rates, status breakdown, the most-viewed
documents leaderboard, and the most-read section types. Powers the analytics dashboard screen.

**Query params** (all optional)

| Param | Values | Default |
|---|---|---|
| `documentType` | `PROPOSAL` `SLA` `SOW` `MSA` `NDA` `CO` `DSA` `OTHER` `ALL` | `ALL` |
| `from`, `to` | ISO dates bounding `createdAt` | unbounded |
| `days` | integer; shortcut for `from = now − N days` (ignored if `from` set) | — |

**Response** `{ "analytics": WorkspaceDocAnalytics }`

```ts
interface WorkspaceDocAnalytics {
  range: { from: string | null; to: string | null };
  totals: {
    documents: number;   // non-archived in range
    shared: number;      // ever shared (sharedAt set)
    viewed: number;      // opened at least once
    sent: number;        // status SENT | ACCEPTED | DECLINED
    accepted: number;
    declined: number;
  };
  rates: {
    openRate: number | null;            // viewed / shared        (0–1)
    winRate: number | null;             // accepted / (accepted+declined)
    avgTimeToFirstOpenMs: number | null;
  };
  byStatus: Array<{ status: string; count: number }>;
  topDocuments: Array<{                 // top 8 by views
    id: string; title: string; documentNumber: string | null;
    clientName: string | null; status: string;
    views: number; lastViewedAt: string | null;
  }>;
  topSections: Array<{                  // top 10 by total dwell
    sectionKey: string; totalDwellMs: number; avgDwellMs: number; samples: number;
  }>;
}
```

Example: `GET /api/documents/analytics?documentType=PROPOSAL&days=90`

---

### `GET /api/documents/{id}/activity` *(existing — complements analytics)*

Newest-first event feed merging public views, signature events, comments, and version snapshots
(latest 50) plus a `summary { totalViews, lastViewedAt, totalComments, totalVersions }`. Use for a
per-document activity timeline; use `/analytics` for the aggregated metrics + heatmap.

### Sharing controls *(existing)*

- `POST /api/documents/{id}/share` → `{ shareToken, url }` — mint/reuse the public link (stamps
  `sharedAt` on first share). Requires `docs.share`.
- `DELETE /api/documents/{id}/share` — revoke (token retained, link 404s).

---

## Public tracking endpoints (fired by the web share page)

> The iOS app does not need to call these — they're how the public `/docs/[token]` page reports
> engagement. Listed so the data pipeline is documented end-to-end.

### `POST /api/docs/{token}/view?v={visitorId}&s={sessionId}`
Records (or reuses, per `sessionId`) a view; enriches with geo (Vercel edge headers) + device
(User-Agent); flips `firstViewedAt` on first open and fires `DOC_FIRST_VIEWED` + `DOC_VIEWED`
Slack alerts. `v` = persistent first-party visitor id, `s` = per-visit session id. → `{ ok: true }`

### `POST /api/docs/{token}/events`
Batch of per-section dwell deltas, flushed on tab-hide / pagehide. Body:
```json
{ "sessionId": "…", "durationMs": 184000,
  "sections": [{ "sectionKey": "costing", "sectionTitle": "Investment", "dwellMs": 42000, "maxScrollPct": 90 }] }
```
`dwellMs` is the delta since the last flush (server increments); `maxScrollPct` is cumulative
(server overwrites). → `{ ok: true }`

### `POST /api/docs/{token}/accept`
The in-page conversion event. Flips status to `ACCEPTED`/`DECLINED`, stamps the timestamp, records
the actor on `metadata.acceptance`, fires `DOC_ACCEPTED`/`DOC_DECLINED`. Body:
```json
{ "action": "accept", "name": "Jane Doe", "email": "jane@acme.com", "note": "Looks great" }
```
(`name`, `email`, `note` optional.) → `{ ok: true, status: "ACCEPTED" }`

---

## Slack event kinds (subscribable per webhook)

`DOC_SHARED` · `DOC_VIEWED` · `DOC_FIRST_VIEWED` · `DOC_SENT` · `DOC_SIGNED` · `DOC_COMPLETED` ·
`DOC_ACCEPTED` · `DOC_DECLINED` · `COMMENT_ADDED`

---

## Data model (Phase 1 additions)

- `DocumentView` gained `visitorId`, `sessionId`, `country`, `city`, `device`, `browser`, `os`,
  `durationMs` (+ indexes on `visitorId`/`sessionId`).
- `DocumentViewEvent` (new) — one aggregate row per `(view, sectionKey)`: `dwellMs`, `maxScrollPct`.
- `Document` gained `sharedAt`, `firstViewedAt`, `acceptedAt`, `declinedAt`.
- `DocumentStatus` gained `ACCEPTED`, `DECLINED`.

All additive — applied by the build's `prisma db push` without data loss.
