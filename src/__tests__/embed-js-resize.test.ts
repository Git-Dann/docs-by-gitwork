// @vitest-environment jsdom
/**
 * Regression test for the loader snippet actually shipped at
 * public/embed/pulse/embed.js — reads the real file (not a re-implementation, see
 * CLAUDE.md's own "test the generated snippet, not a hand-written approximation"
 * discipline) and executes it in jsdom to exercise its resize message listener.
 *
 * Covers the multi-instance cross-talk bug: the listener used to validate only
 * `event.origin`, so with two embeds on one host page (same origin for both,
 * since they're served from the same ORIGIN constant), either iframe's height
 * message would resize the OTHER iframe too. The fix adds an `event.source ===
 * iframe.contentWindow` check so each instance only reacts to its own iframe.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

// vitest runs from the repo root, so this resolves the same real file the app serves.
const embedJsPath = join(process.cwd(), "public/embed/pulse/embed.js");
const source = readFileSync(embedJsPath, "utf-8");

const REAL_ORIGIN = "https://foundry.gitwork.co.uk";

beforeEach(() => {
  document.body.innerHTML = "";
});

/** Executes the actual shipped IIFE. document.currentScript is null outside a real
 * <script> tag, so it falls into the document.body.appendChild(iframe) branch —
 * fine here, since this test targets the message-listener behavior, not the
 * script-position insertion logic. Returns the iframe it created. */
function loadEmbedInstance(): HTMLIFrameElement {
  const before = new Set(document.querySelectorAll("iframe"));
  new Function(source)();
  const after = Array.from(document.querySelectorAll("iframe"));
  const created = after.find((el) => !before.has(el));
  if (!created) throw new Error("embed.js did not create an iframe");
  return created;
}

function postHeightMessage(fromWindow: Window | null, height: unknown, origin = REAL_ORIGIN) {
  window.dispatchEvent(
    new MessageEvent("message", { data: { type: "pulse-embed-height", height }, origin, source: fromWindow }),
  );
}

describe("embed.js — resize message listener", () => {
  it("resizes the iframe on a same-origin message from its own contentWindow", () => {
    const iframe = loadEmbedInstance();
    postHeightMessage(iframe.contentWindow, 555);
    expect(iframe.style.height).toBe("555px");
  });

  it("ignores a same-origin message whose source is a DIFFERENT window (regression: multi-instance cross-talk)", () => {
    const iframe = loadEmbedInstance();
    const foreignIframe = document.createElement("iframe");
    document.body.appendChild(foreignIframe);

    postHeightMessage(foreignIframe.contentWindow, 999);

    expect(iframe.style.height).not.toBe("999px");
  });

  it("two embed instances on one page don't cross-resize each other", () => {
    const iframeA = loadEmbedInstance();
    const iframeB = loadEmbedInstance();

    postHeightMessage(iframeB.contentWindow, 321);

    expect(iframeB.style.height).toBe("321px");
    expect(iframeA.style.height).not.toBe("321px");
  });

  it("ignores a message from the wrong origin even with the right source window", () => {
    const iframe = loadEmbedInstance();
    postHeightMessage(iframe.contentWindow, 777, "https://evil.example");
    expect(iframe.style.height).not.toBe("777px");
  });

  it("ignores a malformed payload (wrong type / non-numeric height) from the right origin+source", () => {
    const iframe = loadEmbedInstance();
    postHeightMessage(iframe.contentWindow, "not-a-number");
    expect(iframe.style.height).toBe("");
  });
});
