export const DEFAULT_PROOF_SERVER_URL = "http://127.0.0.1:4100";
export const DEFAULT_PROOF_START_COMMAND = "npm run proof:setup && npm run proof:run";

export interface ProofHealthResponse {
  ok: true;
  service: "proof";
  baseUrl: string;
  buildInfo?: {
    sha?: string | null;
    env?: string;
    generatedAt?: string | null;
  } | null;
  collab?: Record<string, unknown> | null;
}

export interface ProofCreateDocumentInput {
  title: string;
  markdown?: string;
  proposalId?: string | null;
}

export interface ProofDocumentRecord {
  id: string;
  workspaceId: string;
  ownerId: string;
  proposalId?: string | null;
  proposalTitle?: string | null;
  slug: string;
  title: string;
  markdown?: string | null;
  shareUrl: string;
  tokenUrl: string;
  accessToken: string;
  source: "proof";
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
  archivedAt?: string | null;
}

export interface ProofDocumentUpdateInput {
  proposalId?: string | null;
  touch?: boolean;
  archived?: boolean;
  title?: string;
  markdown?: string;
}

export function resolveProofServerUrl(): string {
  return normalizeUrl(process.env.PROOF_SERVER_URL || DEFAULT_PROOF_SERVER_URL);
}

export function normalizeUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function createProofStarterMarkdown(title: string): string {
  const safeTitle = title.trim() || "Untitled Proof Document";

  return `# ${safeTitle}\n\n## Context\n\nAdd the working brief, source material, or collaboration notes here.\n\n## Draft\n\nStart writing. Proof will track provenance, suggestions, and collaborative edits for this document.`;
}
