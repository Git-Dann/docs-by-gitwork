import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * There is ONE modal primitive, and every dialog goes through it.
 *
 * A hand-rolled modal is not a styling choice — it is a dialog with no
 * `role="dialog"`, no `aria-modal`, no Escape, no focus trap and no focus
 * restore, which is exactly what `src/components/backstage/modal.tsx` was until
 * Sep 2026 while claiming in its own comment to "match the platform modal
 * pattern". It also drew its own radius, so two dialogs in the same product
 * looked like two different products.
 *
 * This sweeps for the shape of a re-roll: a fixed full-screen backdrop that is
 * NOT the shared primitive.
 */
const read = (p: string) => readFileSync(p, "utf8");
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== "__tests__") walk(full, out);
    } else if (entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/**
 * Surfaces that legitimately paint their own full-screen layer and are NOT
 * dialogs, each with the reason. A new entry has to earn its line.
 */
const ALLOWED = new Set([
  // The primitive itself.
  "src/components/ui/modal.tsx",
  // A full-page overlay, not a dialog: no focus trap wanted, Escape is its own.
  "src/components/brief/morning-brief.tsx",
  // Lightbox over an image — dismiss-only, no form, no focusable content.
  "src/components/backstage/receipt-viewer.tsx",
]);

/**
 * ⚠️ NOT allowed — DEBT. Each of these is a real hand-rolled dialog with the same
 * defect Backstage's had: no `role="dialog"`, no `aria-modal`, no Escape, no
 * focus trap, no focus restore, and its own radius. They are listed rather than
 * excused because listing them as legitimate would be a lie, and the assertion
 * below is a RATCHET: the count may go down, never up.
 *
 * Not migrated in the same pass as Backstage's because they are eleven screens across the wiki, Settings and Tasks that cannot be visually verified before merge (`/app` is auth-gated,
 * no staging), and a blind eleven-file dialog refactor is how a tidy-up becomes
 * an outage. Take them a screen at a time, each one rendered and measured.
 */
const KNOWN_HAND_ROLLED = [
  "src/components/clients/wiki/changelog-entry-form.tsx",
  "src/components/clients/wiki/course-api-intake-modal.tsx",
  "src/components/clients/wiki/course-feedback-import-modal.tsx",
  "src/components/clients/wiki/course-request-form.tsx",
  "src/components/clients/wiki/wiki-access-settings.tsx",
  "src/components/clients/wiki/wiki-intake-section.tsx",
  "src/components/clients/wiki/wiki-workspace.tsx",
  "src/components/settings/agents-panel.tsx",
  "src/components/settings/checks-panel.tsx",
  "src/components/settings/team-section.tsx",
  "src/components/tasks/task-attachments.tsx",
];

describe("dialogs — one primitive, no re-rolls", () => {
  const files = walk(join(process.cwd(), "src/components")).map((f) =>
    f.replace(process.cwd() + "/", ""),
  );

  it("sweeps a meaningful number of components", () => {
    // A broken walk would report "0 offenders" and pass for ever.
    expect(files.length).toBeGreaterThan(200);
  });

  function handRolled(): string[] {
    const found: string[] = [];
    for (const file of files) {
      if (ALLOWED.has(file)) continue;
      const src = stripComments(read(join(process.cwd(), file)));
      // `fixed inset-0` + a dimmed background is the signature of a backdrop.
      if (/fixed inset-0[^"'`]*bg-black\//.test(src)) found.push(file);
    }
    return found.sort();
  }

  it("no NEW hand-rolled modal appears", () => {
    const unexpected = handRolled().filter((f) => !KNOWN_HAND_ROLLED.includes(f));
    expect(unexpected, `new hand-rolled dialog(s):\n${unexpected.join("\n")}`).toEqual([]);
  });

  it("the known list only ever shrinks", () => {
    // A ratchet, not a permission slip. Migrate one and delete its line; the
    // assertion fails if the list names a file that no longer offends, so a
    // stale entry cannot sit there pretending to be debt.
    const found = handRolled();
    for (const known of KNOWN_HAND_ROLLED) {
      expect(found, `${known} is migrated — remove it from KNOWN_HAND_ROLLED`).toContain(known);
    }
  });

  it("the detector finds the primitive's own backdrop, so a clean run means something", () => {
    // Without this, a regex that matched nothing would report zero offenders.
    const primitive = stripComments(read(join(process.cwd(), "src/components/ui/modal.tsx")));
    expect(primitive).toMatch(/fixed inset-0/);
  });

  it("BackstageModal delegates rather than re-implementing", () => {
    const src = stripComments(read(join(process.cwd(), "src/components/backstage/modal.tsx")));
    expect(src).toMatch(/import \{ Modal \} from "@\/components\/ui\/modal"/);
    expect(src).toContain("<Modal");
    // The a11y it used to be missing now comes from the primitive, so it must
    // not re-declare a panel of its own.
    expect(src).not.toContain("bg-black/");
    expect(src).not.toContain("rounded-[14px]");
    // It still names its own heading, or the dialog is unlabelled.
    expect(src).toContain("labelledById");
  });

  it("every dialog the fixed-height clamp is on keeps a shrinkable scroll region", () => {
    // Re-stating §52.3's rule at the primitive's door: `app-dialog-fixed` makes
    // the panel overflow:hidden, so a body with no scroller puts everything past
    // 80vh out of reach — strictly worse than the resizing it replaced.
    const src = stripComments(read(join(process.cwd(), "src/components/backstage/modal.tsx")));
    if (src.includes("app-dialog-fixed")) {
      // The caller's own <form> is the scroll region here, which is why this
      // wrapper passes children straight through rather than wrapping them.
      expect(src).toContain("{children}");
      expect(src).not.toMatch(/<div[^>]*overflow-hidden[^>]*>\s*\{children\}/);
    }
  });
});
