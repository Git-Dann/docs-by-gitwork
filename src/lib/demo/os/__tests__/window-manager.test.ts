import { describe, expect, it } from "vitest";
import {
  MENU_BAR_H,
  MIN_H,
  MIN_W,
  clampWindow,
  focusedId,
  initialOsState,
  isDemoHref,
  osReducer,
  parseSavedState,
  type OsState,
} from "../window-manager";

const vp = { width: 1440, height: 900 };
const open = (s: OsState, app: Parameters<typeof osReducer>[1] extends infer A ? (A extends { type: "open"; app: infer P } ? P : never) : never, props = {}) =>
  osReducer(s, { type: "open", app, title: app, props, viewport: vp });

describe("window manager", () => {
  it("opens a window inside the desktop, below the menu bar", () => {
    const s = open(initialOsState, "finder");
    expect(s.windows).toHaveLength(1);
    const w = s.windows[0];
    expect(w.y).toBeGreaterThanOrEqual(MENU_BAR_H);
    expect(w.x + w.w).toBeLessThanOrEqual(vp.width);
    expect(focusedId(s)).toBe(w.id);
  });

  it("focuses an app that is already open instead of opening a second copy", () => {
    let s = open(initialOsState, "finder");
    s = open(s, "notes");
    s = open(s, "finder");
    expect(s.windows.filter((w) => w.app === "finder")).toHaveLength(1);
    expect(s.windows.find((w) => w.id === focusedId(s))?.app).toBe("finder");
  });

  it("follows a new page in the existing Foundry window", () => {
    let s = open(initialOsState, "foundry", { href: "/demo/portal" });
    s = open(s, "foundry", { href: "/demo/wiki" });
    expect(s.windows).toHaveLength(1);
    expect(s.windows[0].props.href).toBe("/demo/wiki");
  });

  it("cascades new windows so they don't land exactly on top of each other", () => {
    let s = open(initialOsState, "finder");
    s = open(s, "notes");
    expect(s.windows[0].y).not.toBe(s.windows[1].y);
  });

  it("dock: minimised restores, focused minimises, otherwise focuses", () => {
    let s = open(initialOsState, "finder");
    const id = s.windows[0].id;
    s = osReducer(s, { type: "dock", app: "finder", title: "x", viewport: vp });
    expect(s.windows[0].minimised).toBe(true);
    s = osReducer(s, { type: "dock", app: "finder", title: "x", viewport: vp });
    expect(s.windows[0].minimised).toBe(false);
    expect(focusedId(s)).toBe(id);
    s = open(s, "notes");
    s = osReducer(s, { type: "dock", app: "finder", title: "x", viewport: vp });
    expect(focusedId(s)).toBe(id);
    expect(s.windows.find((w) => w.id === id)?.minimised).toBe(false);
  });

  it("dock opens an app that isn't running", () => {
    const s = osReducer(initialOsState, { type: "dock", app: "terminal", title: "t", viewport: vp });
    expect(s.windows.map((w) => w.app)).toEqual(["terminal"]);
  });

  it("never lets a title bar leave the screen", () => {
    let s = open(initialOsState, "finder");
    const id = s.windows[0].id;
    s = osReducer(s, { type: "move", id, x: -5000, y: -5000, viewport: vp });
    const w = s.windows[0];
    expect(w.y).toBe(MENU_BAR_H);
    expect(w.x + w.w).toBeGreaterThanOrEqual(96);
    s = osReducer(s, { type: "move", id, x: 99999, y: 99999, viewport: vp });
    expect(s.windows[0].x).toBeLessThanOrEqual(vp.width - 96);
    expect(s.windows[0].y).toBeLessThanOrEqual(vp.height - 36);
  });

  it("never resizes below the minimum or beyond the screen", () => {
    let s = open(initialOsState, "finder");
    const id = s.windows[0].id;
    s = osReducer(s, { type: "resize", id, w: 10, h: 10, viewport: vp });
    expect(s.windows[0].w).toBe(MIN_W);
    expect(s.windows[0].h).toBe(MIN_H);
    s = osReducer(s, { type: "resize", id, w: 99999, h: 99999, viewport: vp });
    expect(s.windows[0].w).toBe(vp.width);
    expect(s.windows[0].h).toBe(vp.height - MENU_BAR_H);
  });

  it("pulls windows back on screen when the browser shrinks", () => {
    let s = open(initialOsState, "foundry");
    const small = { width: 800, height: 500 };
    s = osReducer(s, { type: "fit", viewport: small });
    const w = s.windows[0];
    expect(w.w).toBeLessThanOrEqual(small.width);
    expect(w.y).toBeLessThanOrEqual(small.height - 36);
    expect(w.x).toBeLessThanOrEqual(small.width - 96);
  });

  it("the focused window is the topmost visible one", () => {
    let s = open(initialOsState, "finder");
    s = open(s, "notes");
    const notes = s.windows.find((w) => w.app === "notes")!.id;
    expect(focusedId(s)).toBe(notes);
    s = osReducer(s, { type: "minimise", id: notes });
    expect(s.windows.find((w) => w.id === focusedId(s))?.app).toBe("finder");
  });

  it("clampWindow keeps a window at least the minimum size", () => {
    const w = clampWindow({ id: "a", app: "notes", title: "", props: {}, x: 0, y: 0, w: 1, h: 1, z: 1, minimised: false, maximised: false }, vp);
    expect(w.w).toBe(MIN_W);
    expect(w.h).toBe(MIN_H);
  });
});

