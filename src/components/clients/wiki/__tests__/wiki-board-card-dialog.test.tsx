// @vitest-environment jsdom
/**
 * The Board's card dialog (§126): one dialog adds, reads and edits a card. These pin what each
 * viewer can change from it, and that an edit sends exactly the field that changed.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => [] as Array<{ url: string; init?: RequestInit }>);
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (init?.method === "DELETE" && url.includes("/images/")) return { card: { ...CARD, images: [] } };
    if (init?.method === "POST" && url.endsWith("/board/tasks")) {
      return { card: { ...CARD, subtasks: [...SUBTASKS, { id: "s2", title: "Brand new", done: false, isItem: true }] } };
    }
    if (!init?.method && url.endsWith("/tasks/s1")) return { card: SUB_ITEM };
    if (init?.method === "PATCH") {
      const body = JSON.parse(String(init.body));
      return { card: { ...CARD, ...body } };
    }
    return { feedback: [] };
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ success() {}, error() {} }) }));

import { WikiBoardCardDialog } from "@/components/clients/wiki/wiki-board-card-dialog";
import type { WikiBoardCard, WikiBoardSection } from "@/types/wiki-board";

const CARD: WikiBoardCard = {
  id: "c1",
  title: "Course record leaderboard",
  itemType: "feature",
  tier: null,
  area: "Rounds",
  list: "Front-end backlog",
  priority: "MEDIUM",
  estimateHours: null,
  status: "BACKLOG",
  laneKey: "BACKLOG",
  orderKey: 1,
  release: null,
  progress: null,
  dueDate: null,
  people: ["Hassaan B."],
  signOff: null,
  feedbackCount: 0,
  description: "Show the best round.",
  subtasks: [],
  images: [],
  removedImages: [],
  stageHistory: [],
  doneAt: null,
  dependsOn: [],
  isCard: true,
  addedByClient: false,
  updatedAt: "2026-11-18T09:00:00Z",
};
const SUBTASKS: WikiBoardCard["subtasks"] = [
  { id: "s1", title: "Name a saved search", done: false, isItem: true },
  { id: "k1", title: "Team checklist item", done: false, isItem: false },
];
const SUB_ITEM: WikiBoardCard = { ...CARD, id: "s1", title: "Name a saved search", itemType: "subitem", subtasks: [] };
const DEV_TASK: WikiBoardCard = { ...CARD, id: "d1", title: "Rotate the API keys", itemType: null, isCard: false };

const SECTION: WikiBoardSection = {
  enabled: true,
  showAllTasks: false,
  lanes: [
    { key: "BACKLOG", label: "Future Idea", stage: "BACKLOG", columnId: null, canAdd: true, total: { cards: 1, other: 0 }, hidden: { cards: 0, other: 0 }, groups: [] },
    { key: "DONE", label: "Live Features", stage: "DONE", columnId: null, canAdd: false, total: { cards: 0, other: 0 }, hidden: { cards: 0, other: 0 }, groups: [] },
  ],
  releases: [],
  areas: ["Rounds"],
  keyDates: [],
};

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  calls.length = 0;
});
afterEach(() => act(() => root.unmount()));

function open(card: WikiBoardCard, audience: "client" | "team", previewing = false, onSaved: (c: WikiBoardCard) => void = () => undefined) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  act(() =>
    root.render(
      <QueryClientProvider client={qc}>
        <WikiBoardCardDialog
          mode="card"
          card={card}
          cards={[CARD, DEV_TASK]}
          section={SECTION}
          target={audience === "client" ? { mode: "public", token: "tok" } : { mode: "internal", slug: "wedge" }}
          audience={audience}
          previewing={previewing}
          addLanes={SECTION.lanes.filter((l) => l.canAdd)}
          canDelete
          onMove={() => undefined}
          onOpenCard={() => undefined}
          onSaved={onSaved}
          onAdded={() => undefined}
          onDeleted={() => undefined}
          onClose={() => undefined}
        />
      </QueryClientProvider>,
    ),
  );
}

const rail = () => document.querySelector("[data-card-rail]")!;
const railSelects = () => Array.from(rail().querySelectorAll("select")).map((s) => s.getAttribute("aria-label"));

describe("the card dialog", () => {
  it("lets the client change their card's properties in place", () => {
    open(CARD, "client");
    expect(railSelects()).toEqual(expect.arrayContaining(["Type", "Column", "Release", "Priority", "Tier"]));
    expect(document.querySelector("[data-card-title]")).not.toBeNull();
    expect(document.querySelector("[data-board-delete]")).not.toBeNull();
  });

  it("never shows the client who works on a card", () => {
    open(CARD, "client");
    expect(rail().textContent).not.toContain("Hassaan");
    expect(rail().textContent).not.toContain("People");
  });

  it("shows the team who works on it, and a way to the task board", () => {
    open(CARD, "team");
    expect(rail().textContent).toContain("Hassaan B.");
    expect(document.querySelector("[data-card-open-task]")?.getAttribute("href")).toBe("/app/portal/wedge/tasks?task=c1");
  });

  it("gives the client nothing to change on a team dev task", () => {
    open(DEV_TASK, "client");
    expect(railSelects()).toEqual([]);
    expect(document.querySelector("[data-card-title]")).toBeNull();
    expect(document.querySelector("[data-board-delete]")).toBeNull();
    expect(document.querySelector("[data-board-file]")).toBeNull();
  });

  it("lets the team only move a dev task from here", () => {
    open(DEV_TASK, "team");
    expect(railSelects()).toEqual(["Column"]);
  });

  it("is read-only while the team previews the client's view", () => {
    open(CARD, "team", true);
    expect(railSelects()).toEqual([]);
    expect(rail().textContent).not.toContain("Hassaan");
  });

  it("sends exactly the field that changed, through the card's own route", async () => {
    open(CARD, "client");
    const priority = rail().querySelector<HTMLSelectElement>('select[aria-label="Priority"]')!;
    await act(async () => {
      priority.value = "HIGH";
      priority.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const patch = calls.find((c) => c.init?.method === "PATCH");
    expect(patch?.url).toBe("/api/wiki/tok/board/tasks/c1");
    expect(JSON.parse(String(patch?.init?.body))).toEqual({ priority: "HIGH" });
  });
});

describe("screenshots in the card dialog", () => {
  it("takes one off the card only after asking, through the card's own route", async () => {
    open({ ...CARD, images: ["img1"] }, "client");
    act(() => document.querySelector<HTMLButtonElement>("[data-card-image-remove]")!.click());
    expect(document.querySelector("[data-card-image-confirm]")).not.toBeNull();
    expect(calls.some((c) => c.init?.method === "DELETE")).toBe(false);
    const remove = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-card-image-confirm] button")).find((b) => b.textContent === "Remove")!;
    await act(async () => remove.click());
    const del = calls.find((c) => c.init?.method === "DELETE");
    expect(del?.url).toBe("/api/wiki/tok/board/tasks/c1/images/img1");
    expect(document.querySelector("[data-card-image]")).toBeNull();
  });

  it("offers the client no way to take one off a team dev task", () => {
    open({ ...DEV_TASK, images: ["img1"] }, "client");
    expect(document.querySelector("[data-card-image-remove]")).toBeNull();
  });
});

describe("sub-items in the card dialog", () => {
  it("opens a product sub-item in the same popup, and Back returns to the feature", async () => {
    open({ ...CARD, subtasks: SUBTASKS }, "client");
    // Only the product sub-item opens; the team's checklist item is listed, not a button.
    expect(document.querySelectorAll("[data-card-subitem]")).toHaveLength(1);
    await act(async () => document.querySelector<HTMLButtonElement>("[data-card-subitem]")!.click());
    expect(calls.some((c) => !c.init?.method && c.url === "/api/wiki/tok/board/tasks/s1")).toBe(true);
    expect(document.querySelector<HTMLTextAreaElement>("[data-card-title]")?.value).toBe("Name a saved search");
    expect(document.querySelector("[data-card-back]")?.textContent).toContain("Course record leaderboard");
    // A sub-item stays a sub-item: its type isn't offered.
    expect(railSelects()).not.toContain("Type");
    act(() => document.querySelector<HTMLButtonElement>("[data-card-back]")!.click());
    expect(document.querySelector<HTMLTextAreaElement>("[data-card-title]")?.value).toBe("Course record leaderboard");
  });

  it("adds a sub-item under the feature and opens it", async () => {
    open({ ...CARD, subtasks: SUBTASKS }, "client");
    const input = document.querySelector<HTMLInputElement>("[data-card-subitem-add]")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "Brand new");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    const post = calls.find((c) => c.init?.method === "POST" && c.url.endsWith("/board/tasks"));
    expect(JSON.parse(String(post?.init?.body))).toMatchObject({ title: "Brand new", itemType: "subitem", parentId: "c1" });
    expect(calls.some((c) => !c.init?.method && c.url === "/api/wiki/tok/board/tasks/s2")).toBe(true);
  });
});

describe("signing a card off", () => {
  const composer = () => document.querySelector("[data-card-composer]")!;
  const signOff = () => document.querySelector("[data-card-sign-off]")!;
  const labels = (el: Element) => Array.from(el.querySelectorAll("button")).map((b) => b.textContent?.trim());

  it("puts Changes needed and Approve in the bottom bar, and no Comment button for the client", () => {
    open(CARD, "client");
    expect(document.querySelector("[data-card-dialog-footer] [data-card-sign-off]")).not.toBeNull();
    expect(labels(signOff())).toEqual(["Changes needed", "Approve"]);
    expect(labels(composer())).toEqual([]);
  });

  it("turns Approve into Approved at once, and tells the board, with no reload", async () => {
    const saved: WikiBoardCard[] = [];
    open(CARD, "client", false, (c) => saved.push(c));
    await act(async () => (signOff().querySelector("[data-sign-off-approve]") as HTMLButtonElement).click());
    expect(calls.some((c) => c.init?.method === "POST" && c.url.endsWith("/board/tasks/c1/feedback"))).toBe(true);
    expect(signOff().querySelector("[data-sign-off-approved]")?.textContent).toContain("Approved");
    expect(signOff().querySelector("[data-sign-off-approve]")).toBeNull();
    expect(saved.at(-1)).toMatchObject({ id: "c1", signOff: "approved", feedbackCount: 1 });
  });

  it("opens an approved card already showing Approved", () => {
    open({ ...CARD, signOff: "approved" }, "client");
    expect(signOff().querySelector("[data-sign-off-approved]")).not.toBeNull();
  });

  it("gives the team Reply beside the note box, and sign-off in the bottom bar", async () => {
    open(CARD, "team");
    expect(labels(composer())).toEqual(["Reply"]);
    expect(labels(signOff())).toEqual(["Changes needed", "Approve"]);
    await act(async () => (signOff().querySelector("[data-sign-off-approve]") as HTMLButtonElement).click());
    const post = calls.find((c) => c.init?.method === "POST" && c.url.endsWith("/tasks/c1/client-feedback"));
    expect(JSON.parse(String(post?.init?.body))).toMatchObject({ kind: "approved" });
    expect(signOff().querySelector("[data-sign-off-approved]")).not.toBeNull();
  });
});
