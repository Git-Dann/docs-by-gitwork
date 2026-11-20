import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";

/**
 * `font-[var(--font-x)]` does not set a font family.
 *
 * Tailwind v4 reads the arbitrary value's shape to decide which property it belongs to, and a
 * bare `var(…)` is ambiguous, so it resolves to **`font-weight`** — the element then renders in
 * whatever family it inherited while the class, and usually the comment beside it, claim
 * otherwise. `care-panel.tsx` documents the trap because every "editorial" figure in Care had
 * been rendering in Inter.
 *
 * It was still live in two Docs files in Nov 2026 (`proposal-section-preview.tsx`,
 * `lib/sections/_shared.tsx`), both writing `font-[var(--font-mono),'JetBrains_Mono',monospace]`
 * for a label that therefore was not monospaced on any document preview.
 *
 * The fix is almost never the `family-name:` hint: `--font-sans` / `--font-display` /
 * `--font-mono` are `@theme` tokens, so Tailwind already generates `font-sans` / `font-display` /
 * `font-mono`, and those carry the full fallback chain. Reach for `font-[family-name:…]` only for
 * a family with no token.
 */
describe("no class claims a font family it does not set", () => {
  it("nothing writes font-[var(--font-…)] outside a comment", () => {
    // `git grep -n` so the test reports the exact offending lines, and sees only tracked files.
    let hits: string[] = [];
    try {
      /*
       * ⚠️ Source only. The rule is about a CLASS NAME, which exists in .ts/.tsx and nowhere
       * else — and CLAUDE.md and `docs/` legitimately discuss the trap in prose, so sweeping
       * Markdown made the guard fail the moment §42.16 described the bug it guards against.
       */
      hits = execFileSync("git", ["grep", "-n", "font-\\[var(--font", "--", "*.ts", "*.tsx"], { encoding: "utf8" })
        .split("\n")
        .filter(Boolean);
    } catch {
      hits = []; // git grep exits 1 when there is no match, which is the passing case
    }

    const offenders = hits.filter((line) => {
      const [file, , ...rest] = line.split(":");
      const code = rest.join(":").trimStart();
      /*
       * ⚠️ This file names the pattern it forbids, in its own test name and its own failure
       * message, so it matches itself — which it duly did the moment it was committed, because
       * `git grep` only searches TRACKED files and it had been untracked when first run. Same
       * licence as `care-panel.tsx:55`, which documents the trap in prose: the places that
       * explain the bug are allowed to quote it, and nowhere else is.
       */
      if (file === "src/__tests__/tailwind-font-family.test.ts") return false;
      return !code.startsWith("*") && !code.startsWith("//") && !code.startsWith("/*");
    });

    expect(
      offenders,
      `font-[var(--font-…)] compiles to font-weight, not a family. Use the token utility ` +
        `(font-mono / font-sans / font-display):\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("the sweep can actually see the repo", () => {
    // Without this, a broken grep invocation reports "0 offenders" and passes for ever.
    const quoted = execFileSync("git", ["grep", "-c", "font-\\[family-name:"], { encoding: "utf8" });
    expect(quoted.trim().length).toBeGreaterThan(0);
  });
});
