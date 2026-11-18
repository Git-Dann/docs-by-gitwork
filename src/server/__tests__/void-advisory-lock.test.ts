import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * pg_advisory_lock / pg_advisory_xact_lock return `void`. Prisma's $queryRaw has to deserialize
 * every column it gets back and can't read `void`, so the call throws ("Failed to deserialize
 * column of type 'void'") on every run. Use $executeRaw for these (or the pg_try_ variants, which
 * return a boolean). Found in production (Nov 2026): every Forge image copy failed this way while
 * unit tests, which mock Prisma, passed.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "node_modules" && name !== "__tests__") walk(p, out);
    } else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe("void-returning advisory locks are never read back", () => {
  it("never runs pg_advisory_lock or pg_advisory_xact_lock through $queryRaw", () => {
    const offenders = walk(join(process.cwd(), "src")).filter((f) =>
      /\$queryRaw(?:Unsafe)?\s*(?:<[^>]*>)?\s*\(?\s*`\s*SELECT\s+pg_advisory_(?:xact_)?lock\s*\(/i.test(readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
