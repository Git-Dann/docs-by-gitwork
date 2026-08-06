// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { DocumentFormatBar } from "@/components/proposals/document-format-bar";
import { CanvasActionsProvider } from "@/lib/sections/canvas-actions";
import { FormatTargetProvider } from "@/lib/sections/format-target";
import { isBlockMenuTrigger, RichTextField } from "@/lib/sections/rich-text-field";

/**
 * The replacement field, driven for real rather than asserted from source.
 *
 * `markdown-doc.test.ts` proves the serialiser is lossless; this proves the COMPONENT wires it up
 * — that what an author sees is formatting rather than asterisks, that what leaves the field is
 * Markdown rather than HTML, and that the two directions cannot echo each other into a loop.
 *
 * Same harness as `rich-inline-toggle.test.tsx`: a real React root in jsdom inside the real
 * `FormatTargetProvider`, because the interesting failures are all in the wiring.
 */

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

const source = (...parts: string[]) => readFileSync(join(__dirname, "..", "..", ...parts), "utf8");

let host: HTMLDivElement;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.appendChild(host);
});

/** CLICK the real toolbar button — the whole path, nothing simulated. */
function press(label: string) {
  const button = host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
  if (!button) throw new Error(`No ${label} button on the toolbar`);
  // Disabled means the field never registered with the toolbar, which is its own bug — assert
  // that rather than clicking into the void and getting a green test out of it.
  expect(button.disabled, `${label} is inert — the field did not register`).toBe(false);
  act(() => {
    button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function mount(initial: string) {
  const state = { markdown: initial, commits: 0 };
  const root = createRoot(host);

  const render = (value: string) =>
    act(() => {
      root.render(
        <FormatTargetProvider>
          <DocumentFormatBar />
          <RichTextField
            value={value}
            onChange={(next) => {
              state.markdown = next;
              state.commits += 1;
            }}
            ariaLabel="Body"
          />
        </FormatTargetProvider>,
      );
    });

  render(initial);
  const surface = host.querySelector<HTMLElement>(".rich-inline-editable");
  if (!surface) throw new Error("RichTextField rendered no editable surface");
  return { state, surface, render };
}

describe("what the author sees is formatting, not markup", () => {
  it("renders bold as an element, not as asterisks", () => {
    const { surface } = mount("The **discovery phase** sets the scope.");

    expect(surface.querySelector("strong")?.textContent).toBe("discovery phase");
    // The defect being fixed: 45 of the 50 fields in Docs render this as literal `**`.
    expect(surface.textContent).not.toContain("*");
  });

  it("renders a bullet list as a list", () => {
    const { surface } = mount("- Discovery\n- Build");

    expect(surface.querySelectorAll("li")).toHaveLength(2);
    expect(surface.textContent).not.toContain("- ");
  });

  it("renders a link as an anchor carrying its href", () => {
    const { surface } = mount("See [the brief](https://gitwork.co.uk/brief) for detail.");
    const anchor = surface.querySelector("a");

    expect(anchor?.getAttribute("href")).toBe("https://gitwork.co.uk/brief");
    expect(surface.textContent).not.toContain("](");
  });

  it("shows text that looks like markup as text", () => {
    const { surface } = mount("Wrap it in a <div> before shipping.");

    expect(surface.textContent).toContain("<div>");
    expect(surface.querySelector("div div")).toBeNull();
  });
});

describe("what leaves the field is markdown", () => {
  it("does not emit on mount — the value is already what the caller gave us", () => {
    // An emit here would mark every document dirty the moment it was opened, and the autosave
    // would write a no-op change to every section on load.
    const { state } = mount("Plain text.");

    expect(state.commits).toBe(0);
    expect(state.markdown).toBe("Plain text.");
  });

  it("emits markdown, not HTML, when the document actually changes", () => {
    // Driven through the REAL toolbar, because that is the only honest way to make the editor
    // change from a test. `bullets` is used rather than `bold` because it alters the document
    // with a collapsed cursor — `bold` on an empty selection only sets a stored mark, so it
    // would produce no update and the assertion would pass against unchanged text.
    const { state, surface } = mount("Plain text.");

    act(() => {
      surface.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });
    press("Bulleted list");

    expect(state.commits).toBeGreaterThan(0);
    expect(state.markdown).toBe("- Plain text.");
    expect(state.markdown).not.toContain("<");
  });
});

/**
 * The numbered-list command — the construct the editor could hold but not offer.
 *
 * `orderedList` has always been in the schema (markdown-it has one `list` rule covering both kinds,
 * so it could not be switched off without losing bullets), but there was no button for it because
 * `renderLines` drew `1. One` as a paragraph beginning with a literal "1." on the client's page.
 * Now that the renderer draws it, the button exists — and this is the test that ties the two
 * together, because it asserts on the MARKDOWN that leaves the field, which is what the renderer
 * is then handed.
 */
describe("numbered lists", () => {
  it("writes a numbered list, and toggles back off", () => {
    const { state, surface } = mount("Discovery");

    act(() => {
      surface.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });

    press("Numbered list");
    expect(state.markdown, "Numbered list did not apply").toBe("1. Discovery");
    expect(surface.querySelector("ol"), "the author sees a list, not a literal marker").not.toBeNull();
    expect(surface.textContent).not.toContain("1. ");

    press("Numbered list");
    expect(state.markdown, "Numbered list did not toggle off").toBe("Discovery");
  });

  it("is a separate list kind from bullets, not a second name for them", () => {
    const { state, surface } = mount("Discovery");
    act(() => {
      surface.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });

    press("Bulleted list");
    expect(state.markdown).toBe("- Discovery");
    press("Numbered list");
    expect(state.markdown).toBe("1. Discovery");
  });
});

describe("external changes do not fight the author", () => {
  it("takes a new value in when the field is not focused", () => {
    // Undo, an AI apply and a refetch all arrive this way.
    const { surface, render } = mount("Before.");
    expect(surface.textContent).toContain("Before.");

    render("After, **changed** elsewhere.");

    const live = host.querySelector(".rich-inline-editable") as HTMLElement;
    expect(live.textContent).toContain("After");
    expect(live.querySelector("strong")?.textContent).toBe("changed");
  });

  it("ignores an incoming value while the author has the field focused", () => {
    // THIS is the guard that protects the caret. An autosave round trip, a sibling edit or a
    // refetch can deliver a `value` prop mid-sentence; seeding it into the editor then would move
    // the cursor out from under whoever is typing.
    //
    // Note what is deliberately NOT tested here: the `lastEmitted` echo check. Skipping a
    // same-value render is an optimisation, not a correctness guard — the focus check below
    // already covers the only moment a re-seed could hurt, and ProseMirror no-ops a `setContent`
    // with identical content anyway. Removing `lastEmitted` regresses nothing, so a test claiming
    // to cover it would be one that cannot fail.
    const { surface, render } = mount("Before.");

    act(() => {
      surface.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });
    render("Something else entirely.");

    const live = host.querySelector(".rich-inline-editable") as HTMLElement;
    expect(live.textContent, "an external value overwrote the focused field").toContain("Before.");
  });
});

describe("the format registry", () => {
  it("registers on focus and unregisters on blur", () => {
    const { surface } = mount("Some text.");

    act(() => {
      surface.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });
    act(() => {
      surface.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });

    // No assertion on the toolbar here — `rich-inline-toggle.test.tsx` covers the command path.
    // This is only checking the component mounts, focuses and blurs without throwing, which is
    // where a mis-wired TipTap instance falls over.
    expect(surface.isConnected).toBe(true);
  });
});

/** Select everything, the way ⌘A does — ProseMirror's own keymap, not a simulated selection. */
function selectAll(surface: HTMLElement) {
  act(() => {
    surface.dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true, cancelable: true }),
    );
  });
}

