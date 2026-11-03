import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { aiKeyFor, aiKeySource } from "@/server/ai-keys";

const ENV_KEYS = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "GROQ_API_KEY"] as const;
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  process.env.ANTHROPIC_API_KEY = "server-anthropic";
  process.env.OPENAI_API_KEY = "server-openai";
  process.env.GEMINI_API_KEY = "server-gemini";
  process.env.GROQ_API_KEY = "server-groq";
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const own = { anthropicApiKey: "own-anthropic", openaiApiKey: "own-openai", geminiApiKey: "own-gemini" };

describe("aiKeyFor — a workspace allowed platform keys (Gitwork) behaves exactly as before", () => {
  const gitwork = { ...own, platformAiKeysAllowed: true };

  it("keeps each call site's old order", () => {
    expect(aiKeyFor("OPENAI", gitwork, "env")).toBe("server-openai");
    expect(aiKeyFor("GEMINI", gitwork, "env")).toBe("server-gemini");
    expect(aiKeyFor("ANTHROPIC", gitwork, "env")).toBe("server-anthropic");
    expect(aiKeyFor("ANTHROPIC", gitwork, "workspace")).toBe("own-anthropic");
    expect(aiKeyFor("GROQ", gitwork, "workspace")).toBe("own-openai");
  });

  it("falls back to whichever key exists", () => {
    const noOwn = { platformAiKeysAllowed: true, anthropicApiKey: null, openaiApiKey: null, geminiApiKey: null };
    expect(aiKeyFor("ANTHROPIC", noOwn, "workspace")).toBe("server-anthropic");
    delete process.env.OPENAI_API_KEY;
    expect(aiKeyFor("OPENAI", gitwork, "env")).toBe("own-openai");
  });

  it("a route that found no workspace row keeps the server key", () => {
    expect(aiKeyFor("ANTHROPIC", null, "workspace")).toBe("server-anthropic");
  });
});

describe("aiKeyFor — a business not allowed platform keys only spends its own", () => {
  const business = { ...own, platformAiKeysAllowed: false };

  it("uses its own key even where the call site prefers the server's", () => {
    expect(aiKeyFor("OPENAI", business, "env")).toBe("own-openai");
    expect(aiKeyFor("ANTHROPIC", business, "env")).toBe("own-anthropic");
  });

  it("with no key of its own gets null, never ours", () => {
    const empty = { platformAiKeysAllowed: false, anthropicApiKey: null, openaiApiKey: "  ", geminiApiKey: "" };
    for (const p of ["ANTHROPIC", "OPENAI", "GEMINI", "GROQ"] as const) {
      expect(aiKeyFor(p, empty, "env")).toBeNull();
      expect(aiKeyFor(p, empty, "workspace")).toBeNull();
    }
  });
});

describe("aiKeySource — what Settings shows", () => {
  it("names where the key really comes from", () => {
    expect(aiKeySource("OPENAI", { ...own, platformAiKeysAllowed: true }, "env")).toBe("env");
    expect(aiKeySource("OPENAI", { ...own, platformAiKeysAllowed: false }, "env")).toBe("database");
    expect(aiKeySource("OPENAI", { platformAiKeysAllowed: false, openaiApiKey: null }, "env")).toBeNull();
  });
});

describe("no AI key is read from the environment outside src/server/ai-keys.ts", () => {
  it("sweep", () => {
    const root = join(__dirname, "../../..");
    const out = execSync(
      "grep -rnE 'process\\.env\\.(ANTHROPIC|OPENAI|GEMINI|GROQ)_API_KEY' src --include=*.ts --include=*.tsx || true",
      { cwd: root, encoding: "utf8" },
    );
    const offenders = out
      .split("\n")
      .filter(Boolean)
      .filter((line) => !line.includes("/__tests__/"))
      .filter((line) => !line.startsWith("src/server/ai-keys.ts:"))
      // Prose inside a prompt-library entry, not a read.
      .filter((line) => !line.startsWith("src/server/starters-catalog.ts:"))
      // Picks the default PROVIDER when none is stored; reads no key.
      .filter((line) => !/^src\/server\/ai-provider\.ts:\d+:.*process\.env\.GROQ_API_KEY \? "GROQ"/.test(line));
    expect(offenders, `read the key through aiKeyFor instead:\n${offenders.join("\n")}`).toEqual([]);
    // A broken grep would report no offenders forever. It must at least see the known
    // allowed mention, and ai-keys.ts must still be the place the variables are named.
    expect(out).toContain("src/server/starters-catalog.ts");
    expect(readFileSync(join(root, "src/server/ai-keys.ts"), "utf8")).toContain('ANTHROPIC: "ANTHROPIC_API_KEY"');
  });
});
