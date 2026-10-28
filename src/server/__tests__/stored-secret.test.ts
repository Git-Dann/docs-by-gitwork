import { execSync } from "node:child_process";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isEncryptedSecret, readSecret, storeSecret } from "@/server/stored-secret";

const TEST_KEY = Buffer.alloc(32, 7).toString("base64");
let savedKey: string | undefined;

beforeEach(() => {
  savedKey = process.env.ENCRYPTION_KEY;
  process.env.ENCRYPTION_KEY = TEST_KEY;
});
afterEach(() => {
  if (savedKey === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = savedKey;
});

describe("stored secrets", () => {
  it("round-trips, and what is stored is not the secret", () => {
    const stored = storeSecret("sk-ant-real-key");
    expect(stored).not.toContain("sk-ant-real-key");
    expect(isEncryptedSecret(stored)).toBe(true);
    expect(readSecret(stored)).toBe("sk-ant-real-key");
  });

  it("reads a legacy plain value unchanged, so nothing breaks the day this ships", () => {
    expect(readSecret("sk-ant-legacy")).toBe("sk-ant-legacy");
    expect(readSecret(null)).toBeNull();
    expect(readSecret("")).toBeNull();
  });

  it("does not mistake a Google service-account file for a cipher envelope", () => {
    // Plain JSON that starts with "{" — the case the SMTP helper's check would misread.
    const serviceAccount = JSON.stringify({ type: "service_account", project_id: "x", private_key: "-----BEGIN" });
    expect(isEncryptedSecret(serviceAccount)).toBe(false);
    expect(readSecret(serviceAccount)).toBe(serviceAccount);
    expect(readSecret(storeSecret(serviceAccount))).toBe(serviceAccount);
  });

  it("an envelope that cannot be decrypted reads as not set, never as the envelope", () => {
    const stored = storeSecret("sk-real");
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    // encryption.ts caches its key; a fresh module would see the new one. The tampered
    // envelope below fails the GCM tag check either way.
    const env = JSON.parse(stored) as { ct: string };
    const tampered = stored.replace(env.ct, Buffer.from("tampered").toString("base64"));
    expect(readSecret(tampered)).toBeNull();
  });
});

describe("stored secrets are only ever read through readSecret", () => {
  /**
   * Every remaining mention of a secret column outside readSecret/storeSecret. Each is a
   * presence check (is something set?) or a label, which an encrypted value answers the
   * same way as a plain one. A NEW line here is most likely a value being used as a key
   * without decrypting it — the exact defect this guards against. If it is genuinely a
   * presence check, add it to the list.
   */
  const ALLOWED = [
    "src/server/support-channels/gmail.ts:  if (!workspace.googleServiceAccountJson) {",
    'src/server/support-channels/gmail.ts:  if (!workspace?.googleServiceAccountJson) throw new Error("Google service account not configured");',
    "src/server/email.ts:    if (!ws?.emailProvider && !ws?.emailApiKey) {",
    "src/server/support-reply.ts:  if (!ws?.googleServiceAccountJson) {",
    "src/server/ai-provider.ts:  // Default: ANTHROPIC (Claude 3.5 Sonnet / Claude Sonnet) using workspace.anthropicApiKey",
    'src/app/api/settings/integrations/route.ts:      externalApiKeySource: process.env.API_KEY ? "env" : workspace?.externalApiKey ? "database" : null,',
    "src/app/api/settings/integrations/route.ts:      googleServiceAccountJsonSet: Boolean(workspace?.googleServiceAccountJson),",
    'src/app/api/settings/integrations/route.ts:          target: "workspace.anthropicApiKey",',
    'src/app/api/settings/integrations/route.ts:          target: "workspace.openaiApiKey",',
    'src/app/api/settings/integrations/route.ts:          target: "workspace.geminiApiKey",',
    'src/app/api/settings/integrations/route.ts:          target: "workspace.externalApiKey",',
    "src/app/api/integrations/meeting-summary/route.ts:    const hasServiceAccount = !!(workspace.googleServiceAccountJson && workspace.googleSubjectEmail);",
    'src/app/api/documents/[id]/ai/chat/route.ts:    if (!ws || (ws.aiProvider ?? "ANTHROPIC") !== "ANTHROPIC" || !ws.anthropicApiKey) {',
  ];

  it("sweep", () => {
    const root = join(__dirname, "../../..");
    const out = execSync(
      "grep -rnE '\\.(anthropicApiKey|openaiApiKey|geminiApiKey|emailApiKey|externalApiKey|googleServiceAccountJson|anthropicAdminApiKey|openaiAdminApiKey)\\b' src --include=*.ts --include=*.tsx || true",
      { cwd: root, encoding: "utf8" },
    );
    const lines = out
      .split("\n")
      .filter(Boolean)
      .filter((l) => !l.includes("/__tests__/"))
      .filter((l) => !/readSecret\(|storeSecret\(/.test(l))
      // Request bodies and client-side Settings state are the plaintext the user typed.
      .filter((l) => !/\b(body|config\?|integrations\?|payload)\./.test(l))
      .map((l) => l.replace(/^([^:]+):\d+:/, "$1:"));
    expect(lines.length, "the sweep found nothing at all — is the grep broken?").toBeGreaterThan(0);
    const unexpected = lines.filter((l) => !ALLOWED.includes(l));
    expect(unexpected, `read these through readSecret:\n${unexpected.join("\n")}`).toEqual([]);
  });
});
