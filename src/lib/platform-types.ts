/**
 * Shapes the Platform console (/app/platform) reads. Framework-free so the client
 * component, the server module and the demo data all share them.
 */

export interface PlatformWorkspace {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
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
}
