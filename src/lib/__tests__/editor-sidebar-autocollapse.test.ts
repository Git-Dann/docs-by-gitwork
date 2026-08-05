import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The document editor auto-collapses the sidebar to give the canvas back ~204px.
 *
 * Asserted on source because the behaviour is a `useEffect` keyed on the pathname inside a
 * component that needs a session, a router and a query client to render — the invariant worth
 * protecting is which paths match, and that is pure string work.
 */

const source = readFileSync(
  join(__dirname, "..", "..", "components", "app-shell.tsx"),
  "utf8",
);

/** The exact matcher the shell uses, kept in step by the first test below. */
const EDITOR_PATH = /^\/app\/docs\/([^/]+)/;

function isEditorPath(pathname: string): boolean {
  const id = EDITOR_PATH.exec(pathname)?.[1] ?? null;
  return Boolean(id) && id !== "analytics";
}

describe("editor sidebar auto-collapse", () => {
  it("uses the matcher this test reasons about", () => {
    // If the component's regex is edited without updating this file, the cases below would be
    // testing a rule the app no longer has.
    expect(source).toContain("/^\\/app\\/docs\\/([^/]+)/");
    expect(source).toContain('editorDocId !== "analytics"');
  });

  it("collapses on a document editor route", () => {
    expect(isEditorPath("/app/docs/cmsem3ly500fqo601ilvv9dhc")).toBe(true);
    expect(isEditorPath("/app/docs/cmsem3ly500fqo601ilvv9dhc/preview")).toBe(true);
  });

  it("does NOT collapse on the Docs list or the analytics dashboard", () => {
    // `/app/docs/analytics` is a real static sibling of `[id]`, so a naive "any segment after
    // /app/docs" rule would collapse the sidebar on a full-width dashboard for no reason.
    expect(isEditorPath("/app/docs")).toBe(false);
    expect(isEditorPath("/app/docs/analytics")).toBe(false);
  });

  it("does not touch any other module", () => {
    for (const path of ["/app", "/app/portal/acme", "/app/pulse", "/app/care", "/app/settings"]) {
      expect(isEditorPath(path), path).toBe(false);
    }
  });

  it("never writes the persisted preference", () => {
    // This is a per-surface default, not a change to what the user chose. Leaving the editor must
    // restore their own setting, so the auto-collapse effect must not call setItem.
    const effect = source.slice(
      source.indexOf("const editorDocId"),
      source.indexOf("}, [isEditor, editorDocId]);"),
    );

    expect(effect).not.toContain("setItem");
  });
});
