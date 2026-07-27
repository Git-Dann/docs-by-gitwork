#!/usr/bin/env node
/**
 * audit-ui-standards.mjs — static gate for the field + layout standards in
 * `DESIGN.md` and `docs/mobile-playbook.md`.
 *
 * WHY THIS EXISTS ALONGSIDE `audit-clipping.mjs`
 * ----------------------------------------------
 * The clipping audit drives a real page in Chromium, which makes it the better
 * detector — but it can only see pages it can reach, and every `/app` page is
 * auth-gated with no staging environment (see `docs/mobile-playbook.md` §3a).
 * So the defects Dan keeps finding by hand — a value tucked under a select's
 * chevron, copy jammed against the top edge of a textarea, a fixed pixel width
 * that pushes a phone sideways — have no gate at all on the pages where most of
 * them live.
 *
 * This script reads the SOURCE instead, so it covers every screen including the
 * gated ones, and runs with no browser and no server. It is deliberately narrow:
 * every rule below is a defect that has actually shipped in this repo at least
 * once, and each one is written to fire only when the markup can't be correct.
 *
 * Usage:
 *   node scripts/audit-ui-standards.mjs            # audit src/**, exit 1 on any error
 *   npm run audit:ui
 *   npm run audit:ui -- --warn-only                # report, always exit 0
 *   npm run audit:ui -- --self-test                # prove each rule still fires
 *   npm run audit:ui -- --rule=SELECT-CHEVRON      # run one rule
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const WARN_ONLY = argv.includes("--warn-only");
const SELF_TEST = argv.includes("--self-test");
const ONLY_RULE = argv.find((a) => a.startsWith("--rule="))?.slice("--rule=".length) ?? null;

/* ── Tailwind spacing → px, for the padding rules ─────────────────────────── */

const STEP_PX = {
  "0": 0, px: 1, "0.5": 2, "1": 4, "1.5": 6, "2": 8, "2.5": 10, "3": 12,
  "3.5": 14, "4": 16, "5": 20, "6": 24, "7": 28, "8": 32, "9": 36, "10": 40,
  "11": 44, "12": 48, "14": 56, "16": 64, "20": 80, "24": 96,
};

/** Resolve a Tailwind spacing token (`3`, `2.5`, `px`, `[18px]`) to px, or null. */
function spacingPx(token) {
  if (token in STEP_PX) return STEP_PX[token];
  const arb = /^\[(\d+(?:\.\d+)?)(px|rem)]$/.exec(token);
  if (arb) return arb[2] === "rem" ? Number(arb[1]) * 16 : Number(arb[1]);
  return null;
}

/**
 * Largest padding applied on one edge by a class string. Checks the specific
 * edge, then the axis, then the all-sides shorthand — the same precedence
 * Tailwind resolves them in when they don't collide.
 */
function paddingPx(classes, edge) {
  const axis = edge === "l" || edge === "r" ? "x" : "y";
  for (const prefix of [`p${edge}`, `p${axis}`, "p"]) {
    // Only unprefixed utilities — a `sm:px-3` says nothing about the base width.
    const re = new RegExp(`(?:^|\\s)${prefix}-(\\[[^\\]]+]|[\\d.]+|px)(?=\\s|$)`, "g");
    let best = null;
    let m;
    while ((m = re.exec(classes))) {
      const px = spacingPx(m[1]);
      if (px !== null && (best === null || px > best)) best = px;
    }
    if (best !== null) return best;
  }
  return null;
}

/* ── JSX scanning ─────────────────────────────────────────────────────────── */

/**
 * Blank out comments, preserving offsets so reported line numbers stay true.
 * Without this a prose mention of `<select>` in a comment reads as markup — the
 * comment in pulse-new-scan-form.tsx explaining why it avoids a native select
 * was the first thing this audit "found".
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:\\])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(m.length - p1.length));
}

/**
 * Every opening tag for `name`, spanning newlines. Walks forward from the tag
 * name balancing braces and quotes so a `>` inside an arrow function or a
 * string doesn't end the tag early.
 */
