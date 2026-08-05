// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it } from "vitest";
import { DocumentFormatBar } from "@/components/proposals/document-format-bar";
import { RichInlineEditor } from "@/lib/sections/rich-inline-editor";
import { FormatTargetProvider } from "@/lib/sections/format-target";

/**
 * Bold, in the contenteditable path — the one that had NO behavioural coverage.
 *
 * `applyInline` used to wrap unconditionally, so a second Bold produced
 * `<strong><strong>x</strong></strong>` → `****x****`, which renders as literal asterisks. Bold
 * could be turned on and never off in every prose and introduction block.
 *
 * The reason it survived: the only existing "test" of this component grepped its source for a
 * `useRef`. The `<textarea>` path's toggle was fixed and unit-tested, and that was mistaken for
 * the feature working. So this suite drives the REAL component in a REAL DOM — mount it, select
 * text the way a person does, run the command off the format registry, and read the markdown that
 * comes back out.
 */

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

let host: HTMLDivElement;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.appendChild(host);
});

/** Mount the editor and hand back the live surface plus the latest serialised markdown. */
function mount(initial: string) {
  const state = { markdown: initial };
  const root = createRoot(host);

  act(() => {
    root.render(
      // The REAL toolbar, in the same provider — so a "press" below is the same path a click is.
      <FormatTargetProvider>
        <DocumentFormatBar />
        <RichInlineEditor
          value={initial}
          onChange={(next) => {
            state.markdown = next;
          }}
          ariaLabel="Body"
        />
      </FormatTargetProvider>,
    );
  });

  const surface = host.querySelector<HTMLElement>("[contenteditable]");
  if (!surface) throw new Error("RichInlineEditor rendered no editable surface");
  return { state, surface };
}

/**
 * Select `text` inside the surface, the way dragging across it would.
 *
 * Focus FIRST, then select — that is the real order (you click into a field, which focuses it,
 * and the drag makes the selection). Doing it the other way round clears the selection, and the
 * command then returns early with nothing to act on.
 *
 * `focusin`, not `focus`: React delegates onFocus to focusin at the root, so a bare `focus` event
 * never reaches the handler that registers the field with the toolbar.
 */
function select(surface: HTMLElement, text: string) {
  act(() => {
    surface.focus();
    surface.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  });

  const walker = document.createTreeWalker(surface, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const index = (node.textContent ?? "").indexOf(text);
    if (index >= 0) {
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + text.length);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    node = walker.nextNode();
  }
  throw new Error(`"${text}" is not in the editor`);
}

/**
 * Select everything in the field. Needed once the text is split across nodes by an earlier
 * format — `select` above walks single text nodes, and after bolding "file" no one node holds
 * the whole sentence any more.
 */
function selectAll(surface: HTMLElement) {
  act(() => {
    surface.focus();
    surface.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  });
  const range = document.createRange();
  range.selectNodeContents(surface.firstChild ?? surface);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

const LABEL = { bold: "Bold", italic: "Italic", code: "Code" } as const;

/** CLICK the real toolbar button — the whole path, nothing simulated. */
function press(command: keyof typeof LABEL) {
  const button = host.querySelector<HTMLButtonElement>(`[aria-label="${LABEL[command]}"]`);
  if (!button) throw new Error(`No ${LABEL[command]} button on the toolbar`);
  // If this is disabled the field failed to register, which is its own bug — assert rather than
  // click into the void.
  expect(button.disabled, `${LABEL[command]} is inert — the field did not register`).toBe(false);

  act(() => {
    button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("bold toggles off", () => {
  it("bolds a selection, then un-bolds the same selection", () => {
    const { state, surface } = mount("Preferred file formats");

    select(surface, "file");
    press("bold");
    expect(state.markdown, "first press should bold").toBe("Preferred **file** formats");

    select(surface, "file");
    press("bold");
    expect(state.markdown, "second press should REMOVE the bold").toBe("Preferred file formats");
  });

  it("never produces ****, which renders as literal asterisks", () => {
    const { state, surface } = mount("Preferred file formats");

    for (let i = 0; i < 4; i += 1) {
      select(surface, "file");
      press("bold");
      expect(state.markdown, `after ${i + 1} presses`).not.toContain("****");
    }
  });

  it("toggles a <b> that came from a paste, not only its own <strong>", () => {
    const { state, surface } = mount("Preferred file formats");
    // Simulate pasted markup: the serialiser already treats B and STRONG alike, so the toggle
    // must too — otherwise pasted bold can be seen but never removed.
    surface.innerHTML = "<div>Preferred <b>file</b> formats</div>";

    select(surface, "file");
    press("bold");

    expect(state.markdown).toBe("Preferred file formats");
  });

  it("flattens rather than nests when the selection already contains bold", () => {
    const { state, surface } = mount("Preferred file formats");

    select(surface, "file");
    press("bold");
    selectAll(surface);
    press("bold");

    expect(state.markdown).not.toContain("****");
    expect(state.markdown).toBe("**Preferred file formats**");
  });
});

describe("italic and code toggle the same way", () => {
  it("italic", () => {
    const { state, surface } = mount("Preferred file formats");

    select(surface, "file");
    press("italic");
    expect(state.markdown).toBe("Preferred *file* formats");

    select(surface, "file");
    press("italic");
    expect(state.markdown).toBe("Preferred file formats");
  });

  it("code", () => {
    const { state, surface } = mount("Preferred file formats");

    select(surface, "file");
    press("code");
    expect(state.markdown).toBe("Preferred `file` formats");

    select(surface, "file");
    press("code");
    expect(state.markdown).toBe("Preferred file formats");
  });
});
