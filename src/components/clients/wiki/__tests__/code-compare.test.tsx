// @vitest-environment jsdom
/**
 * Code Handover compare, as people use it: a "since vX" line on each version, a Compare
 * button per module (on the client's page too), the compare view itself, and a New version
 * popup that starts from the current version's files and says what the draft changes.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const { mutation } = vi.hoisted(() => ({
  mutation: () => ({ mutateAsync: () => Promise.resolve({}), isPending: false }),
}));
vi.mock("@/hooks/use-wiki", () => ({
  useCreateCodeModule: mutation,
  useCreateCodeVersion: mutation,
  useDeleteCodeModule: mutation,
  useDeleteCodeVersion: mutation,
  useUpdateCodeVersion: mutation,
  useDeleteCodeVariant: mutation,
  useSetCodeLock: mutation,
  useCreateCodeVariant: mutation,
  useRestoreCodeVersion: mutation,
  useCodeEvents: () => ({ isPending: false, isError: false, data: [] }),
  useWikiCodeFiles: () => ({ isPending: false, isError: false, data: undefined }),
}));
vi.mock("@/hooks/use-permissions", () => ({ usePermissions: () => ({ isExternal: false }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ success: () => {}, error: () => {} }) }));

import { WikiCodeSection } from "../wiki-code-section";
import { mergeDraftFiles } from "@/lib/code-upload";
import { CodeCompareDialog, defaultComparePair, FOLD_ABOVE_LINES } from "../code-compare";
import type { WikiCodeHandoverSection, WikiCodeVersionRecord } from "@/lib/api";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => {
  document.body.innerHTML = "";
});

const file = (id: string, filename: string, content: string) => ({ id, filename, language: "cpp", content });

const versions: WikiCodeVersionRecord[] = [
  {
    id: "v13", label: "v1.3", notes: "Sleep between polls.", isCurrent: true, isMaster: false, variantId: null, createdAt: "2026-07-21T10:00:00Z", updatedAt: "2026-07-21T10:00:00Z", createdByName: null, createdByClient: false, updatedByName: null,
    files: [file("a", "main.cpp", "setup();\nloop();\nsleep(500);\n"), file("b", "config.h", "#define CH 7\n")],
  },
  {
    id: "v12", label: "v1.2", notes: null, isCurrent: false, isMaster: false, variantId: null, createdAt: "2026-07-14T10:00:00Z", updatedAt: "2026-07-14T10:00:00Z", createdByName: null, createdByClient: false, updatedByName: null,
    files: [file("c", "main.cpp", "setup();\nloop();\n")],
  },
  {
    id: "v1", label: "v1", notes: null, isCurrent: false, isMaster: false, variantId: null, createdAt: "2026-07-01T10:00:00Z", updatedAt: "2026-07-01T10:00:00Z", createdByName: null, createdByClient: false, updatedByName: null,
    files: [file("d", "main.cpp", "setup();\n")],
  },
];

const section: WikiCodeHandoverSection = {
  enabled: true,
  modules: [
    { id: "m1", name: "Receiver", description: null, lockedAt: null, lockedByName: null, variants: [], versions },
    { id: "m2", name: "Sender", description: null, lockedAt: null, lockedByName: null, variants: [], versions: [versions[2]] },
  ],
};

async function render(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  await act(async () => createRoot(host).render(node));
}

const buttons = (root: ParentNode = document) => [...root.querySelectorAll("button")];
const byText = (text: string, root: ParentNode = document) => buttons(root).find((b) => b.textContent?.trim() === text);
const click = (el: Element | undefined) => act(async () => (el as HTMLElement).click());
const dialog = () => document.querySelector('[role="dialog"]') as HTMLElement;

describe("the version list", () => {
  it("says what each version changed since the one before, and the first says nothing", async () => {
    await render(<WikiCodeSection slug="pollen" section={section} mode="internal" />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("Since v1.2: 2 files · +2 −0");
    expect(text).toContain("Since v1: 1 file · +1 −0");
    expect(text).not.toContain("Since v1.3");
  });

  it("offers Compare only where there are two versions, on the client's page as well", async () => {
    await render(<WikiCodeSection slug="pollen" section={section} mode="public" />);
    expect(buttons().filter((b) => b.textContent?.trim() === "Compare")).toHaveLength(1);
    expect(byText("New version")).toBeUndefined();
  });

  it("gives the filled Download button to the current version only", async () => {
    await render(<WikiCodeSection slug="pollen" section={section} mode="public" />);
    const downloads = buttons().filter((b) => b.textContent?.includes("Download .zip"));
    expect(downloads.map((b) => b.className.includes("bg-[var(--brand-600)]"))).toEqual([true, false, false, false]);
  });

  it("opens the compare view on that version against the one before it", async () => {
    await render(<WikiCodeSection slug="pollen" section={section} mode="public" />);
    await click(buttons().find((b) => b.textContent?.includes("Since v1:")));
    const [from, to] = [...dialog().querySelectorAll("select")] as HTMLSelectElement[];
    expect([from.value, to.value]).toEqual(["v1", "v12"]);
  });
});

describe("CodeCompareDialog", () => {
  it("opens on the current version against the one before it", () => {
    expect(defaultComparePair(versions)).toEqual({ fromId: "v12", toId: "v13" });
    expect(defaultComparePair([versions[2]])).toBeNull();
  });

  it("lists each changed file with its lines, and the release notes of the newer version", async () => {
    await render(<CodeCompareDialog open onClose={() => {}} moduleName="Receiver" versions={versions} />);
    const files = [...dialog().querySelectorAll("[data-diff-file]")].map((el) => el.getAttribute("data-diff-file"));
    expect(files).toEqual(["main.cpp", "config.h"]);
    const added = [...dialog().querySelectorAll('[data-diff-line="add"]')].map((el) => el.textContent);
    expect(added.some((t) => t?.includes("sleep(500);"))).toBe(true);
    expect(dialog().textContent).toContain("What's new in v1.3");
  });

  it("swaps the two versions", async () => {
    await render(<CodeCompareDialog open onClose={() => {}} moduleName="Receiver" versions={versions} />);
    await click(dialog().querySelector('[aria-label="Swap the versions"]')!);
    const [from, to] = [...dialog().querySelectorAll("select")] as HTMLSelectElement[];
    expect([from.value, to.value]).toEqual(["v13", "v12"]);
    expect(dialog().querySelectorAll('[data-diff-line="del"]').length).toBeGreaterThan(0);
  });

  it("says so when both versions hold the same code, and has no patch to download", async () => {
    const same = [versions[1], { ...versions[1], id: "v12b", label: "v1.2.1", isCurrent: true, createdAt: "2026-07-20T00:00:00Z" }];
    await render(<CodeCompareDialog open onClose={() => {}} moduleName="Receiver" versions={same} />);
    expect(dialog().textContent).toContain("v1.2 and v1.2.1 contain the same code.");
    expect(byText("Download .patch", dialog())?.disabled).toBe(true);
  });

  it("folds a very large change until asked", async () => {
    const big = Array.from({ length: FOLD_ABOVE_LINES + 10 }, (_, i) => `line ${i}`).join("\n") + "\n";
    const vs: WikiCodeVersionRecord[] = [
      { ...versions[1], files: [file("x", "big.c", "")] },
      { ...versions[0], files: [file("y", "big.c", big)] },
    ];
    await render(<CodeCompareDialog open onClose={() => {}} moduleName="Receiver" versions={vs} />);
    expect(dialog().querySelectorAll("[data-diff-line]").length).toBe(0);
    await click(byText("Show the changes", dialog()));
    expect(dialog().querySelectorAll('[data-diff-line="add"]').length).toBe(FOLD_ABOVE_LINES + 10);
  });
});

describe("New version", () => {
  it("starts from the current version's files and shows what the draft changes", async () => {
    await render(<WikiCodeSection slug="pollen" section={section} mode="internal" />);
    await click(byText("New version"));
    const names = [...dialog().querySelectorAll('input[placeholder^="filename"]')].map((i) => (i as HTMLInputElement).value);
    expect(names).toEqual(["main.cpp", "config.h"]);
    expect(dialog().querySelector("[data-draft-changes]")?.textContent).toBe("No changes");

    const textarea = dialog().querySelector('textarea[placeholder^="Paste"]') as HTMLTextAreaElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, "setup();\nloop();\nsleep(750);\n");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(dialog().querySelector("[data-draft-changes]")?.textContent).toBe("1 file · +1 −1");

    await click(byText("Start empty instead", dialog()));
    expect(dialog().querySelectorAll('input[placeholder^="filename"]')).toHaveLength(1);
  });

  it("uploaded files replace drafts of the same name and drop a blank starter row", () => {
    const blank = { filename: "", language: "", content: "" };
    const main = { filename: "main.cpp", language: "cpp", content: "old" };
    const upload = [
      { filename: "main.cpp", language: "cpp", content: "new" },
      { filename: "radio.h", language: "cpp", content: "r" },
    ];
    expect(mergeDraftFiles([main, blank], upload).files.map((f) => `${f.filename}:${f.content}`)).toEqual(["main.cpp:new", "radio.h:r"]);
    expect(mergeDraftFiles([blank], []).files).toEqual([blank]);
  });
});
