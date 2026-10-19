/**
 * The reply transcript: a deleted reply reads "Reply deleted" and shows nothing of
 * what it said; Edit/Delete appear only on replies the viewer may change; editing
 * saves through onEdit; a screenshot thumbnail opens the viewer.
 *
 * @vitest-environment jsdom
 */
import React, { act } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { RequestThread } from "../request-thread";
import type { WikiIntakeCommentRecord } from "@/lib/api";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

function reply(over: Partial<WikiIntakeCommentRecord> = {}): WikiIntakeCommentRecord {
  return {
    id: "c1",
    authorKind: "TEAM",
    authorName: "Harry Brown",
    body: "Picked this up.",
    mentions: [],
    createdAt: new Date().toISOString(),
    editedAt: null,
    deleted: false,
    hasImage: false,
    imageFilename: null,
    canEdit: false,
    canDelete: false,
    ...over,
  };
}

function renderThread(
  comments: WikiIntakeCommentRecord[],
  extra: Partial<React.ComponentProps<typeof RequestThread>> = {},
) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <RequestThread
        itemTitle="Search is broken"
        comments={comments}
        mentionables={undefined}
        mentionablesLoading={false}
        onOpen={() => {}}
        onPost={async () => {}}
        imageSrc={(id, o) => `/img/${id}${o?.thumb ? "?thumb=1" : ""}`}
        {...extra}
      />,
    ),
  );
  return host;
}

function buttons(name: string): HTMLButtonElement[] {
  return [...document.querySelectorAll("button")].filter((b) => b.textContent?.trim() === name);
}

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function typeInto(el: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("RequestThread — deleted replies", () => {
  it("renders 'Reply deleted' and no body, image or actions", () => {
    const host = renderThread([
      reply({ id: "c9", deleted: true, body: "", authorName: "Marcus Webb", hasImage: false }),
    ]);
    expect(host.textContent).toContain("Reply deleted");
    expect(buttons("Edit")).toHaveLength(0);
    expect(buttons("Delete")).toHaveLength(0);
    expect(host.querySelector("ol img")).toBeNull();
  });
});

describe("RequestThread — own replies", () => {
  it("shows Edit/Delete only on replies the viewer may change", () => {
    renderThread([
      reply({ id: "mine", body: "Mine", canEdit: true, canDelete: true }),
      reply({ id: "theirs", body: "Theirs" }),
    ]);
    expect(buttons("Edit")).toHaveLength(1);
    expect(buttons("Delete")).toHaveLength(1);
  });

  it("an admin sees Delete but not Edit on someone else's reply", () => {
    renderThread([reply({ canEdit: false, canDelete: true })]);
    expect(buttons("Edit")).toHaveLength(0);
    expect(buttons("Delete")).toHaveLength(1);
  });

  it("edits in place and saves through onEdit", async () => {
    const onEdit = vi.fn(async () => {});
    renderThread([reply({ canEdit: true, canDelete: true })], { onEdit });
    click(buttons("Edit")[0]);
    const box = document.querySelector('textarea[aria-label="Edit reply"]') as HTMLTextAreaElement;
    expect(box.value).toBe("Picked this up.");
    typeInto(box, "Picked this up — done.");
    click(buttons("Save")[0]);
    await flush();
    expect(onEdit).toHaveBeenCalledWith("c1", "Picked this up — done.", []);
  });

  it("asks before deleting", async () => {
    const onDelete = vi.fn(async () => {});
    const host = renderThread([reply({ canEdit: true, canDelete: true })], { onDelete });
    click(buttons("Delete")[0]);
    expect(onDelete).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Delete this reply?");
    click(buttons("Delete")[0]);
    await flush();
    expect(onDelete).toHaveBeenCalledWith("c1");
  });

  it("marks an edited reply", () => {
    const host = renderThread([reply({ editedAt: new Date().toISOString() })]);
    expect(host.textContent).toContain("· edited");
  });
});

describe("RequestThread — screenshots", () => {
  it("shows a reply's thumbnail and opens the full image", () => {
    const onViewImage = vi.fn();
    const host = renderThread([reply({ hasImage: true, imageFilename: "shot.png" })], { onViewImage });
    const img = host.querySelector("ol img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/img/c1?thumb=1");
    click(img);
    expect(onViewImage).toHaveBeenCalledWith("/img/c1");
  });

  it("sends the chosen screenshot with the reply", async () => {
    const onPost = vi.fn(async () => {});
    renderThread([], { onPost });
    const file = new File(["png"], "shot.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    act(() => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    typeInto(document.querySelector('textarea[aria-label="Reply to Search is broken"]') as HTMLTextAreaElement, "See attached");
    click(buttons("Reply")[0]);
    await flush();
    expect(onPost).toHaveBeenCalledWith("See attached", [], file);
  });
});

describe("RequestThread — screenshot-only replies", () => {
  function attach(file: File) {
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    act(() => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  it("keeps Reply disabled with neither text nor a screenshot", () => {
    renderThread([]);
    expect(buttons("Reply")[0].disabled).toBe(true);
  });

  it("enables Reply for a screenshot with no text, and posts it with an empty body", async () => {
    const onPost = vi.fn(async () => {});
    renderThread([], { onPost });
    const file = new File(["png"], "shot.png", { type: "image/png" });
    attach(file);
    const send = buttons("Reply")[0];
    expect(send.disabled).toBe(false);
    click(send);
    await flush();
    expect(onPost).toHaveBeenCalledWith("", [], file);
  });

  it("renders a screenshot-only reply as just the screenshot, with no empty paragraph", () => {
    const host = renderThread([reply({ body: "", hasImage: true, imageFilename: "shot.png" })]);
    expect(host.querySelector("ol p.whitespace-pre-wrap")).toBeNull();
    expect(host.querySelector("ol img")).not.toBeNull();
  });
});
