/**
 * The task form asks "is this already on the board?" and "which category?" before a new
 * task is created. Driven through the real form with its hooks mocked at the module edge.
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import type { TaskDTO } from "@/types/tasks";

const ME = "user-me";
const calls = { create: [] as unknown[], update: [] as unknown[] };

function mkTask(o: Partial<TaskDTO> & { id: string; title: string }): TaskDTO {
  return {
    workspaceId: "w",
    client: { id: "c1", name: "Fellas Loaded", slug: "fellas" },
    assignees: [],
    createdBy: null,
    featureBlock: null,
    parentId: null,
    description: null,
    acceptanceCriteria: null,
    status: "TODO",
    priority: "MEDIUM",
    label: null,
    orderKey: 0,
    dueDate: null,
    startedAt: null,
    completedAt: null,
    archivedAt: null,
    blockedReason: null,
    blockedAt: null,
    blockedResponse: null,
    blockedResponseAt: null,
    commentCount: 0,
    subtaskCount: 0,
    subtaskDoneCount: 0,
    attachmentCount: 0,
    metadata: null,
    scribeSource: null,
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
    ...o,
  } as TaskDTO;
}

const BOARD: TaskDTO[] = [
  mkTask({ id: "mp3", title: "MP3 audio downloads for videos", featureBlock: { id: "new", name: "New Work" } }),
  mkTask({ id: "trial", title: "Backend: Add trial state model", featureBlock: { id: "build", name: "Build" } }),
];

vi.mock("@/hooks/use-backstage", () => ({ useBackstageTeam: () => ({ data: [] }) }));
vi.mock("@/hooks/use-proposals", () => ({
  useClientList: () => ({ data: { clients: [{ id: "c1", name: "Fellas Loaded" }] } }),
}));
vi.mock("@/hooks/use-account", () => ({ useAccount: () => ({ data: { id: ME } }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ success: () => {}, error: () => {}, info: () => {} }) }));
vi.mock("@/components/proposals/markdown-field", () => ({ MarkdownField: () => null }));
vi.mock("@/hooks/use-tasks", () => ({
  useTasks: () => ({ data: BOARD }),
  useFeatureBlocks: () => ({
    data: [
      { id: "new", name: "New Work" },
      { id: "build", name: "Build" },
    ],
  }),
  useCreateTask: () => ({
    isPending: false,
    mutateAsync: async (input: unknown) => {
      calls.create.push(input);
      return mkTask({ id: "created", title: "x" });
    },
  }),
  useUpdateTask: () => ({
    isPending: false,
    variables: undefined,
    mutateAsync: async (input: unknown) => {
      calls.update.push(input);
      return BOARD[0];
    },
  }),
}));

import { TaskFormModal } from "../task-form";

let root: Root;
let host: HTMLDivElement;
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  calls.create.length = 0;
  calls.update.length = 0;
});

async function open(props: Partial<Parameters<typeof TaskFormModal>[0]> = {}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const onClose = vi.fn();
  await act(async () => {
    root.render(<TaskFormModal defaultClientId="c1" lockClient onClose={onClose} {...props} />);
  });
  return onClose;
}

async function typeTitle(value: string) {
  const input = host.querySelector<HTMLInputElement>('input[placeholder="What needs doing?"]')!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const button = (label: RegExp) =>
  [...host.querySelectorAll("button")].find((b) => label.test(b.textContent ?? ""))!;
const categorySelect = () =>
  [...host.querySelectorAll("select")].find((s) => s.querySelector('option[value="__not_planned__"]'))!;

describe("task form — plan first", () => {
  it("⚠️ offers the planned task, and Pick up assigns it to me and starts it", async () => {
    const onClose = await open();
    await typeTitle("Test audio and video download flow");
    expect(host.querySelector("[data-plan-matches]")?.textContent).toContain("MP3 audio downloads for videos");
    await act(async () => button(/^Pick up$/).click());
    expect(calls.update).toEqual([{ id: "mp3", input: { assigneeIds: [ME], status: "DOING" } }]);
    expect(calls.create).toEqual([]);
    expect(onClose).toHaveBeenCalled();
  });

  it("pre-selects the suggested category and says why", async () => {
    await open();
    await typeTitle("Add download progress indicators for audio and video files");
    expect(categorySelect().value).toBe("new");
    expect(host.textContent).toContain("Suggested · Similar to “MP3 audio downloads for videos”");
  });

  it("⚠️ won't create a task without a category decision", async () => {
    await open();
    await typeTitle("Something unrelated entirely");
    expect(categorySelect().value).toBe("");
    await act(async () => button(/^Create task$/).click());
    expect(calls.create).toEqual([]);
    expect(host.textContent).toContain("Choose the category this belongs to");
  });

  it("'Not part of the plan' is an explicit choice, saved as no category", async () => {
    await open();
    await typeTitle("Something unrelated entirely");
    await act(async () => {
      const s = categorySelect();
      s.value = "__not_planned__";
      s.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => button(/^Create task$/).click());
    expect((calls.create[0] as { featureBlockId: unknown }).featureBlockId).toBeNull();
  });

  it("'It's new' hides the suggestions for this title", async () => {
    await open();
    await typeTitle("Test audio and video download flow");
    await act(async () => button(/It's new/).click());
    expect(host.querySelector("[data-plan-matches]")).toBeNull();
  });

  it("editing an existing task shows no suggestions and keeps its category", async () => {
    await open({ task: BOARD[1] });
    expect(host.querySelector("[data-plan-matches]")).toBeNull();
    expect(categorySelect().value).toBe("build");
  });

  it("skipPlanMatches: My Day already asked, so the form doesn't ask again", async () => {
    await open({ skipPlanMatches: true, defaultTitle: "Test audio and video download flow" });
    expect(host.querySelector("[data-plan-matches]")).toBeNull();
  });
});
