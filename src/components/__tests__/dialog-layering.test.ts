import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * A dialog must sit ABOVE the "On Your Desk" dock.
 *
 * The dock is fixed to the bottom of every /app page at z-40. Eight hand-rolled
 * dialogs in Portal were at z-30, so opening one left the dock painted on top of
 * the overlay — visible, undimmed and still clickable, while the modal claimed to
 * be modal. Proven by hit-testing: at z-30 `elementFromPoint` over the dock
 * returned the dock; at z-50 it returns the overlay.
 *
 * The shared `Modal` primitive has always been z-50. This catches the copies that
 * don't use it — writing `fixed inset-0 z-30` looks perfectly reasonable until you
 * know what else is on the page.
 */

const ROOT = join(__dirname, "..", "..", "..");
/** The dock's layer. Anything modal has to beat it. */
const DESK_Z = 40;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(entry)) out.push(full);
  }
  return out;
}

/** Overlay roots that are DIALOGS — identified by the backdrop they contain. */
function dialogOverlays(): { file: string; z: number }[] {
  const found: { file: string; z: number }[] = [];
  for (const file of walk(join(ROOT, "src/components"))) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/fixed inset-0 z-\[?(\d+)\]?/g)) {
      // A dialog root declares its backdrop within the next few elements.
      const following = src.slice(m.index ?? 0, (m.index ?? 0) + 400);
      if (!following.includes("app-dialog-backdrop")) continue;
      found.push({ file: file.replace(`${ROOT}/`, ""), z: Number(m[1]) });
    }
  }
  return found;
}

describe("dialog layering", () => {
  it("finds the dialog overlays (guards against the scan matching nothing)", () => {
    expect(dialogOverlays().length).toBeGreaterThan(5);
  });

  it("keeps the desk dock at the layer this test assumes", () => {
    // If the dock moves, the threshold below is wrong rather than merely stale.
    const desk = readFileSync(join(ROOT, "src/components/desk/desk-drawer.tsx"), "utf8");
    expect(desk).toMatch(new RegExp(`z-${DESK_Z}\\b`));
  });

  it("puts every dialog above the desk dock", () => {
    const tooLow = dialogOverlays().filter((d) => d.z <= DESK_Z);
    expect(
      tooLow,
      `These dialogs sit at or below the desk dock (z-${DESK_Z}), so the dock stays ` +
        `clickable on top of the overlay:\n` +
        tooLow.map((d) => `  ${d.file} → z-${d.z}`).join("\n") +
        `\nUse z-50, like src/components/ui/modal.tsx.`,
    ).toEqual([]);
  });
});
