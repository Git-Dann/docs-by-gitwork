import type { AccountConnection, ChannelToken } from "@prisma/client";

export interface SyncResult {
  created: number;
  skipped: number;
  errors: string[];
}

export interface SyncContext {
  connection: AccountConnection & { channelTokens: ChannelToken[] };
  client: { id: string; name: string; slug: string };
  workspace: {
    googleServiceAccountJson?: string | null;
    googleSubjectEmail?: string | null;
  };
}
