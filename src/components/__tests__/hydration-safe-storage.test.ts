import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * `useState(readSomethingFromLocalStorage)` is React error #418.
 *
 * The reader returns a fallback on the server and the stored value in the
 * browser, so the server-rendered tree and the client's first render disagree.
 * React does not patch that up — it discards the whole server tree and
 * re-renders on the client, and logs #418. It was firing on /app/backstage for
 * anyone who had ever touched the calendar filters.
 *
 * The rule is the one `backstage-workspace.tsx` records for `useSearchParams`:
 * render the SAME thing on both sides, then adopt the stored value after mount.
 *
 * ⚠️ This sweeps SOURCE rather than behaviour, because the defect only shows up
 * when a real browser hydrates a real server render — which `/app` cannot do in
 * a test, being auth-gated with no staging.
 */
/**
 * Cases that read storage in an initialiser and are SOUND — each with the reason,
 * because "it was already like that" is not one. Both were found by this sweep
 * and checked individually; a new entry has to earn its line here.
 */
const ALLOWED: Record<string, string> = {
  // Renders `{children}` and nothing else — `mode`/`resolved` go into context,
  // never into markup this component emits, so the two trees cannot disagree.
  // And `layout.tsx` runs a BLOCKING inline script that stamps `data-theme`
  // before hydration; making this SSR-default would reintroduce the
  // system→stored flash that script exists to prevent.
  "src/components/providers/theme-provider.tsx → readStoredMode":
    "context-only; the anti-flash script in layout.tsx owns the first paint",
  // `<Modal open={open}>` returns null while closed and this modal is always
  // mounted closed (team-card.tsx), so the server emits no markup for it. The
  // stored channel is only ever read into a field the user opens after
  // hydration.
  "src/components/backstage/absences-modal.tsx → readLastChannel":
    "renders nothing until opened, which is always after hydration",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== "__tests__" && entry !== "node_modules") walk(full, out);
    } else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Functions in this file whose body reads browser-only storage. */
function storageReaders(src: string): string[] {
  const names: string[] = [];
  const re = /function\s+(\w+)\s*(?:<[^>]*>)?\s*\([^)]*\)[^{]*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    // Take the body by brace-matching from the opening brace.
    let depth = 0;
    let i = re.lastIndex - 1;
    const start = i;
    for (; i < src.length; i += 1) {
      if (src[i] === "{") depth += 1;
      else if (src[i] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const body = src.slice(start, i);
    if (/localStorage|sessionStorage/.test(body)) names.push(m[1]);
  }
  return names;
}

describe("hydration — browser storage never seeds a useState initialiser", () => {
  const files = walk(join(process.cwd(), "src/components")).concat(
    walk(join(process.cwd(), "src/hooks")),
  );

  it("sweeps a meaningful number of files", () => {
    // A broken walk would report "0 offenders" and pass forever.
    expect(files.length).toBeGreaterThan(200);
  });

  it("no useState/useRef is initialised from a storage reader", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = stripComments(readFileSync(file, "utf8"));
      const readers = storageReaders(src);
      if (readers.length === 0) continue;
      for (const name of readers) {
        // `useState(readThing)` or `useState(() => readThing())` — both run the
        // reader during the server render.
        // ⚠️ The generic is matched with `[^;\n]*` and NOT `[^>]*`. The real call
        // site is `useState<Set<string>>(readHiddenCountries)` — a NESTED generic —
        // and `[^>]*` stops at the first `>`, so the pattern this whole test exists
        // to catch was the one thing it did not match. Caught by sabotage: reverting
        // the fix failed nothing.
        const GEN = "(?:<[^;\n]*>)?";
        const lazy = new RegExp(`use(?:State|Ref)\\s*${GEN}\\s*\\(\\s*${name}\\s*\\)`);
        const arrow = new RegExp(
          `use(?:State|Ref)\\s*${GEN}\\s*\\(\\s*\\(\\s*\\)\\s*=>\\s*${name}\\s*\\(`,
        );
        if (lazy.test(src) || arrow.test(src)) {
          const key = `${file.replace(process.cwd() + "/", "")} → ${name}`;
          if (!(key in ALLOWED)) offenders.push(key);
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("every allow-listed exemption still exists", () => {
    // An exemption for code that has since been deleted or renamed is a hole
    // that silently stops covering anything.
    for (const key of Object.keys(ALLOWED)) {
      const [file, name] = key.split(" \u2192 ");
      const src = stripComments(readFileSync(join(process.cwd(), file), "utf8"));
      expect(storageReaders(src), key).toContain(name);
    }
  });

  it("the detector actually finds storage readers (so a clean run means something)", () => {
    // Without this, a regex that matched nothing would report zero offenders and
    // look like a pass — the failure mode §45 keeps producing.
    const withReaders = files.filter((f) =>
      storageReaders(stripComments(readFileSync(f, "utf8"))).length > 0,
    );
    expect(withReaders.length).toBeGreaterThan(3);
  });
});
