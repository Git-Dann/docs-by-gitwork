// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { WikiDocumentDTO } from "@/lib/api";
import { DocumentsList } from "@/components/clients/wiki/documents-section";

/**
 * Card grid + search + kind tabs + pagination on the Wiki's Documents list.
 *
 * `DocumentsList` has no mutation hooks (read-only), so it renders without a
 * QueryClientProvider — this drives the real component, not a mock, across a
 * mixed FOUNDRY/LINK/FILE set that's deliberately > PAGE_SIZE (8) so both the
 * "ALL" tab and pagination are exercised together.
 */

let host: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  document.body.innerHTML = "";
});

function makeDoc(id: string, kind: WikiDocumentDTO["kind"], title: string): WikiDocumentDTO {
  return {
    id,
    title,
    kind,
    url: kind === "FILE" ? null : `https://example.com/${id}`,
    host: kind === "LINK" ? "example.com" : null,
    fileName: kind === "FILE" ? `${title}.pdf` : null,
    fileSize: kind === "FILE" ? 204_800 : null,
    addedAt: new Date("2026-08-01T00:00:00Z").toISOString(),
  };
}

// 5 FOUNDRY + 3 LINK + 4 FILE = 12 — past the 8-per-page cap on "ALL", while
// every single-kind tab stays on one page.
const DOCS: WikiDocumentDTO[] = [
  ...Array.from({ length: 5 }, (_, i) => makeDoc(`fd-${i}`, "FOUNDRY", `Foundry doc ${i}`)),
  ...Array.from({ length: 3 }, (_, i) => makeDoc(`lk-${i}`, "LINK", `Link doc ${i}`)),
  ...Array.from({ length: 4 }, (_, i) => makeDoc(`fl-${i}`, "FILE", `File doc ${i}`)),
];

function render() {
  const root = createRoot(host);
  act(() => root.render(<DocumentsList documents={DOCS} fileBase="/api/clients/acme/wiki" />));
}

function tabButton(label: string): HTMLButtonElement {
  const button = Array.from(host.querySelectorAll("button")).find(
    (b) => b.className.includes("rounded-full") && b.textContent?.trim().startsWith(label),
  );
  if (!button) throw new Error(`No filter tab starting with "${label}"`);
  return button;
}

function pagerButton(direction: "next" | "prev"): HTMLButtonElement {
  const buttons = Array.from(host.querySelectorAll("button")).filter(
    (b) => !b.className.includes("rounded-full"),
  );
  const button = direction === "next" ? buttons[buttons.length - 1] : buttons[buttons.length - 2];
  if (!button) throw new Error(`No pager "${direction}" button`);
  return button;
}

function searchInput(): HTMLInputElement {
  const input = host.querySelector("input");
  if (!input) throw new Error("No search input");
  return input;
}

// React tracks a controlled input's value through its own setter, so setting
// `.value` directly and firing a plain DOM event is a silent no-op — it never
// reaches the onChange handler. Going through the native setter (the standard
// jsdom+React workaround) is what actually drives the controlled component.
function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function cardCount(): number {
  return host.querySelectorAll("article").length;
}

describe("DocumentsList — card grid, search, kind tabs, pagination", () => {
  it("renders one tab per kind, starting with All, each carrying its own count", () => {
    render();
    expect(tabButton("All").textContent).toContain("12");
    expect(tabButton("Foundry").textContent).toContain("5");
    expect(tabButton("Links").textContent).toContain("3");
    expect(tabButton("Files").textContent).toContain("4");
  });

  it("caps the ALL tab at 8 cards per page", () => {
    render();
    expect(cardCount()).toBe(8);
    expect(host.textContent).toContain("1–8 of 12");
  });

  it("Next/Previous page through the remaining cards without changing the filter", () => {
    render();
    act(() => pagerButton("next").dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(cardCount()).toBe(4);
    expect(host.textContent).toContain("9–12 of 12");

    act(() => pagerButton("prev").dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(cardCount()).toBe(8);
  });

  it("filtering to Foundry hides Link/File docs and fits on one page", () => {
    render();
    act(() => tabButton("Foundry").dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(cardCount()).toBe(5);
    expect(host.textContent).not.toContain("Link doc");
    expect(host.textContent).not.toContain("File doc");
    // 5 <= PAGE_SIZE, so no "of N" pager readout should render.
    expect(host.textContent).not.toContain(" of 5");
  });

  it("search narrows across kinds and resets to page 1", () => {
    render();
    act(() => pagerButton("next").dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(host.textContent).toContain("9–12 of 12");

    typeInto(searchInput(), "File doc 2");
    expect(cardCount()).toBe(1);
    expect(host.textContent).toContain("File doc 2");
    expect(host.textContent).not.toContain("File doc 0");
  });

  it("says so plainly when nothing matches a search", () => {
    render();
    typeInto(searchInput(), "nothing matches this");
    expect(cardCount()).toBe(0);
    expect(host.textContent).toContain("No documents match your search.");
  });
});