function openingTags(src, name) {
  const out = [];
  const re = new RegExp(`<${name}(?=[\\s/>])`, "g");
  let m;
  while ((m = re.exec(src))) {
    let i = m.index + name.length + 1;
    let depth = 0;
    let quote = null;
    while (i < src.length) {
      const c = src[i];
      if (quote) {
        if (c === quote && src[i - 1] !== "\\") quote = null;
      } else if (c === '"' || c === "'" || c === "`") {
        quote = c;
      } else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
      i++;
    }
    out.push({ index: m.index, text: src.slice(m.index, i + 1) });
  }
  return out;
}

/** File-level `const NAME = "…"` / `= \`…\`` string constants, for className indirection. */
function localStringConsts(src) {
  const map = new Map();
  const re = /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*([^;]+);/g;
  let m;
  while ((m = re.exec(src))) {
    const literals = [...m[2].matchAll(/["'`]([^"'`]*)["'`]/g)].map((x) => x[1]);
    if (literals.length) map.set(m[1], literals.join(" "));
  }
  return map;
}

/**
 * The class string a tag effectively carries. Takes every string literal in the
 * `className` expression (so `cn("a", cond && "b")` and template literals both
 * contribute) and inlines any local constant referenced by name.
 *
 * Union-of-branches on purpose: for these rules a class present on any branch
 * means the author thought about it, and a rule that fires on one arm of a
 * ternary would be noise.
 */
function classNameOf(tagText, consts) {
  const at = tagText.indexOf("className");
  if (at === -1) return { classes: "", found: false };
  const after = tagText.slice(at + "className".length).replace(/^\s*=\s*/, "");

  // A plain `className="a b"` is already the class list; a `className={…}`
  // expression needs its string literals pulled out and its identifiers resolved.
  let expr = null;
  let parts = [];
  if (after.startsWith("{")) {
    let depth = 0;
    let i = 0;
    let quote = null;
    for (; i < after.length; i++) {
      const c = after[i];
      if (quote) {
        if (c === quote && after[i - 1] !== "\\") quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) break;
    }
    expr = after.slice(1, i);
    parts = [...expr.matchAll(/["'`]([^"'`]*)["'`]/g)].map((x) => x[1]);
  } else {
    const q = after[0];
    if (q === '"' || q === "'") parts = [after.slice(1, after.indexOf(q, 1))];
  }

  if (expr !== null) {
    for (const [name, value] of consts) {
      if (new RegExp(`\\b${name}\\b`).test(expr)) parts.push(value);
    }
  }
  return { classes: ` ${parts.join(" ")} `.replace(/\s+/g, " "), found: true };
}

const lineOf = (src, index) => src.slice(0, index).split("\n").length;

/* ── The rules ────────────────────────────────────────────────────────────── */

/**
 * Field classes whose padding + chevron are guaranteed by `globals.css`.
 * `app-input` is included because `select.app-input` is a real selector there
 * (it sets appearance:none, the chevron image and padding-right: 38px).
 */
const CSS_SELECT_CLASSES = /\b(app-select|app-select-compact|app-input|app-input-compact|proposal-field-compact|proposal-form-theme)\b/;
const CSS_FIELD_CLASSES = /\b(app-input|app-input-compact|app-select|app-select-compact|app-textarea|proposal-field-compact|proposal-form-theme)\b/;

/** Text-ish inputs only — a checkbox/radio/range/color has no text box to pad. */
const NON_TEXT_INPUT = /type=\s*["'](checkbox|radio|range|file|color|hidden|submit|button|image|reset)["']/;

const RULES = [
  {
    id: "SELECT-CHEVRON",
    title: "<select> without the house chevron treatment",
    why:
      "A native <select> paints the OS chevron INSIDE the box with no reserved " +
      "padding, so a long value runs underneath it (this is the Deck bug in " +
      "CLAUDE.md §30). Add `app-select` / `app-select-compact`, or " +
      "`app-select-chevron` plus `pr-6`.",
    run(file, src, consts, report) {
      for (const tag of openingTags(src, "select")) {
        const { classes } = classNameOf(tag.text, consts);
        if (CSS_SELECT_CLASSES.test(classes)) continue;
        if (/\bapp-select-chevron\b/.test(classes)) continue;
        // An explicitly reset select drawing its own arrow is the author's call.
        if (/\bappearance-none\b/.test(classes)) continue;
        report(file, lineOf(src, tag.index), classes.trim() || "(no className)");
      }
    },
  },
  {
    id: "SELECT-PAD",
    title: "<select> chevron with too little right padding",
    why:
      "`app-select-chevron` draws the arrow from 7px to 20px in from the right " +
      "edge, so the value needs pr-6 (24px) or more to clear it. Anything less " +
      "and the text sits under the chevron.",
    run(file, src, consts, report) {
      for (const tag of openingTags(src, "select")) {
        const { classes } = classNameOf(tag.text, consts);
        const drawsOwnChevron = /\bapp-select-chevron\b/.test(classes);
        if (!drawsOwnChevron) continue; // app-select* set padding-right in CSS
        const pr = paddingPx(classes, "r");
        if (pr === null) {
          report(file, lineOf(src, tag.index), "app-select-chevron with no pr-* at all");
        } else if (pr < 24) {
          report(file, lineOf(src, tag.index), `app-select-chevron with only ${pr}px right padding (needs 24px)`);
        }
      }
    },
  },
  {
    id: "TEXTAREA-PAD",
    title: "<textarea> with no vertical padding",
    why:
      "A textarea is multi-line: with horizontal padding only, the first line " +
      "sits flush against the top border. `globals.css` guards the app-* field " +
      "classes; a hand-rolled one needs its own py-*.",
    run(file, src, consts, report) {
      for (const tag of openingTags(src, "textarea")) {
        const { classes, found } = classNameOf(tag.text, consts);
        if (!found) continue; // unstyled or style={{…}} — out of scope
        if (CSS_FIELD_CLASSES.test(classes)) continue;
        if (/\bstyle=/.test(tag.text)) continue; // inline padding is opaque here
        const py = paddingPx(classes, "t");
        const px = paddingPx(classes, "l");
        if (py === null && px !== null) {
          report(file, lineOf(src, tag.index), `${px}px horizontal padding but no vertical padding`);
        } else if (py === 0) {
          report(file, lineOf(src, tag.index), "vertical padding explicitly zeroed");
        }
      }
    },
  },
  {
    id: "INPUT-PAD",
    title: "text input with no horizontal padding",
    why:
      "Text sits flush against the border, which is the single most common " +
      "'padding in the text boxes' complaint. Use `app-input` or give it px-3.",
    run(file, src, consts, report) {
      for (const tag of openingTags(src, "input")) {
        if (NON_TEXT_INPUT.test(tag.text)) continue;
        const { classes, found } = classNameOf(tag.text, consts);
        if (!found) continue;
        if (CSS_FIELD_CLASSES.test(classes)) continue;
        if (/\bstyle=/.test(tag.text)) continue;
        // A borderless input inside an already-padded shell is a real pattern
        // (search rows, inline table cells) — only flag one drawing its own box.
        // `border-0` is explicitly the borderless case, so it must not count.
        if (/\bborder-0\b/.test(classes)) continue;
        if (!/\bborder\b|\bborder-\[|\brounded/.test(classes)) continue;
        const px = paddingPx(classes, "l");
        if (px === null || px === 0) {
          report(file, lineOf(src, tag.index), classes.trim().slice(0, 90) || "(empty className)");
        }
      }
    },
  },
  {
    id: "FIXED-WIDTH",
    title: "unprefixed fixed width wider than a phone",
    why:
      "An unprefixed `w-[420px]` / `min-w-[400px]` is applied at every width, so " +
      "it pushes the page sideways on a 390px phone — the PAGE-X defect from " +
      "docs/mobile-playbook.md. Make it responsive (`sm:w-[420px]`) or cap it " +
      "with max-w-full.",
    run(file, src, consts, report) {
      // 380px: narrower than the 390px iPhone viewport minus the shell's px-6.
      // The lookbehind keeps `sm:w-[…]` (responsive, fine) and `max-w-[…]`
      // (a cap, not a floor) out, while still catching a bare `min-w-[…]`.
      const re = /(?<![:\w-])(min-w|w)-\[(\d+)px]/g;
      const lines = src.split("\n");
      let m;
      while ((m = re.exec(src))) {
        const px = Number(m[2]);
        if (px < 380) continue;
        const line = lineOf(src, m.index);
        const lineText = lines[line - 1] ?? "";
        // Three legitimate ways a fixed width is already safe on a phone:
        //  1. capped on the same element (`max-w-[94vw]`, `max-w-full`, w-full);
        //  2. inside a horizontal scroller — the correct pattern for wide
        //     tables and matrices per the playbook, so the floor is reachable;
        //  3. desktop-only markup (`hidden … lg:block`) that a phone never renders.
        if (/max-w-|w-full/.test(lineText)) continue;
        if (/\bhidden\b[^"'`]*\b(sm|md|lg|xl):(block|flex|grid|table)\b/.test(lineText)) continue;
        const before = src.slice(Math.max(0, m.index - 400), m.index);
        if (/overflow-x-auto|overflow-auto|overflow-x-scroll/.test(before)) continue;
        report(file, line, `${m[0]} with no responsive prefix, cap, or scroll container`);
      }
    },
  },
  {
    id: "TABLE-SCROLL",
    title: "un-shrinkable <table> with no scrollable wrapper",
    why:
      "Tables do not reflow — they scroll (docs/mobile-playbook.md §2). This " +
      "fires only when the table CANNOT shrink (a px `min-w`, fixed-px <col> " +
      "widths, or nowrap cells) and nothing above it scrolls. `overflow-hidden` " +
      "is not a scroller — it clips the overflow away unreachably.",
    run(file, src, consts, report, ctx) {
      for (const tag of openingTags(src, "table")) {
        const end = src.indexOf("</table>", tag.index);
        const body = src.slice(tag.index, end === -1 ? src.length : end);
        const { classes } = classNameOf(tag.text, consts);

        // Can this table shrink to a phone? A percentage colgroup or a plain
        // `w-full` table reflows; a px floor or a nowrap cell cannot.
        const pxFloor = /(?<![:\w-])min-w-\[(\d+)px]/.exec(classes);
        const fixedCols = /<col\b[^>]*\bw-\[\d+px]/.test(body);
        const nowrapCells = /<t[dh]\b[^>]*whitespace-nowrap/.test(body);
        const reason = pxFloor
          ? `min-w-[${pxFloor[1]}px]`
          : fixedCols
            ? "fixed-px <col> widths"
            : nowrapCells
              ? "whitespace-nowrap cells"
              : null;
        if (!reason) continue;

        // A scroller may be a Tailwind utility on an ancestor, or a CSS class
        // that declares overflow itself (e.g. `.endpoint-body` on /api-docs).
        const before = src.slice(Math.max(0, tag.index - 600), tag.index);
        if (/overflow-x-auto|overflow-auto|overflow-x-scroll|overflowX/.test(before)) continue;
        if ((ctx?.cssScrollers ?? []).some((cls) => before.includes(cls))) continue;

        report(file, lineOf(src, tag.index), `${reason}, no scrollable ancestor`);
      }
    },
  },
  {
    id: "MODEL-LITERAL",
    title: "hardcoded model id in server code",
    why:
      "CLAUDE.md §8 and the in-app handbook both say the fallback models live in " +
      "exactly one place — `DEFAULT_MODELS` in `src/server/ai-provider.ts`. A " +
      "duplicated `?? \"claude-sonnet-5\"` silently keeps the old default when " +
      "that table is bumped, so a workspace pays for the wrong model. Import " +
      "`DEFAULT_MODELS` instead.",
    // Server + API only, and skipping the places a model-shaped string is data
    // rather than a call target: `ai-provider.ts` owns the table, `ai-pricing.ts`
    // is a per-model rate card, `settings/models` enumerates each provider's
    // catalogue (its `gpt-4` is a prefix filter), Pulse's checks sniff for these
    // names in scanned HTML, and the starters catalog uses `claude-*` slugs as
    // tags and build refs.
    files: (rel) =>
      /^src\/(server|app\/api)\//.test(rel) &&
      !/ai-provider\.ts$|ai-pricing\.ts$|api\/settings\/models\/|pulse-checks\/|starters-catalog\.ts$|handbook/.test(rel),
    run(file, src, consts, report) {
      // Real model-id shapes only. `claude-` must be followed by a family name
      // or a version digit, so product slugs like "claude-design-2-0" and
      // crawler names like "claude-web" don't read as models.
      const re = /"(claude-(?:opus|sonnet|haiku|fable|instant|\d)[a-z0-9.-]*|gpt-4o[a-z0-9.-]*|gpt-[45][a-z0-9.-]*|gemini-\d[a-z0-9.-]*|llama\d[a-z0-9.-]*)"/g;
      let m;
      while ((m = re.exec(src))) {
        report(file, lineOf(src, m.index), `"${m[1]}" — use DEFAULT_MODELS instead`);
      }
    },
  },
];

/* ── Runner ───────────────────────────────────────────────────────────────── */

function walk(dir, exts, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, exts, out);
    else if (exts.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}

/**
 * Class names that declare their own horizontal overflow, from `globals.css`
 * and from the inline `<style>` blocks the public pages use. A table under one
 * of these is already scrollable without a Tailwind wrapper.
 */
function findCssScrollers() {
  const found = new Set();
  const re = /\.([\w-]+)\s*\{[^}]*overflow(?:-x)?\s*:\s*(?:auto|scroll)/g;
  for (const full of walk(join(ROOT, "src"), [".css", ".tsx", ".ts"])) {
    const src = readFileSync(full, "utf8");
    let m;
    while ((m = re.exec(src))) found.add(m[1]);
  }
  return [...found];
}

/**
 * Which files a rule looks at. Markup rules only need `.tsx`; `MODEL-LITERAL`
 * declares its own predicate because it lives in plain `.ts` server code.
 */
const defaultScope = (rel) => rel.endsWith(".tsx");

function audit(files, rules, ctx) {
  const findings = new Map(rules.map((r) => [r.id, []]));
  for (const full of files) {
    const rel = relative(ROOT, full).split("\\").join("/");
    const applicable = rules.filter((r) => (r.files ?? defaultScope)(rel));
    if (applicable.length === 0) continue;
    const src = stripComments(readFileSync(full, "utf8"));
    const consts = localStringConsts(src);
    for (const rule of applicable) {
      rule.run(
        rel,
        src,
        consts,
        (file, line, detail) => findings.get(rule.id).push({ file, line, detail }),
        ctx,
      );
    }
  }
  return findings;
}

/* Deliberately broken + deliberately fine markup, so a rule that silently stops
   firing is caught. Mirrors `audit-clipping.mjs --self-test`. */
const SELF_TEST_CASES = {
  "SELECT-CHEVRON": {
    bad: `const a = <select className="w-full rounded border px-3 py-2" />;`,
    good: `const a = <select className="app-select w-full" />;
           const b = <select className="app-input" />;
           const c = <select className="app-select-chevron pr-6" />;`,
  },
  "SELECT-PAD": {
    bad: `const a = <select className="app-select-chevron pr-2" />;`,
    good: `const a = <select className="app-select-chevron pr-6" />;
           const b = <select className="app-select-chevron pr-[28px]" />;`,
  },
  "TEXTAREA-PAD": {
    bad: `const a = <textarea className="w-full rounded border px-3" />;`,
    good: `const a = <textarea className="w-full rounded border px-3 py-2" />;
           const b = <textarea className="app-textarea" />;
           const c = <textarea className="app-input min-h-[80px]" />;`,
  },
  "INPUT-PAD": {
    bad: `const a = <input className="w-full rounded border text-sm" />;`,
    good: `const a = <input className="w-full rounded border px-3 text-sm" />;
           const b = <input className="app-input" />;
           const c = <input className="flex-1 bg-transparent text-sm" />;
           const d = <input type="checkbox" className="rounded border" />;`,
  },
  "FIXED-WIDTH": {
    bad: `const a = <div className="min-w-[420px]" />;`,
    good: `const a = <div className="sm:min-w-[420px]" />;
           const b = <div className="w-full max-w-full min-w-[420px]" />;
           const c = <div className="min-w-[280px]" />;
           const d = <div className="max-w-[94vw] w-[760px]" />;
           const e = <div className="hidden w-[380px] lg:block" />;
           const f = <div className="overflow-x-auto"><div className="min-w-[560px]" /></div>;`,
  },
  "TABLE-SCROLL": {
    bad: `const a = <div className="mt-4"><table className="min-w-[998px]" /></div>;
          const b = <div className="overflow-hidden"><table className="min-w-[560px]" /></div>;`,
    good: `const a = <div className="overflow-x-auto"><table className="min-w-[998px]" /></div>;
           const b = <div className="overflow-hidden"><table className="w-full" /></div>;
           const c = <div className="mt-4"><table className="w-full"><colgroup><col className="w-[22%]" /></colgroup></table></div>;`,
  },
  "MODEL-LITERAL": {
    bad: `const m = workspace.anthropicModel ?? "claude-sonnet-5";`,
    good: `const m = workspace.anthropicModel ?? DEFAULT_MODELS.ANTHROPIC;
           const tag = s.tags.includes("claude-design-2-0");`,
  },
};

function selfTest(rules) {
  let failures = 0;
  for (const rule of rules) {
    const cases = SELF_TEST_CASES[rule.id];
    if (!cases) {
      console.log(`  ✗ ${rule.id}: no self-test case defined`);
      failures++;
      continue;
    }
    const hits = (raw) => {
      const src = stripComments(raw);
      const found = [];
      rule.run("selftest.tsx", src, localStringConsts(src), (f, l, d) => found.push(d), {
        cssScrollers: [],
      });
      return found;
    };
    const onBad = hits(cases.bad);
    const onGood = hits(cases.good);
    if (onBad.length === 0) {
      console.log(`  ✗ ${rule.id}: did NOT fire on broken markup`);
      failures++;
    } else if (onGood.length > 0) {
      console.log(`  ✗ ${rule.id}: fired on correct markup — ${onGood.join("; ")}`);
      failures++;
    } else {
      console.log(`  ✓ ${rule.id}`);
    }
  }
  console.log(
    failures === 0
      ? "\nSelf-test passed — every rule fires on the defect and stays quiet on the fix."
      : `\nSelf-test FAILED — ${failures} rule(s) are not trustworthy.`,
  );
  return failures === 0 ? 0 : 1;
}

const rules = ONLY_RULE ? RULES.filter((r) => r.id === ONLY_RULE) : RULES;
if (ONLY_RULE && rules.length === 0) {
  console.error(`Unknown rule "${ONLY_RULE}". Known: ${RULES.map((r) => r.id).join(", ")}`);
  process.exit(2);
}

if (SELF_TEST) {
  console.log("UI standards audit — self-test\n");
  process.exit(selfTest(rules));
}

const files = walk(join(ROOT, "src"), [".tsx", ".ts"]);
const findings = audit(files, rules, { cssScrollers: findCssScrollers() });
let total = 0;

console.log(`UI standards audit — ${files.length} source files under src/\n`);
for (const rule of rules) {
  const rows = findings.get(rule.id);
  total += rows.length;
  if (rows.length === 0) {
    console.log(`✓ ${rule.id.padEnd(15)} clean`);
    continue;
  }
  console.log(`✗ ${rule.id.padEnd(15)} ${rows.length} — ${rule.title}`);
  console.log(`  ${rule.why.replace(/\s+/g, " ")}`);
  for (const row of rows) console.log(`    ${row.file}:${row.line}  ${row.detail}`);
  console.log("");
}

console.log(`\n${total} finding(s).`);
if (total > 0 && !WARN_ONLY) process.exit(1);