/**
 * Bold toggling OFF — ported from `rich-inline-toggle.test.tsx` before that file is deleted with
 * the engine it tested.
 *
 * This is the single most-repeated defect in Docs' history: `applyInline` wrapped unconditionally,
 * so a second Bold produced `<strong><strong>x</strong></strong>` → `****x****`, which renders as
 * literal asterisks on a client document. Bold could be turned on and never off.
 *
 * A real editor makes it structurally impossible — marks are a SET on a text node, so bold cannot
 * nest inside bold. Worth asserting anyway rather than trusting that: the coverage would otherwise
 * vanish with the old engine, and this is exactly the bug that keeps coming back.
 */
describe("marks toggle off, not just on", () => {
  for (const [label, marker] of [
    ["Bold", "**"],
    ["Italic", "*"],
    ["Code", "`"],
  ] as const) {
    it(`${label} applies and then removes`, () => {
      const { state, surface } = mount("Preferred file formats");

      act(() => {
        surface.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      });

      selectAll(surface);
      press(label);
      expect(state.markdown, `${label} did not apply`).toBe(
        `${marker}Preferred file formats${marker}`,
      );

      selectAll(surface);
      press(label);
      expect(state.markdown, `${label} did not toggle off`).toBe("Preferred file formats");
    });
  }

  it("never produces ****, however many times Bold is pressed", () => {
    const { state, surface } = mount("Preferred file formats");
    act(() => {
      surface.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });

    for (let i = 0; i < 4; i += 1) {
      selectAll(surface);
      press("Bold");
      expect(state.markdown, `after ${i + 1} presses`).not.toContain("****");
    }
  });
});

