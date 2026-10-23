import { join } from "node:path";
import type Parser from "web-tree-sitter";
import { LANGUAGE_RULES } from "./languages";
import type { CodeLanguage } from "@/types/code-health";

/**
 * tree-sitter, compiled to WebAssembly: a real parser for every supported language, with
 * no native build step (the production image is Alpine, where native addons are fragile).
 *
 * ⚠️ Pinned on purpose: web-tree-sitter 0.20.8 with tree-sitter-wasms 0.1.13. The grammar
 * files are built for parser ABI 13–14; newer web-tree-sitter releases crashed loading
 * some of them, and this pair was checked grammar by grammar (languages.ts). Bump them
 * together, and re-run the code-health tests against real repositories when you do.
 *
 * Both packages are server-only and resolved from node_modules at runtime
 * (serverExternalPackages in next.config.ts); the .wasm files are read by path, which the
 * build tracer cannot see, so they are listed in outputFileTracingIncludes.
 */

// Resolved by path from the app root rather than through require.resolve: the bundler
// cannot analyse a computed createRequire and warns on it. The root is the repo in dev
// and tests, and /app (the standalone output) in production; both have node_modules.
const modules = () => join(process.cwd(), "node_modules");

let ready: Promise<typeof Parser> | null = null;
const languages = new Map<CodeLanguage, Promise<Parser.Language>>();

function runtime(): Promise<typeof Parser> {
  if (!ready) {
    ready = (async () => {
      const mod = (await import("web-tree-sitter")) as unknown as { default?: typeof Parser } & typeof Parser;
      const P = (mod.default ?? mod) as typeof Parser;
      const wasmDir = join(modules(), "web-tree-sitter");
      await P.init({ locateFile: (file: string) => join(wasmDir, file) });
      return P;
    })().catch((e) => {
      ready = null; // let a later scan retry rather than caching the failure forever
      throw e;
    });
  }
  return ready;
}

async function language(lang: CodeLanguage): Promise<Parser.Language> {
  let l = languages.get(lang);
  if (!l) {
    l = (async () => {
      const P = await runtime();
      const dir = join(modules(), "tree-sitter-wasms", "out");
      return P.Language.load(join(dir, `tree-sitter-${LANGUAGE_RULES[lang].grammar}.wasm`));
    })();
    languages.set(lang, l);
    l.catch(() => languages.delete(lang));
  }
  return l;
}

/** Parse budget per file. A pathological file is skipped, not allowed to stall the scan. */
const PARSE_TIMEOUT_MICROS = 2_000_000;

/** A parser for one language. Callers should `delete()` trees when done with them. */
export async function parserFor(lang: CodeLanguage): Promise<Parser> {
  const P = await runtime();
  const p = new P();
  p.setLanguage(await language(lang));
  p.setTimeoutMicros(PARSE_TIMEOUT_MICROS);
  return p;
}
