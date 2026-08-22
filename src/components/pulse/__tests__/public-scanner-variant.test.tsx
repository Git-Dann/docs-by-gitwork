// @vitest-environment jsdom
/**
 * The scanner is one component with two entry points, and the difference between them
 * is entirely chrome:
 *
 *   /embed/pulse       (variant="embed") — a self-contained widget on SOMEONE ELSE'S
 *                      site. It must introduce itself ("Pulse / Free site health
 *                      check"), say where it came from ("Powered by Gitwork Foundry"),
 *                      draw its own card, and post its height so the host iframe can
 *                      resize.
 *
 *   /production-ready  (variant="page") — a section of a Gitwork page that already has
 *                      a headline, a footer, a card and a fixed width. Rendering the
 *                      widget's versions of those produced two of each, which is what
 *                      made the page look broken.
 *
 * Pinned in BOTH directions on purpose. Asserting only that the page variant drops the
 * chrome would let the embed quietly lose it too — and /embed/pulse is an external
 * contract (allow-listed for gitwork.co.uk, exempt from the baseline security headers),
 * so a regression there breaks a live third-party placement with nothing to catch it.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PublicScanner, type PublicScannerVariant } from "../public-scanner";

let host: HTMLDivElement;
const posted: unknown[] = [];

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.appendChild(host);
  posted.length = 0;

  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private cb: () => void) {}
      observe() { this.cb(); }
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  // The config fetch would otherwise be an unhandled rejection in jsdom.
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ turnstileSiteKey: null, bookingUrl: "https://cal.example/x" }),
  } as Response)));
  // window.parent is `window` in jsdom, so the resize effect posts to itself — which is
  // exactly the behaviour being tested. Record instead of dispatching.
  Object.defineProperty(window, "parent", {
    configurable: true,
    value: { postMessage: (msg: unknown) => { posted.push(msg); } },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function render(variant: PublicScannerVariant) {
  const root = createRoot(host);
  act(() => {
    root.render(<PublicScanner variant={variant} checkCountLabel="over 1,600" />);
  });
  return root;
}

/** Flush the /api/public/pulse/config fetch so its setState lands inside act(). */
async function renderSettled(variant: PublicScannerVariant) {
  render(variant);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

const text = () => host.textContent ?? "";

describe("the embed variant is a self-contained widget", () => {
  it("introduces itself, credits Gitwork Foundry, and draws its own card", async () => {
    await renderSettled("embed");
    expect(text()).toContain("Pulse");
    expect(host.querySelector("h1")?.textContent).toBe("Free site health check");
    expect(text()).toContain("Powered by");
    expect(text()).toContain("Gitwork Foundry");
    // Its own width, so it does not stretch across a wide host page.
    expect((host.firstElementChild as HTMLElement).style.maxWidth).toBe("640px");
    expect((host.firstElementChild as HTMLElement).style.background).not.toBe("");
  });

  it("posts its height so the host iframe can resize", async () => {
    await renderSettled("embed");
    expect(posted.some((m) => (m as { type?: string })?.type === "pulse-embed-height")).toBe(true);
  });
});

describe("the page variant brings none of that", () => {
  it("has no widget header — the page supplies the headline", async () => {
    await renderSettled("page");
    expect(host.querySelector("h1")).toBeNull();
    expect(text()).not.toContain("Free site health check");
  });

  it("does not credit itself — the page footer already does", async () => {
    await renderSettled("page");
    expect(text()).not.toContain("Powered by");
    expect(text()).not.toContain("Gitwork Foundry");
  });

  it("draws no card and claims no width of its own", async () => {
    await renderSettled("page");
    const root = host.firstElementChild as HTMLElement;
    expect(root.style.maxWidth).toBe("");
    expect(root.style.background).toBe("");
    expect(root.style.padding).toBe("");
  });

  it("posts no height messages", async () => {
    // Rendered inline, `window.parent` is this window: these would reach the host
    // page's own message listeners.
    await renderSettled("page");
    expect(posted).toEqual([]);
  });
});

describe("both variants render the actual tool", () => {
  for (const variant of ["embed", "page"] as const) {
    it(`${variant}: the URL field, the submit button and the check count`, async () => {
      await renderSettled(variant);
      const input = host.querySelector<HTMLInputElement>('input[type="url"]');
      expect(input).not.toBeNull();
      expect(input?.placeholder).toBe("yourwebsite.com");
      expect(host.querySelector("button")?.textContent).toBe("Scan my site");
      // The count is a prop precisely so it stays in step with the registry; the
      // widget used to hardcode "Over 900" while every other surface said 1,600.
      expect(text()).toContain("over 1,600 automated checks");
    });
  }
});

describe("attribution", () => {
  it("a declared source is not overridden by the referrer", () => {
    // The sales page frames nothing and is same-origin, so referrer sniffing would
    // file its leads under "gitwork.co.uk" — the wrong door, and the one number that
    // tells us which entry point converts.
    const src = readFileSync("src/components/pulse/public-scanner.tsx", "utf8");
    expect(src).toMatch(/if \(defaultSource\) return;/);
    expect(src).toMatch(/useState<PulseScanSource>\(defaultSource \?\? "foundry-demo"\)/);
  });
});

describe("mobile", () => {
  it("no text input is under 16px, or iOS zooms the page on focus", () => {
    // Both fields were 15px, so tapping the URL box on a phone zoomed the viewport and
    // pushed the widget half off-screen. Asserted at source because jsdom does not
    // implement iOS's focus-zoom behaviour — there is nothing to observe at runtime.
    // Checks <input> only: the submit button and the notice paragraph are legitimately
    // 15px, and only focusable text fields trigger the zoom.
    const src = readFileSync("src/components/pulse/public-scanner.tsx", "utf8");
    const offenders: string[] = [];
    for (const m of src.matchAll(/<input\b/g)) {
      const tag = src.slice(m.index!, src.indexOf("/>", m.index!));
      for (const f of tag.matchAll(/fontSize:\s*(\d+)/g)) {
        if (Number(f[1]) < 16) offenders.push(`${f[1]}px at char ${m.index}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the submit button clears the 44px minimum tap target", () => {
    // 13px padding + 15px text + no explicit height: measured 48px in Chrome at 375px.
    const src = readFileSync("src/components/pulse/public-scanner.tsx", "utf8");
    expect(src).toMatch(/padding: "13px 20px"/);
  });
});