describe("saved layout", () => {
  it("restores a valid layout", () => {
    const s = open(initialOsState, "finder");
    const restored = parseSavedState(JSON.stringify({ windows: s.windows }), vp);
    expect(restored.windows.map((w) => w.app)).toEqual(["finder"]);
    expect(restored.nextZ).toBeGreaterThan(s.windows[0].z);
  });

  it("drops anything malformed instead of trusting it", () => {
    expect(parseSavedState("not json", vp)).toEqual(initialOsState);
    expect(parseSavedState(JSON.stringify({ windows: "x" }), vp)).toEqual(initialOsState);
    const bad = parseSavedState(
      JSON.stringify({ windows: [{ id: "a", app: "rm -rf", title: "x", x: 0, y: 0, w: 400, h: 400, z: 1 }, { id: "b", app: "notes", title: "x", x: "0" }] }),
      vp,
    );
    expect(bad.windows).toHaveLength(0);
  });

  it("never restores the Foundry window pointing anywhere but a demo page", () => {
    const base = { id: "a", app: "foundry", title: "Foundry", x: 40, y: 40, w: 800, h: 600, z: 1 };
    for (const href of ["https://evil.example", "/app/portal", "javascript:alert(1)", "//evil.example/demo", "/demo/os"]) {
      const s = parseSavedState(JSON.stringify({ windows: [{ ...base, props: { href } }] }), vp);
      expect(s.windows[0].props.href).toBeUndefined();
    }
    const ok = parseSavedState(JSON.stringify({ windows: [{ ...base, props: { href: "/demo/portal" } }] }), vp);
    expect(ok.windows[0].props.href).toBe("/demo/portal");
  });
});

describe("isDemoHref", () => {
  it("allows demo pages and nothing else", () => {
    expect(isDemoHref("/demo")).toBe(true);
    expect(isDemoHref("/demo/wiki")).toBe(true);
    expect(isDemoHref("/demo/docs/doc-1?tab=builder")).toBe(true);
    expect(isDemoHref("/demonstration")).toBe(false);
    expect(isDemoHref("/app/portal")).toBe(false);
    expect(isDemoHref("https://gitwork.co.uk/demo")).toBe(false);
    // The desktop must never open itself inside itself.
    expect(isDemoHref("/demo/os")).toBe(false);
  });
});
