// Re-export the care-agents orchestrator as the canonical entry point.
// The support-sync adapters are now pure fetchers used by care-agents internally.
export { buildAgentContext as buildSyncContext, runCareAgents as syncConnection } from "@/server/care-agents/orchestrator";
export type { AgentRunResult as SyncResult } from "@/server/care-agents/types";
