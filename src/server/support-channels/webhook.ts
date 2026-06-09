import type { ChannelAdapter, SyncResult, SyncContext } from "./types";

// Webhook connections are push-only: external systems POST to
// /api/support/webhook/[token]. The cron sync is intentionally a no-op —
// there's nothing to poll.

export const webhookAdapter: ChannelAdapter = {
  key: "WEBHOOK",

  async run(_ctx: SyncContext): Promise<SyncResult> {
    return { ingested: 0, filtered: 0, errors: [] };
  },
};
