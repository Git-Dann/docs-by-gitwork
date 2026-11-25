// @vitest-environment jsdom
/**
 * Code Handover, second pass: edit a version, upload files / a .zip, a file list for
 * multi-file versions, older versions folded, and a compare link that opens the dialog.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { strToU8, zipSync } from "fflate";

const calls = vi.hoisted(() => ({ update: [] as unknown[], create: [] as unknown[] }));
vi.mock("@/hooks/use-wiki", () => {
  const m = (sink?: unknown[]) => () => ({
    mutateAsync: (input: unknown) => {
      sink?.push(input);
      return Promise.resolve({});
    },
    isPending: false,
  });
  return {
    useCreateCodeModule: m(),
    useCreateCodeVersion: m(calls.create),
    useDeleteCodeModule: m(),
    useDeleteCodeVersion: m(),
    useUpdateCodeVersion: m(calls.update),
    useDeleteCodeVariant: m(),
    useSetCodeLock: m(),
    useCreateCodeVariant: m(),
    useRestoreCodeVersion: m(),
    useCodeEvents: () => ({ isPending: false, isError: false, data: [] }),
    useWikiCodeFiles: () => ({ isPending: false, isError: false, data: undefined }),
  };
});
vi.mock("@/hooks/use-permissions", () => ({ usePermissions: () => ({ isExternal: false }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ success: () => {}, error: () => {} }) }));

import { WikiCodeSection } from "../wiki-code-section";
import type { WikiCodeHandoverSection, WikiCodeVersionRecord } from "@/lib/api";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => {
  calls.update.length = 0;
  calls.create.length = 0;
  window.history.replaceState(null, "", "/app/portal/pollen/wiki#code-handover");
});
afterEach(() => {
  document.body.innerHTML = "";
});

const file = (id: string, filename: string, content: string) => ({ id, filename, language: "cpp", content });
const version = (id: string, label: string, day: number, files: WikiCodeVersionRecord["files"], isCurrent = false): WikiCodeVersionRecord => ({
  id,
  label,
  notes: null,
  isCurrent,
  isMaster: false,
  variantId: null,
  createdAt: new Date(Date.UTC(2026, 6, day)).toISOString(),
  updatedAt: new Date(Date.UTC(2026, 6, day)).toISOString(),
  createdByName: null,
  createdByClient: false,
  updatedByName: null,
  files,
});

// Listed as the server lists them: current first, then newest first.
const versions: WikiCodeVersionRecord[] = [
  version("v5", "v1.4", 25, [file("a", "main.cpp", "setup();\nloop();\nsleep(500);\n"), file("b", "src/radio.h", "class Radio {};\n")], true),
  version("v4", "v1.3", 20, [file("c", "main.cpp", "setup();\nloop();\n")]),
  version("v3", "v1.2", 15, [file("d", "main.cpp", "setup();\n")]),
  version("v2", "v1.1", 10, [file("e", "main.cpp", "// v1.1\n")]),
  version("v1", "v1.0", 5, [file("f", "main.cpp", "// v1.0\n")]),
];
const section: WikiCodeHandoverSection = { enabled: true, modules: [{ id: "m1", name: "Receiver", description: null, lockedAt: null, lockedByName: null, variants: [], versions }] };

async function render(mode: "internal" | "public" = "internal") {
  const host = document.createElement("div");
  document.body.appendChild(host);
  await act(async () => createRoot(host).render(<WikiCodeSection slug="pollen" section={section} mode={mode} />));
}

const buttons = (root: ParentNode = document) => [...root.querySelectorAll("button")];
const byText = (text: string, root: ParentNode = document) => buttons(root).find((b) => b.textContent?.trim() === text);
const click = (el: Element | undefined | null) => act(async () => (el as HTMLElement).click());
const dialog = () => document.querySelector('[role="dialog"]') as HTMLElement;
const rowLabels = () => [...document.querySelectorAll("section span")].map((s) => s.textContent).filter((t) => /^v1\.\d$/.test(t ?? ""));

describe("older versions", () => {
  it("shows the newest three, current first, and folds the rest", async () => {
    await render();
    expect(rowLabels()).toEqual(["v1.4", "v1.3", "v1.2"]);
    await click(byText("Show 2 older versions"));
    expect(rowLabels()).toEqual(["v1.4", "v1.3", "v1.2", "v1.1", "v1.0"]);
  });
});

describe("the file viewer", () => {
  it("lists a multi-file version's files and shows one at a time, with line numbers", async () => {
    await render();
    await click(buttons().find((b) => b.textContent?.startsWith("v1.4")));
    const nav = document.querySelector('nav[aria-label="Files in this version"]')!;
    expect([...nav.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["main.cpp", "src/radio.h"]);
    expect([...document.querySelectorAll("[data-code-file]")].map((el) => el.getAttribute("data-code-file"))).toEqual(["main.cpp"]);
    expect(document.querySelector("[data-line-numbers]")?.textContent).toBe("1\n2\n3");
    await click(byText("src/radio.h", nav));
    expect([...document.querySelectorAll("[data-code-file]")].map((el) => el.getAttribute("data-code-file"))).toEqual(["src/radio.h"]);
    expect(byText("Download", document.querySelector("[data-code-file]")!)).toBeDefined();
  });
});

describe("the file picker for a big version", () => {
  it("is a dropdown past 12 files, not a wall of chips", async () => {
    const many = Array.from({ length: 13 }, (_, i) => file(`m${i}`, `src/f${i}.c`, `int f${i};\n`));
    const big: WikiCodeHandoverSection = { enabled: true, modules: [{ id: "m2", name: "Big", description: null, lockedAt: null, lockedByName: null, variants: [], versions: [version("vb", "v2.0", 1, many, true)] }] };
    const host = document.createElement("div");
    document.body.appendChild(host);
    await act(async () => createRoot(host).render(<WikiCodeSection slug="pollen" section={big} mode="public" />));
    await click(buttons().find((b) => b.textContent?.startsWith("v2.0")));
    expect(document.querySelector('nav[aria-label="Files in this version"]')).toBeNull();
    const select = document.querySelector("section select") as HTMLSelectElement;
    expect(select.options).toHaveLength(13);
  });
});

describe("Edit version", () => {
  it("opens prefilled and saves through the update route, replacing the files", async () => {
    await render();
    await click(document.querySelector('[aria-label="Version v1.3 actions"]'));
    await click(byText("Edit version"));
    expect(dialog().textContent).toContain("EDIT VERSION · RECEIVER");
    expect((dialog().querySelector('input[placeholder="e.g. v1.2.0"]') as HTMLInputElement).value).toBe("v1.3");
    const ta = dialog().querySelector('textarea[placeholder^="Paste"]') as HTMLTextAreaElement;
    expect(ta.value).toBe("setup();\nloop();\n");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(ta, "setup();\nloop();\nfix();\n");
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(dialog().querySelector("[data-draft-changes]")?.textContent).toBe("1 file · +1 −0");
    await click(byText("Save changes", dialog()));
    expect(calls.update).toEqual([
      {
        versionId: "v4",
        label: "v1.3",
        notes: null,
        files: [{ filename: "main.cpp", language: "cpp", content: "setup();\nloop();\nfix();\n" }],
      },
    ]);
    expect(calls.create).toEqual([]);
  });

  it("is not offered on the client's page", async () => {
    await render("public");
    expect(document.querySelector('[aria-label="Version v1.3 actions"]')).toBeNull();
  });
});

describe("uploads", () => {
  it("takes a .zip, keeping its paths, and says what it skipped", async () => {
    await render();
    await click(byText("New version"));
    const zip = zipSync({
      "receiver/main.cpp": strToU8("setup();\nloop();\nsleep(500);\n"),
      "receiver/src/radio.h": strToU8("class Radio {};\n"),
      "receiver/logo.bmp": new Uint8Array([66, 77, 0, 0]),
      "__MACOSX/receiver/._main.cpp": strToU8("x"),
    });
    const input = dialog().querySelector('input[aria-label="Upload code files or a .zip"]') as HTMLInputElement;
    const upload = new File([zip], "receiver.zip", { type: "application/zip" });
    Object.defineProperty(input, "files", { value: [upload], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 20));
    });
    const names = [...dialog().querySelectorAll('input[placeholder^="filename"]')].map((i) => (i as HTMLInputElement).value);
    expect(names).toEqual(["main.cpp", "src/radio.h"]);
    const notice = dialog().querySelector("[data-upload-notice]")?.textContent ?? "";
    expect(notice).toContain("logo.bmp (not a text file)");
    expect(notice).toContain("Ignored 1 system or build file");
    // Same files as the current version: nothing changed.
    expect(dialog().querySelector("[data-draft-changes]")?.textContent).toBe("No changes");
  });
});

describe("a shared compare link", () => {
  it("opens the compare view on that pair, and closing it removes the link from the address", async () => {
    window.history.replaceState(null, "", "/app/portal/pollen/wiki?compare=m1:v2..v5#code-handover");
    await render();
    const [from, to] = [...dialog().querySelectorAll("select")] as HTMLSelectElement[];
    expect([from.value, to.value]).toEqual(["v2", "v5"]);
    await click(dialog().querySelector('[aria-label="Close"]'));
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("#code-handover");
  });

  it("ignores a link to versions that aren't here", async () => {
    window.history.replaceState(null, "", "/app/portal/pollen/wiki?compare=m1:nope..v5#code-handover");
    await render();
    expect(dialog()).toBeNull();
  });

  it("colours diff lines and marks the changed words", async () => {
    window.history.replaceState(null, "", "/app/portal/pollen/wiki?compare=m1:v4..v5#code-handover");
    await render();
    const added = [...dialog().querySelectorAll('[data-diff-line="add"]')];
    expect(added.some((row) => row.querySelector(".wch-num"))).toBe(true);
  });
});
