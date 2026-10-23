import { join } from "node:path";
import type { Language as TSLanguage, Parser as TSParser } from "web-tree-sitter";
import { LANGUAGE_RULES } from "./languages";
import type { CodeLanguage } from "@/types/code-health";

/**
 * tree-sitter, compiled to WebAssembly: a real parser for every supported language, with
 * no native build step (the production image is Alpine, where native addons are fragile).
 *
 * ⚠️ Pinned on purpose: web-tree-sitter 0.25.10 with tree-sitter-wasms 0.1.13, checked
 * grammar by grammar. 0.20.8 could not load Dart (built for parser ABI 15) or Ruby, and
 * 0.22.6 crashed on Dart; 0.25.10 loads all eleven. Bump them together, and re-run
 * __tests__/measure.test.ts (real parses) when you do.
 *
 * Both packages are server-only and resolved from node_modules at runtime
 * (serverExternalPackages in next.config.ts); the .wasm files are read by path, which the
 * build tracer cannot see, so they are listed in outputFileTracingIncludes.
 */

// Resolved by path from the app root rather than through require.resolve: the bundler
// cannot analyse a computed createRequire and warns on it. The root is the repo in dev
// and tests, and /app (the standalone output) in production; both have node_modules.
const modules = () => join(process.cwd(), "node_modules");

type Runtime = typeof import("web-tree-sitter");
let ready: Promise<Runtime> | null = null;
const languages = new Map<CodeLanguage, Promise<TSLanguage>>();

function runtime(): Promise<Runtime> {
  if (!ready) {
    ready = (async () => {
      const mod = await import("web-tree-sitter");
      const wasmDir = join(modules(), "web-tree-sitter");
      await mod.Parser.init({ locateFile: (file: string) => join(wasmDir, file) });
      return mod;
    })().catch((e) => {
      ready = null; // let a later scan retry rather than caching the failure forever
      throw e;
    });
  }
  return ready;
}

async function language(lang: CodeLanguage): Promise<TSLanguage> {
  let l = languages.get(lang);
  if (!l) {
    l = (async () => {
      const { Language } = await runtime();
      const dir = join(modules(), "tree-sitter-wasms", "out");
      return Language.load(join(dir, `tree-sitter-${LANGUAGE_RULES[lang].grammar}.wasm`));
    })();
    languages.set(lang, l);
    l.catch(() => languages.delete(lang));
  }
  return l;
}

/** Parse budget per file. A pathological file is skipped, not allowed to stall the scan. */
const PARSE_BUDGET_MS = 2_000;

/** A parser for one language. Callers should `delete()` trees when done with them. */
export async function parserFor(lang: CodeLanguage): Promise<TSParser> {
  const { Parser } = await runtime();
  const p = new Parser();
  p.setLanguage(await language(lang));
  return p;
}

/**
 * Parse with a time budget. Returns null when the budget runs out. 0.25 deprecated
 * `setTimeoutMicros` (and it throws there); a progress callback that returns true cancels
 * the parse instead. The typings declare it void, hence the cast.
 */
export function parseWithBudget(parser: TSParser, source: string) {
  const deadline = Date.now() + PARSE_BUDGET_MS;
  const progressCallback = (() => Date.now() > deadline) as unknown as () => void;
  return parser.parse(source, null, { progressCallback });
}
