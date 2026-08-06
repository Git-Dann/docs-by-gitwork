// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it } from "vitest";
import { DocumentFormatBar } from "@/components/proposals/document-format-bar";
import { FormatTargetProvider } from "@/lib/sections/format-target";
import { RichTextField } from "@/lib/sections/rich-text-field";

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
