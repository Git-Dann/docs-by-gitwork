import { google } from "googleapis";
import type { ChannelAdapter, ChannelFetchResult, RawConversationItem } from "./types";
import { lookbackSeconds } from "./shared";

interface AppReviewsConfig {
  store: "app_store" | "play_store";
  appId: string;
  country?: string;
  serviceAccountJson?: string;
  lookbackDays?: number;
}

// ─── App Store (public RSS JSON feed — no auth) ─────────────────────────────

interface AppStoreEntry {
  id?: { label?: string };
  title?: { label?: string };
  content?: { label?: string };
  "im:rating"?: { label?: string };
  author?: { name?: { label?: string } };
  updated?: { label?: string };
}

interface AppStoreFeed {
  feed?: {
    entry?: AppStoreEntry[];
  };
}

async function fetchAppStoreReviews(
  appId: string,
  country: string,
  afterUtc: number,
): Promise<{ items: RawConversationItem[]; fetched: number; errors: string[] }> {
  const items: RawConversationItem[] = [];
  const errors: string[] = [];
  let fetched = 0;

  for (let page = 1; page <= 10; page++) {
    try {
      const url = `https://itunes.apple.com/${country}/rss/customerreviews/page=${page}/id=${appId}/sortBy=mostRecent/json`;
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; FeedReader/1.0)" } });
      if (!res.ok) {
        if (res.status === 404 && page === 1) errors.push(`App Store: app ${appId} not found (404)`);
        break;
      }

      const data = await res.json() as AppStoreFeed;
      const entries = data.feed?.entry ?? [];
      if (entries.length === 0) break;
      fetched += entries.length;

      for (const e of entries) {
        const reviewId = e.id?.label ?? "";
        const title = e.title?.label ?? "(no title)";
        const body = e.content?.label ?? "";
        const rating = parseInt(e["im:rating"]?.label ?? "0", 10) || 0;
        const author = e.author?.name?.label ?? "anonymous";
        const updatedStr = e.updated?.label;
        const receivedAt = updatedStr ? new Date(updatedStr) : new Date();

        if (afterUtc && receivedAt.getTime() / 1000 < afterUtc) continue;
        if (!reviewId) continue;

        const externalId = `appstore:${appId}:${reviewId}`;
        items.push({
          externalId,
          customerLabel: author,
          subject: title,
          preview: body.slice(0, 150),
          receivedAt,
          tags: ["app_reviews", "store:app_store", `rating:${rating}`],
          messages: [{
            externalId: `${externalId}:review`,
            direction: "inbound",
            authorLabel: author,
            body: body || title,
            createdAt: receivedAt,
          }],
        });
      }

      // RSS returns pages newest-first; once we hit old entries, stop paginating.
      const lastEntry = entries[entries.length - 1];
      const lastUpdated = lastEntry?.updated?.label ? new Date(lastEntry.updated.label).getTime() / 1000 : 0;
      if (lastUpdated && afterUtc && lastUpdated < afterUtc) break;
    } catch (err) {
      errors.push(`App Store page ${page}: ${err instanceof Error ? err.message : String(err)}`);
      break;
    }
  }

  return { items, fetched, errors };
}

// ─── Google Play (AndroidPublisher API — service account required) ──────────

async function fetchPlayStoreReviews(
  packageName: string,
  serviceAccountJson: string,
  afterUtc: number,
): Promise<{ items: RawConversationItem[]; fetched: number; errors: string[] }> {
  const items: RawConversationItem[] = [];
  const errors: string[] = [];
  let fetched = 0;

  try {
    const credentials = JSON.parse(serviceAccountJson) as Record<string, unknown>;
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/androidpublisher"],
    });
    const authClient = await auth.getClient();
    const publisher = google.androidpublisher({ version: "v3", auth: authClient as Parameters<typeof google.androidpublisher>[0]["auth"] });

    let token: string | undefined;
    do {
      const res = await publisher.reviews.list({
        packageName,
        maxResults: 100,
        token,
        translationLanguage: "en",
      });

      const reviews = res.data.reviews ?? [];
      fetched += reviews.length;

      for (const r of reviews) {
        const reviewId = r.reviewId ?? "";
        const author = r.authorName ?? "anonymous";
        const comment = r.comments?.[0]?.userComment;
        if (!comment) continue;

        const body = comment.text ?? "";
        const rating = comment.starRating ?? 0;
        const lastModSecs = comment.lastModified?.seconds;
        const receivedAt = lastModSecs ? new Date(parseInt(String(lastModSecs)) * 1000) : new Date();

        if (afterUtc && receivedAt.getTime() / 1000 < afterUtc) continue;
        if (!reviewId) continue;

        const externalId = `playstore:${packageName}:${reviewId}`;
        items.push({
          externalId,
          customerLabel: author,
          subject: body.slice(0, 60) || `${rating}-star review`,
          preview: body.slice(0, 150),
          receivedAt,
          tags: ["app_reviews", "store:play_store", `rating:${rating}`],
          messages: [{
            externalId: `${externalId}:review`,
            direction: "inbound",
            authorLabel: author,
            body: body || `${rating}-star review`,
            createdAt: receivedAt,
          }],
        });
      }

      token = res.data.tokenPagination?.nextPageToken ?? undefined;
      if (!token) break;

      // Stop paginating once we've passed the lookback window.
      const lastReview = reviews[reviews.length - 1];
      const lastSecs = lastReview?.comments?.[0]?.userComment?.lastModified?.seconds;
      if (lastSecs && afterUtc && parseInt(String(lastSecs)) < afterUtc) break;
    } while (token);
  } catch (err) {
    errors.push(`Play Store: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { items, fetched, errors };
}

// ─── Adapter ────────────────────────────────────────────────────────────────

export const appReviewsAdapter: ChannelAdapter = {
  key: "APP_REVIEWS",

  async fetchItems(ctx): Promise<ChannelFetchResult> {
    const config = ctx.connection.scraperConfig as AppReviewsConfig | null;
    const appId = config?.appId?.trim();
    const store = config?.store ?? "app_store";

    if (!appId) {
      return { items: [], diagnostics: { fetched: 0, filterReasons: {}, hints: [], errors: ["No App ID configured"] } };
    }

    const afterUtc = ctx.connection.lastSyncedAt
      ? Math.floor((ctx.connection.lastSyncedAt.getTime() - 5 * 60 * 1000) / 1000)
      : lookbackSeconds(config?.lookbackDays, 90);

    if (store === "app_store") {
      const country = config?.country?.trim() || "us";
      const { items, fetched, errors } = await fetchAppStoreReviews(appId, country, afterUtc);
      return { items, diagnostics: { fetched, filterReasons: {}, hints: [], errors } };
    }

    if (store === "play_store") {
      const svcJson = config?.serviceAccountJson?.trim();
      if (!svcJson) {
        return { items: [], diagnostics: { fetched: 0, filterReasons: {}, hints: [], errors: ["Play Store requires a service account JSON — paste it in the connector settings"] } };
      }
      const { items, fetched, errors } = await fetchPlayStoreReviews(appId, svcJson, afterUtc);
      return { items, diagnostics: { fetched, filterReasons: {}, hints: [], errors } };
    }

    return { items: [], diagnostics: { fetched: 0, filterReasons: {}, hints: [], errors: [`Unknown store: ${String(store)}`] } };
  },
};
