/**
 * Which AI key a call uses — the workspace's own, or the server's.
 *
 * Before the multi-tenant work, about fourteen call sites each read
 * `process.env.X_API_KEY` beside the workspace's stored key, and they did not agree
 * on the order: most put the SERVER key first (so a workspace's own OpenAI key was
 * silently ignored whenever the server had one), a few put the workspace first. With
 * one business on the platform that was untidy. With several it means a customer's AI
 * calls are billed to Gitwork's account.
 *
 * So every call site now asks here, and keeps the order it had (`prefer`), which is
 * what guarantees Gitwork sees no change. The new rule is the switch: a workspace with
 * `platformAiKeysAllowed: false` (every new business) only ever gets its own key, and
 * no key means AI is off for it — never a quiet fall back onto ours.
 * See docs/multi-tenant-roadmap.md, Phase 0.
 */

import { readSecret } from "@/server/stored-secret";

export type KeyedAiProvider = "ANTHROPIC" | "OPENAI" | "GEMINI" | "GROQ";

export interface WorkspaceAiKeys {
  // Optional so a query that only needs one provider's key can select just that one.
  anthropicApiKey?: string | null;
  openaiApiKey?: string | null;
  geminiApiKey?: string | null;
  /** Required, not optional: a narrowed `select` that forgot it must fail to compile. */
  platformAiKeysAllowed: boolean;
}

const ENV_VAR: Record<KeyedAiProvider, string> = {
  ANTHROPIC: "ANTHROPIC_API_KEY",
  OPENAI: "OPENAI_API_KEY",
  GEMINI: "GEMINI_API_KEY",
  GROQ: "GROQ_API_KEY",
};

/** Blank and whitespace keys are no key: a saved empty field must not shadow a real one. */
function present(key: string | null | undefined): string | null {
  return key && key.trim() ? key : null;
}

function ownKey(provider: KeyedAiProvider, ws: WorkspaceAiKeys): string | null {
  switch (provider) {
    case "ANTHROPIC":
      return present(readSecret(ws.anthropicApiKey));
    case "GEMINI":
      return present(readSecret(ws.geminiApiKey));
    // Groq is OpenAI-compatible and has always reused the OpenAI key field.
    case "OPENAI":
    case "GROQ":
      return present(readSecret(ws.openaiApiKey));
  }
}

function platformKey(provider: KeyedAiProvider): string | null {
  return present(process.env[ENV_VAR[provider]]);
}

/**
 * The key to call `provider` with, or null when there is none.
 *
 * `prefer` records which key the call site preferred before this module existed, so a
 * workspace allowed platform keys behaves exactly as it did. `ws` may be null where a
 * route found no workspace row: that is a pre-existing single-tenant case, and it keeps
 * its old behaviour (the server key).
 */
export function aiKeyFor(
  provider: KeyedAiProvider,
  ws: WorkspaceAiKeys | null | undefined,
  prefer: "env" | "workspace",
): string | null {
  if (!ws) return platformKey(provider);
  const own = ownKey(provider, ws);
  if (!ws.platformAiKeysAllowed) return own;
  const platform = platformKey(provider);
  return prefer === "env" ? (platform ?? own) : (own ?? platform);
}

/** Where `aiKeyFor` takes the key from: for Settings, which shows the source. */
export function aiKeySource(
  provider: KeyedAiProvider,
  ws: WorkspaceAiKeys | null | undefined,
  prefer: "env" | "workspace",
): "env" | "database" | null {
  const platform = !ws || ws.platformAiKeysAllowed ? platformKey(provider) : null;
  const own = ws ? ownKey(provider, ws) : null;
  const order: Array<[string | null, "env" | "database"]> =
    prefer === "env" ? [[platform, "env"], [own, "database"]] : [[own, "database"], [platform, "env"]];
  return order.find(([key]) => key)?.[1] ?? null;
}

/** Can this workspace use the server's keys at all? (Settings explains it either way.) */
export function usesPlatformAiKeys(ws: WorkspaceAiKeys | null | undefined): boolean {
  return !ws || ws.platformAiKeysAllowed;
}
