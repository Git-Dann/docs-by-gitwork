/**
 * Shapes the Platform console (/app/platform) reads. Framework-free so the client
 * component, the server module and the demo data all share them.
 */

export interface PlatformWorkspace {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  /** When its settings last changed. Sent back with a save so a stale draft is refused. */
  updatedAt: string;
  /** Gitwork's own workspace — the one the platform runs as. Changes to it need confirming. */
  isHome: boolean;
  activeMembers: number;
  modulesRestricted: boolean;
  enabledModules: string[];
  platformAiKeysAllowed: boolean;
}

export interface PlatformAuditItem {
  id: string;
  action: string;
  workspaceName: string;
  actorName: string;
  createdAt: string;
  before: unknown;
  after: unknown;
}

export interface PlatformWorkspaceUpdate {
  modulesRestricted?: boolean;
  enabledModules?: string[];
  platformAiKeysAllowed?: boolean;
  /** Required to change Gitwork's own workspace, which every Gitwork user works in. */
  confirmHome?: boolean;
  /** The business's updatedAt when the draft was opened. A newer one means someone else saved. */
  expectedUpdatedAt?: string;
}

/** One page of businesses, and how many match in total. */
export interface PlatformWorkspacePage {
  workspaces: PlatformWorkspace[];
  total: number;
  page: number;
  pageSize: number;
}

/** One page of platform activity. */
export interface PlatformAuditPage {
  entries: PlatformAuditItem[];
  total: number;
  page: number;
  pageSize: number;
}
