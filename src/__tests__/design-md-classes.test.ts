import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * DESIGN.md must not name a CSS class that does not exist.
 *
 * This is the DOC direction of the guard. `audit:ui`'s UNDEFINED-CLASS rule covers the CODE
 * direction — a class you *use* must be defined. Neither existed until July 2026, and the gap
 * cost a shipped defect: DESIGN.md documented `button-primary`, `button-secondary`,
 * `button-ghost` and `button-danger`, none of which were ever implemented (the real API is
 * `app-button` + variant + size). Every button in the Provenance register rendered with no
 * background, no border, no padding, and icons stacked above their labels — because the
 * missing base class is what supplies `inline-flex`.
 *
 * Six more fictional specs were found in the same audit: all five `badge-*` classes,
 * `widget-progress-bar` (really `widget-progress`), `footer-region`, `status-dot` (really
 * `widget-status-dot`) and `text-input` (really `app-input`). A stale comment in
 * `devsignal-ui.tsx` proved another build had hit the same trap and quietly worked around it.
 *
 * Scope: only `app-*` and `widget-*` names are checked, because DESIGN.md deliberately uses
 * the same bold-backtick notation for PATTERN names (`task-card`, `gantt-chart`,
 * `cta-banner-blue`, `my-day` …) which are shapes to build, not classes to type. That
 * ambiguity was the root cause, and the notation rule at the top of DESIGN.md's Components
 * section now states it — this test enforces the half a reader can get wrong silently.
 */

const ROOT = join(__dirname, "..", "..");

function walk(dir: string, exts: string[], out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, exts, out);
    else if (exts.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}

/**
 * Every class our own CSS defines — `globals.css` plus the inline `<style>` blocks the
 * standalone public pages carry. Over-collects on purpose: this test must never fail on a
 * class that really is styled somewhere, only on one that exists nowhere.
 */
function definedClasses(): Set<string> {
  const found = new Set<string>();
  const re = /\.(-?[_a-zA-Z][\w-]*)/g;
  for (const full of walk(join(ROOT, "src"), [".css", ".tsx", ".ts"])) {
    const src = readFileSync(full, "utf8");
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) found.add(m[1]);
  }
  return found;
}

/**
 * Names DESIGN.md mentions *precisely because they do not exist* — a warning about a stale
 * spec, or a proposal. Each needs a reason, so adding a fourth is a decision rather than a
 * way to silence the test. Same per-key-justification pattern as the native-mobile
 * inapplicable list (CLAUDE.md §34.1).
 *
 * ⚠️ If you implement one of these in globals.css, DELETE its row — leaving it here would
 * exempt a real class from the check forever.
 */
const DELIBERATELY_ABSENT: Record<string, string> = {
  "app-badge": "A proposal, not a spec: the Badges section notes that an app-badge pair WOULD make badges checkable. Nothing implements it yet.",
  "widget-progress-bar": "Named only inside the warning that it is the wrong name; the real class is widget-progress.",
  "widget-ring": "DESIGN.md has always said activity rings are 'not yet implemented as a reusable component'. Honest already.",
};

describe("DESIGN.md does not document classes that do not exist", () => {
  const design = readFileSync(join(ROOT, "DESIGN.md"), "utf8");
  const defined = definedClasses();

  it("every app-* / widget-* class it names is defined in CSS", () => {
    // Both notations DESIGN.md uses to name a class: **`x`** for a component spec heading,
    // and plain `x` in prose.
    const named = new Set<string>();
    for (const re of [/\*\*`([\w-]+)`\*\*/g, /`([\w-]+)`/g]) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(design))) named.add(m[1]);
    }

    const ours = [...named].filter((c) => /^(app|widget)-[a-z0-9-]+$/.test(c));
    // Modifier fragments like `-icon-md` are written as suffixes in the size table; the
    // prefixed form is what a reader types, and that is what is checked.
    const missing = ours
      .filter((c) => !defined.has(c))
      .filter((c) => !(c in DELIBERATELY_ABSENT))
      .sort();

    expect(
      missing,
      `DESIGN.md names ${missing.length} app-*/widget-* class(es) that no CSS defines. ` +
        `Either implement them in globals.css or correct the doc — do NOT delete this ` +
        `assertion. A spec naming a class that does not exist produces UI with no styling ` +
        `at all, and nothing else in the toolchain can see it.`,
    ).toEqual([]);
  });

  it("the deliberately-absent allowlist has not rotted", () => {
    // If one of these gets implemented, its row must go — otherwise a real class is exempt
    // from the check forever, which is how the original drift went unnoticed.
    const nowDefined = Object.keys(DELIBERATELY_ABSENT).filter((c) => defined.has(c));
    expect(
      nowDefined,
      `These are now defined in CSS, so remove them from DELIBERATELY_ABSENT: ${nowDefined.join(", ")}`,
    ).toEqual([]);
  });

  it("still states the notation rule that distinguishes classes from pattern names", () => {
    // The rule is the root-cause fix; losing it re-arms the original trap even if every
    // class name in the file happens to be correct on that day.
    expect(design).toMatch(/notation/i);
    expect(design).toMatch(/pattern/i);
    expect(design).toContain("app-button app-button-");
  });
});