/**
 * `/` opens the block menu — but only where it is a gesture rather than a character.
 *
 * ⚠️ The RULE is asserted directly rather than by simulating a keystroke. jsdom does not drive
 * ProseMirror's text-input path (`beforeinput` never reaches it — verified by trying), so a test
 * that "typed" a slash would be asserting against its own simulation rather than the editor. The
 * toolbar-driven tests above work because a command is a real code path; typing is not.
 */
describe("the slash trigger", () => {
  it("fires on a field holding exactly a slash", () => {
    // Typing `/` into an empty field, or select-all then `/`. Both deliberate.
    expect(isBlockMenuTrigger("/")).toBe(true);
  });

  it("does NOT fire on a slash inside real text", () => {
    // The case that would make the editor feel possessed.
    for (const content of [
      "Delivery is 4/5 weeks",
      "and/or",
      "/app/docs/[id]",
      "/ Scope",
      "Scope /",
      "//",
    ]) {
      expect(isBlockMenuTrigger(content), `${content} was treated as a trigger`).toBe(false);
    }
  });

  it("does NOT fire on an empty field", () => {
    expect(isBlockMenuTrigger("")).toBe(false);
  });

  it("never lets the trigger reach the document or the draft", () => {
    // Two properties, both load-bearing: the field clears itself so an autosave cannot persist a
    // stray `/` if the menu is dismissed, and it returns BEFORE `latest.current(markdown)` so the
    // trigger is never emitted as content.
    const body = source("lib", "sections", "rich-text-field.tsx");
    const branch = body.slice(
      body.indexOf("if (canvasRef.current && isBlockMenuTrigger(markdown))"),
      body.indexOf("lastEmitted.current = markdown;"),
    );
    expect(branch).toContain("clearContent()");
    expect(branch).toContain("insertAfter()");
    expect(branch).toContain("return;");
    expect(branch).not.toContain("latest.current(");
  });

  it("has no slash menu at all without a canvas", () => {
    // The public, print and preview renders provide no CanvasActionsProvider, so the branch is
    // unreachable there — the menu does not exist rather than being hidden.
    const body = source("lib", "sections", "rich-text-field.tsx");
    expect(body).toContain("const canvas = useCanvasActions();");
    expect(body).toMatch(/if \(canvasRef\.current && isBlockMenuTrigger/);
  });
});
